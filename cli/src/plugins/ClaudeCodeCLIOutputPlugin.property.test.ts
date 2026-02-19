import type {CollectedInputContext, OutputPluginContext, Project, RulePrompt} from '@/types'
import type {RelativePath, RootPath} from '@/types/FileSystemTypes'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import * as fc from 'fast-check'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {FilePathKind, NamingCaseKind, PromptKind} from '@/types'
import {ClaudeCodeCLIOutputPlugin} from './ClaudeCodeCLIOutputPlugin'

function createMockRelativePath(pathStr: string, basePath: string): RelativePath {
  return {pathKind: FilePathKind.Relative, path: pathStr, basePath, getDirectoryName: () => pathStr, getAbsolutePath: () => path.join(basePath, pathStr)}
}

class TestablePlugin extends ClaudeCodeCLIOutputPlugin {
  private mockHomeDir: string | null = null
  public setMockHomeDir(dir: string | null): void { this.mockHomeDir = dir }
  protected override getHomeDir(): string { return this.mockHomeDir ?? super.getHomeDir() }
  public testBuildRuleFileName(rule: RulePrompt): string { return (this as any).buildRuleFileName(rule) }
  public testBuildRuleContent(rule: RulePrompt): string { return (this as any).buildRuleContent(rule) }
}

function createMockRulePrompt(opts: {series: string, ruleName: string, globs: readonly string[], scope?: 'global' | 'project', content?: string}): RulePrompt {
  const content = opts.content ?? '# Rule body'
  return {type: PromptKind.Rule, content, length: content.length, filePathKind: FilePathKind.Relative, dir: createMockRelativePath('.', ''), markdownContents: [], yamlFrontMatter: {description: 'ignored', globs: opts.globs}, series: opts.series, ruleName: opts.ruleName, globs: opts.globs, scope: opts.scope ?? 'global'} as RulePrompt
}

const seriesGen = fc.stringMatching(/^[a-z0-9]{1,5}$/)
const ruleNameGen = fc.stringMatching(/^[a-z][a-z0-9-]{0,14}$/)
const globGen = fc.stringMatching(/^[a-z*/.]{1,30}$/).filter(s => s.length > 0)
const globsGen = fc.array(globGen, {minLength: 1, maxLength: 5})
const contentGen = fc.string({minLength: 1, maxLength: 200}).filter(s => s.trim().length > 0)

