import type {OutputPluginContext} from '@truenine/plugin-shared'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {collectFileNames, createMockProject, createMockRulePrompt} from '@truenine/plugin-shared'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {OpencodeCLIOutputPlugin} from './OpencodeCLIOutputPlugin'

class TestableOpencodeCLIOutputPlugin extends OpencodeCLIOutputPlugin {
  private mockHomeDir: string | null = null

  public setMockHomeDir(dir: string | null): void {
    this.mockHomeDir = dir
  }

  protected override getHomeDir(): string {
    if (this.mockHomeDir != null) return this.mockHomeDir
    return super.getHomeDir()
  }
}

function createMockContext(
  tempDir: string,
  rules: unknown[],
  projects: unknown[]
): OutputPluginContext {
  return {
    collectedInputContext: {
      workspace: {
        projects: projects as never,
        directory: {
          pathKind: 1,
          path: tempDir,
          basePath: tempDir,
          getDirectoryName: () => 'workspace',
          getAbsolutePath: () => tempDir
        }
      },
      ideConfigFiles: [],
      rules: rules as never,
      fastCommands: [],
      skills: [],
      globalMemory: void 0,
      aiAgentIgnoreConfigFiles: [],
      subAgents: []
    },
    logger: {
      debug: vi.fn(),
      trace: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    } as never,
    fs,
    path,
    glob: vi.fn() as never
  }
}

describe('opencodeCLIOutputPlugin - projectConfig filtering', () => {
  let tempDir: string,
    plugin: TestableOpencodeCLIOutputPlugin

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opencode-proj-config-test-'))
    plugin = new TestableOpencodeCLIOutputPlugin()
    plugin.setMockHomeDir(tempDir)
  })

  afterEach(() => {
    try {
      fs.rmSync(tempDir, {recursive: true, force: true})
    }
    catch {}
  })

  describe('registerProjectOutputFiles', () => {
    it('should include all project rules when no projectConfig', async () => {
      const rules = [
        createMockRulePrompt('test', 'rule1', 'uniapp', 'project'),
        createMockRulePrompt('test', 'rule2', 'vue', 'project')
      ]
      const projects = [createMockProject('proj1', tempDir, 'proj1')]
      const ctx = createMockContext(tempDir, rules, projects)

      const results = await plugin.registerProjectOutputFiles(ctx)
      const fileNames = collectFileNames(results)

      expect(fileNames).toContain('rule-test-rule1.md')
      expect(fileNames).toContain('rule-test-rule2.md')
    })

    it('should filter rules by include in projectConfig', async () => {
      const rules = [
        createMockRulePrompt('test', 'rule1', 'uniapp', 'project'),
        createMockRulePrompt('test', 'rule2', 'vue', 'project')
      ]
      const projects = [
        createMockProject('proj1', tempDir, 'proj1', {rules: {includeSeries: ['uniapp']}})
      ]
      const ctx = createMockContext(tempDir, rules, projects)

      const results = await plugin.registerProjectOutputFiles(ctx)
      const fileNames = collectFileNames(results)

      expect(fileNames).toContain('rule-test-rule1.md')
      expect(fileNames).not.toContain('rule-test-rule2.md')
    })

    it('should filter rules by includeSeries excluding non-matching series', async () => {
      const rules = [
        createMockRulePrompt('test', 'rule1', 'uniapp', 'project'),
        createMockRulePrompt('test', 'rule2', 'vue', 'project')
      ]
      const projects = [
        createMockProject('proj1', tempDir, 'proj1', {rules: {includeSeries: ['vue']}})
      ]
      const ctx = createMockContext(tempDir, rules, projects)

      const results = await plugin.registerProjectOutputFiles(ctx)
      const fileNames = collectFileNames(results)

      expect(fileNames).not.toContain('rule-test-rule1.md')
      expect(fileNames).toContain('rule-test-rule2.md')
    })

    it('should include rules without seriName regardless of include filter', async () => {
      const rules = [
        createMockRulePrompt('test', 'rule1', void 0, 'project'),
        createMockRulePrompt('test', 'rule2', 'vue', 'project')
      ]
      const projects = [
        createMockProject('proj1', tempDir, 'proj1', {rules: {includeSeries: ['uniapp']}})
      ]
      const ctx = createMockContext(tempDir, rules, projects)

      const results = await plugin.registerProjectOutputFiles(ctx)
      const fileNames = collectFileNames(results)

      expect(fileNames).toContain('rule-test-rule1.md')
      expect(fileNames).not.toContain('rule-test-rule2.md')
    })

    it('should filter independently for each project', async () => {
      const rules = [
        createMockRulePrompt('test', 'rule1', 'uniapp', 'project'),
        createMockRulePrompt('test', 'rule2', 'vue', 'project')
      ]
      const projects = [
        createMockProject('proj1', tempDir, 'proj1', {rules: {includeSeries: ['uniapp']}}),
        createMockProject('proj2', tempDir, 'proj2', {rules: {includeSeries: ['vue']}})
      ]
      const ctx = createMockContext(tempDir, rules, projects)

      const results = await plugin.registerProjectOutputFiles(ctx)
      const fileNames = results.map(r => ({
        path: r.path,
        fileName: r.path.split(/[/\\]/).pop()
      }))

      expect(fileNames.some(f => f.path.includes('proj1') && f.fileName === 'rule-test-rule1.md')).toBe(true)
      expect(fileNames.some(f => f.path.includes('proj1') && f.fileName === 'rule-test-rule2.md')).toBe(false)
      expect(fileNames.some(f => f.path.includes('proj2') && f.fileName === 'rule-test-rule2.md')).toBe(true)
      expect(fileNames.some(f => f.path.includes('proj2') && f.fileName === 'rule-test-rule1.md')).toBe(false)
    })

    it('should return empty when include matches nothing', async () => {
      const rules = [
        createMockRulePrompt('test', 'rule1', 'uniapp', 'project')
      ]
      const projects = [
        createMockProject('proj1', tempDir, 'proj1', {rules: {includeSeries: ['react']}})
      ]
      const ctx = createMockContext(tempDir, rules, projects)

      const results = await plugin.registerProjectOutputFiles(ctx)
      const ruleFiles = results.filter(r => r.path.includes('rule-'))

      expect(ruleFiles).toHaveLength(0)
    })
  })

  describe('registerProjectOutputDirs', () => {
    it('should not register rules dir when all rules filtered out', async () => {
      const rules = [
        createMockRulePrompt('test', 'rule1', 'uniapp', 'project')
      ]
      const projects = [
        createMockProject('proj1', tempDir, 'proj1', {rules: {includeSeries: ['react']}})
      ]
      const ctx = createMockContext(tempDir, rules, projects)

      const results = await plugin.registerProjectOutputDirs(ctx)
      const rulesDirs = results.filter(r => r.path.includes('rules'))

      expect(rulesDirs).toHaveLength(0)
    })

    it('should register rules dir when rules match filter', async () => {
      const rules = [
        createMockRulePrompt('test', 'rule1', 'uniapp', 'project')
      ]
      const projects = [
        createMockProject('proj1', tempDir, 'proj1', {rules: {includeSeries: ['uniapp']}})
      ]
      const ctx = createMockContext(tempDir, rules, projects)

      const results = await plugin.registerProjectOutputDirs(ctx)
      const rulesDirs = results.filter(r => r.path.includes('rules'))

      expect(rulesDirs.length).toBeGreaterThan(0)
    })
  })

  describe('project rules directory path', () => {
    it('should use .opencode/rules/ for project rules', async () => {
      const rules = [
        createMockRulePrompt('test', 'rule1', 'uniapp', 'project')
      ]
      const projects = [createMockProject('proj1', tempDir, 'proj1')]
      const ctx = createMockContext(tempDir, rules, projects)

      const results = await plugin.registerProjectOutputFiles(ctx)
      const ruleFile = results.find(r => r.path.includes('rule-test-rule1.md'))

      expect(ruleFile).toBeDefined()
      expect(ruleFile?.path).toContain('.opencode')
      expect(ruleFile?.path).toContain('rules')
    })
  })
})