describe('claudeCodeCLIOutputPlugin property tests', () => {
  let tempDir: string, plugin: TestablePlugin, mockContext: OutputPluginContext

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-prop-'))
    plugin = new TestablePlugin()
    plugin.setMockHomeDir(tempDir)
    mockContext = {
      collectedInputContext: {
        workspace: {projects: [], directory: createMockRelativePath('.', tempDir)},
        globalMemory: {type: PromptKind.GlobalMemory, content: 'mem', filePathKind: FilePathKind.Absolute, dir: createMockRelativePath('.', tempDir), markdownContents: []},
        fastCommands: [],
        subAgents: [],
        skills: []
      } as unknown as CollectedInputContext,
      logger: {debug: vi.fn(), trace: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn()} as any,
      fs,
      path,
      glob: {} as any
    }
  }, 30000)

  afterEach(() => {
    try { fs.rmSync(tempDir, {recursive: true, force: true}) }
    catch {}
  })

  describe('rule file name format', () => {
    it('should always produce rule-{series}-{ruleName}.md', async () => {
      await fc.assert(fc.asyncProperty(seriesGen, ruleNameGen, async (series, ruleName) => {
        const rule = createMockRulePrompt({series, ruleName, globs: []})
        const fileName = plugin.testBuildRuleFileName(rule)
        expect(fileName).toBe(`rule-${series}-${ruleName}.md`)
        expect(fileName).toMatch(/^rule-.[^-\n\r\u2028\u2029]*-.+\.md$/)
      }), {numRuns: 100})
    })
  })

  describe('rule content format constraints', () => {
    it('should never contain globs field in frontmatter', async () => {
      await fc.assert(fc.asyncProperty(seriesGen, ruleNameGen, globsGen, contentGen, async (series, ruleName, globs, content) => {
        const rule = createMockRulePrompt({series, ruleName, globs, content})
        const output = plugin.testBuildRuleContent(rule)
        expect(output).not.toMatch(/^globs:/m)
      }), {numRuns: 100})
    })

    it('should use paths field when globs are present', async () => {
      await fc.assert(fc.asyncProperty(seriesGen, ruleNameGen, globsGen, contentGen, async (series, ruleName, globs, content) => {
        const rule = createMockRulePrompt({series, ruleName, globs, content})
        const output = plugin.testBuildRuleContent(rule)
        expect(output).toContain('paths:')
      }), {numRuns: 100})
    })

    it('should wrap frontmatter in --- delimiters when globs exist', async () => {
      await fc.assert(fc.asyncProperty(seriesGen, ruleNameGen, globsGen, contentGen, async (series, ruleName, globs, content) => {
        const rule = createMockRulePrompt({series, ruleName, globs, content})
        const output = plugin.testBuildRuleContent(rule)
        const lines = output.split('\n')
        expect(lines[0]).toBe('---')
        expect(lines.indexOf('---', 1)).toBeGreaterThan(0)
      }), {numRuns: 100})
    })

    it('should have no frontmatter when globs are empty', async () => {
      await fc.assert(fc.asyncProperty(seriesGen, ruleNameGen, contentGen, async (series, ruleName, content) => {
        const rule = createMockRulePrompt({series, ruleName, globs: [], content})
        const output = plugin.testBuildRuleContent(rule)
        expect(output).not.toContain('---')
        expect(output).toBe(content)
      }), {numRuns: 100})
    })

    it('should preserve rule body content after frontmatter', async () => {
      await fc.assert(fc.asyncProperty(seriesGen, ruleNameGen, globsGen, contentGen, async (series, ruleName, globs, content) => {
        const rule = createMockRulePrompt({series, ruleName, globs, content})
        const output = plugin.testBuildRuleContent(rule)
        expect(output).toContain(content)
      }), {numRuns: 100})
    })

    it('should list each glob as a YAML array item under paths', async () => {
      await fc.assert(fc.asyncProperty(seriesGen, ruleNameGen, globsGen, contentGen, async (series, ruleName, globs, content) => {
        const rule = createMockRulePrompt({series, ruleName, globs, content})
        const output = plugin.testBuildRuleContent(rule)
        for (const g of globs) expect(output).toContain(`- "${g}"`)
      }), {numRuns: 100})
    })
  })

  describe('write output format verification', () => {
    it('should write global rule files with correct format to ~/.claude/rules/', async () => {
      await fc.assert(fc.asyncProperty(seriesGen, ruleNameGen, globsGen, contentGen, async (series, ruleName, globs, content) => {
        const rule = createMockRulePrompt({series, ruleName, globs, scope: 'global', content})
        const ctx = {...mockContext, collectedInputContext: {...mockContext.collectedInputContext, rules: [rule]}} as any
        await plugin.writeGlobalOutputs(ctx)
        const filePath = path.join(tempDir, '.claude', 'rules', `rule-${series}-${ruleName}.md`)
        expect(fs.existsSync(filePath)).toBe(true)
        const written = fs.readFileSync(filePath, 'utf8')
        expect(written).toContain('paths:')
        expect(written).not.toMatch(/^globs:/m)
        expect(written).toContain(content)
        for (const g of globs) expect(written).toContain(`- "${g}"`)
      }), {numRuns: 30})
    })

    it('should write project rule files to {project}/.claude/rules/', async () => {
      await fc.assert(fc.asyncProperty(seriesGen, ruleNameGen, globsGen, contentGen, async (series, ruleName, globs, content) => {
        const mockProject: Project = {
          name: 'proj',
          dirFromWorkspacePath: createMockRelativePath('proj', tempDir),
          rootMemoryPrompt: {type: PromptKind.ProjectRootMemory, content: '', filePathKind: FilePathKind.Root, dir: createMockRelativePath('.', tempDir) as unknown as RootPath, markdownContents: [], length: 0, yamlFrontMatter: {namingCase: NamingCaseKind.KebabCase}},
          childMemoryPrompts: [],
          sourceFiles: []
        }
        const rule = createMockRulePrompt({series, ruleName, globs, scope: 'project', content})
        const ctx = {...mockContext, collectedInputContext: {...mockContext.collectedInputContext, workspace: {...mockContext.collectedInputContext.workspace, projects: [mockProject]}, rules: [rule]}} as any
        await plugin.writeProjectOutputs(ctx)
        const filePath = path.join(tempDir, 'proj', '.claude', 'rules', `rule-${series}-${ruleName}.md`)
        expect(fs.existsSync(filePath)).toBe(true)
        const written = fs.readFileSync(filePath, 'utf8')
        expect(written).toContain('paths:')
        expect(written).toContain(content)
        for (const g of globs) expect(written).toContain(`- "${g}"`)
      }), {numRuns: 30})
    })
  })
})
