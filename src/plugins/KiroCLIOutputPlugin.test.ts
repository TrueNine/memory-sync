import type { CollectedInputContext, FastCommandPrompt, OutputPluginContext, SkillYAMLFrontMatter } from '@/types'
import type { RelativePath } from '@/types/FileSystemTypes'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import * as fc from 'fast-check'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FilePathKind, PromptKind } from '@/types'
import { KiroCLIOutputPlugin } from './KiroCLIOutputPlugin'

function createMockRelativePath(pathStr: string, basePath: string): RelativePath {
  return {
    pathKind: FilePathKind.Relative,
    path: pathStr,
    basePath,
    getDirectoryName: () => pathStr,
    getAbsolutePath: () => `${basePath}/${pathStr}`,
  }
}

function createMockFastCommandPrompt(
  series: string | undefined,
  commandName: string,
): FastCommandPrompt {
  return {
    type: PromptKind.FastCommand,
    series,
    commandName,
    content: '',
    length: 0,
    filePathKind: FilePathKind.Relative,
    dir: createMockRelativePath('.', '/test'),
    markdownContents: [],
  } as FastCommandPrompt
}

// Create a testable subclass to expose private methods
class TestableKiroCLIOutputPlugin extends KiroCLIOutputPlugin {
  private mockHomeDir: string | null = null

  public testBuildFastCommandSteeringFileName(cmd: FastCommandPrompt): string {
    // Access private method via any cast
    return (this as any).buildFastCommandSteeringFileName(cmd)
  }

  public testBuildPowerFrontMatter(frontMatter: SkillYAMLFrontMatter): string {
    // Access private method via any cast
    return (this as any).buildPowerFrontMatter(frontMatter)
  }

  public testListInstalledPowers(powersDir: string): string[] {
    // Access private method via any cast
    return (this as any).listInstalledPowers(powersDir)
  }

  public async testWriteSkillMcpConfig(
    ctx: any,
    skill: any,
    powerDir: string,
  ): Promise<any> {
    // Access private method via any cast
    return (this as any).writeSkillMcpConfig(ctx, skill, powerDir)
  }

  public setMockHomeDir(dir: string | null): void {
    this.mockHomeDir = dir
  }

  // Override getHomeDir to allow mocking in tests
  protected override getHomeDir(): string {
    if (this.mockHomeDir != null) {
      return this.mockHomeDir
    }
    return super.getHomeDir()
  }
}

describe('kiroCLIOutputPlugin', () => {
  /**
   * Feature: fast-command-series, Property 6: Kiro Underscore to Hyphen Transformation
   * Validates: Requirements 4.1, 4.2
   *
   * For any fast command processed by KiroCLIOutputPlugin,
   * all underscores in the output filename SHALL be replaced with hyphens.
   */
  describe('buildFastCommandSteeringFileName', () => {
    // Generator for alphanumeric strings without underscore (for series prefix)
    const alphanumericNoUnderscore = fc.string({ minLength: 1, maxLength: 10, unit: 'grapheme-ascii' })
      .filter((s) => /^[a-z0-9]+$/i.test(s))

    // Generator for alphanumeric strings (for command name)
    const alphanumericCommandName = fc.string({ minLength: 1, maxLength: 20, unit: 'grapheme-ascii' })
      .filter((s) => /^\w+$/.test(s))

    it('should use hyphen separator between series and command name', () => {
      fc.assert(
        fc.property(
          alphanumericNoUnderscore,
          alphanumericCommandName,
          (series, commandName) => {
            const plugin = new TestableKiroCLIOutputPlugin()
            const cmd = createMockFastCommandPrompt(series, commandName)

            const result = plugin.testBuildFastCommandSteeringFileName(cmd)

            // Should use hyphen separator instead of underscore
            expect(result).toBe(`${series}-${commandName}.md`)
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should return just commandName.md when series is undefined', () => {
      fc.assert(
        fc.property(
          alphanumericCommandName,
          (commandName) => {
            const plugin = new TestableKiroCLIOutputPlugin()
            const cmd = createMockFastCommandPrompt(void 0, commandName)

            const result = plugin.testBuildFastCommandSteeringFileName(cmd)

            // Should return just commandName without any prefix
            expect(result).toBe(`${commandName}.md`)
          },
        ),
        { numRuns: 100 },
      )
    })

    // Unit tests for specific examples
    it('should transform pe_compile to pe-compile.md', () => {
      const plugin = new TestableKiroCLIOutputPlugin()
      const cmd = createMockFastCommandPrompt('pe', 'compile')

      const result = plugin.testBuildFastCommandSteeringFileName(cmd)

      expect(result).toBe('pe-compile.md')
    })

    it('should transform spec_requirement to spec-requirement.md', () => {
      const plugin = new TestableKiroCLIOutputPlugin()
      const cmd = createMockFastCommandPrompt('spec', 'requirement')

      const result = plugin.testBuildFastCommandSteeringFileName(cmd)

      expect(result).toBe('spec-requirement.md')
    })

    it('should handle command without series', () => {
      const plugin = new TestableKiroCLIOutputPlugin()
      const cmd = createMockFastCommandPrompt(void 0, 'compile')

      const result = plugin.testBuildFastCommandSteeringFileName(cmd)

      expect(result).toBe('compile.md')
    })
  })

  /**
   * Feature: kiro-powers-skill-output, POWER.md Front Matter
   * Validates: Requirements for YAML front matter output in POWER.md
   */
  describe('buildPowerFrontMatter', () => {
    it('should include name and description in front matter', () => {
      const plugin = new TestableKiroCLIOutputPlugin()
      const frontMatter = {
        name: 'test-skill',
        description: 'A test skill',
      } as SkillYAMLFrontMatter

      const result = plugin.testBuildPowerFrontMatter(frontMatter)

      expect(result).toContain('---')
      expect(result).toContain('name: test-skill')
      expect(result).toContain('description: A test skill')
    })

    it('should include displayName when provided', () => {
      const plugin = new TestableKiroCLIOutputPlugin()
      const frontMatter = {
        name: 'test-skill',
        description: 'A test skill',
        displayName: 'Test Skill Display',
      } as SkillYAMLFrontMatter

      const result = plugin.testBuildPowerFrontMatter(frontMatter)

      expect(result).toContain('displayName: Test Skill Display')
    })

    it('should include keywords array when provided', () => {
      const plugin = new TestableKiroCLIOutputPlugin()
      const frontMatter = {
        name: 'test-skill',
        description: 'A test skill',
        keywords: ['typescript', 'testing', 'cli'],
      } as SkillYAMLFrontMatter

      const result = plugin.testBuildPowerFrontMatter(frontMatter)

      // YAML library outputs arrays in block style
      expect(result).toContain('keywords:')
      expect(result).toContain('- typescript')
      expect(result).toContain('- testing')
      expect(result).toContain('- cli')
    })

    it('should include author when provided', () => {
      const plugin = new TestableKiroCLIOutputPlugin()
      const frontMatter = {
        name: 'test-skill',
        description: 'A test skill',
        author: 'Test Author',
      } as SkillYAMLFrontMatter

      const result = plugin.testBuildPowerFrontMatter(frontMatter)

      expect(result).toContain('author: Test Author')
    })

    it('should omit optional fields when not provided', () => {
      const plugin = new TestableKiroCLIOutputPlugin()
      const frontMatter = {
        name: 'minimal-skill',
        description: '',
      } as SkillYAMLFrontMatter

      const result = plugin.testBuildPowerFrontMatter(frontMatter)

      expect(result).not.toContain('displayName')
      expect(result).not.toContain('keywords')
      expect(result).not.toContain('author')
    })

    it('should produce valid YAML front matter format', () => {
      const plugin = new TestableKiroCLIOutputPlugin()
      const frontMatter = {
        name: 'full-skill',
        description: 'Full featured skill',
        displayName: 'Full Skill',
        keywords: ['feature', 'complete'],
        author: 'Developer',
      } as SkillYAMLFrontMatter

      const result = plugin.testBuildPowerFrontMatter(frontMatter)

      // Should start and end with ---
      expect(result.startsWith('---')).toBe(true)
      expect(result.endsWith('---')).toBe(true)

      // Should have proper line structure
      const lines = result.split('\n')
      expect(lines[0]).toBe('---')
      expect(lines[lines.length - 1]).toBe('---')
    })
  })

  /**
   * Feature: clean-all-installed-powers
   * Validates: registerGlobalOutputDirs should scan and register ALL installed powers
   * for cleanup, not just the ones in current skills list
   */
  describe('registerGlobalOutputDirs - clean all installed powers', () => {
    let tempDir: string

    beforeEach(() => {
      // Create a temporary directory for testing
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kiro-test-'))
    })

    afterEach(() => {
      // Clean up temporary directory
      if (tempDir && fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true })
      }
    })

    it('should list all installed power directories', () => {
      const plugin = new TestableKiroCLIOutputPlugin()

      // Create mock power directories
      const powersDir = path.join(tempDir, '.kiro', 'powers', 'installed')
      fs.mkdirSync(powersDir, { recursive: true })
      fs.mkdirSync(path.join(powersDir, 'power-a'))
      fs.mkdirSync(path.join(powersDir, 'power-b'))
      fs.mkdirSync(path.join(powersDir, 'old-power'))

      const result = plugin.testListInstalledPowers(powersDir)

      expect(result).toHaveLength(3)
      expect(result).toContain('power-a')
      expect(result).toContain('power-b')
      expect(result).toContain('old-power')
    })

    it('should return empty array when powers directory does not exist', () => {
      const plugin = new TestableKiroCLIOutputPlugin()
      const nonExistentDir = path.join(tempDir, 'non-existent')

      const result = plugin.testListInstalledPowers(nonExistentDir)

      expect(result).toEqual([])
    })

    it('should only list directories, not files', () => {
      const plugin = new TestableKiroCLIOutputPlugin()

      // Create mock power directories and files
      const powersDir = path.join(tempDir, '.kiro', 'powers', 'installed')
      fs.mkdirSync(powersDir, { recursive: true })
      fs.mkdirSync(path.join(powersDir, 'valid-power'))
      fs.writeFileSync(path.join(powersDir, 'not-a-power.txt'), 'content')

      const result = plugin.testListInstalledPowers(powersDir)

      expect(result).toHaveLength(1)
      expect(result).toContain('valid-power')
      expect(result).not.toContain('not-a-power.txt')
    })

    it('should register all installed powers for cleanup in registerGlobalOutputDirs', async () => {
      const plugin = new TestableKiroCLIOutputPlugin()

      // Create mock power directories
      const powersDir = path.join(tempDir, '.kiro', 'powers', 'installed')
      fs.mkdirSync(powersDir, { recursive: true })
      fs.mkdirSync(path.join(powersDir, 'current-skill'))
      fs.mkdirSync(path.join(powersDir, 'old-removed-skill'))
      fs.mkdirSync(path.join(powersDir, 'renamed-skill'))

      // Mock the home directory to use our temp dir
      plugin.setMockHomeDir(tempDir)

      // Create a minimal context with no skills (simulating clean after skills removed)
      const ctx: OutputPluginContext = {
        collectedInputContext: {
          workspace: {
            projects: [],
          },
          // No current skills - simulating clean after skills removed
          skills: [],
        } as unknown as CollectedInputContext,
        logger: { debug: vi.fn(), trace: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any,
        fs,
        path,
      }

      const result = await plugin.registerGlobalOutputDirs(ctx)

      // Should include all installed powers, not just current skills
      const powerDirs = result.filter((r) => r.basePath.includes('powers/installed'))
      expect(powerDirs).toHaveLength(3)

      const powerNames = powerDirs.map((r) => r.path)
      expect(powerNames).toContain('current-skill')
      expect(powerNames).toContain('old-removed-skill')
      expect(powerNames).toContain('renamed-skill')
    })
  })

  /**
   * Feature: skill-mcp-config-output
   * Validates: MCP configuration from skills should be written to each power's directory
   * Path: ~/.kiro/powers/installed/{skill-name}/mcp.json
   */
  describe('mCP configuration output', () => {
    let tempDir: string

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kiro-mcp-test-'))
    })

    afterEach(() => {
      if (tempDir && fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true })
      }
    })

    it('should register mcp.json in power directory when skill has MCP config', async () => {
      const plugin = new TestableKiroCLIOutputPlugin()
      plugin.setMockHomeDir(tempDir)

      const ctx: OutputPluginContext = {
        collectedInputContext: {
          workspace: { projects: [], directory: { path: tempDir, pathKind: FilePathKind.Absolute, getDirectoryName: () => 'test' } },
          ideConfigFiles: [],
          skills: [
            {
              type: PromptKind.Skill,
              yamlFrontMatter: { name: 'test-skill', description: 'Test' },
              content: '# Test',
              length: 6,
              filePathKind: FilePathKind.Relative,
              dir: createMockRelativePath('test-skill', tempDir),
              markdownContents: [],
              mcpConfig: {
                type: PromptKind.SkillMcpConfig,
                mcpServers: {
                  'test-server': { command: 'uvx', args: ['test-package'] },
                },
                rawContent: '{"mcpServers":{"test-server":{"command":"uvx","args":["test-package"]}}}',
              },
            },
          ],
        } as unknown as CollectedInputContext,
        logger: { debug: vi.fn(), trace: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any,
        fs,
        path,
      }

      const result = await plugin.registerGlobalOutputFiles(ctx)

      // Should include mcp.json in the power directory
      const mcpFile = result.find((r) => r.path === 'mcp.json')
      expect(mcpFile).toBeDefined()
      expect(mcpFile?.basePath).toContain('powers/installed/test-skill')
    })

    it('should not register mcp.json when skill has no MCP config', async () => {
      const plugin = new TestableKiroCLIOutputPlugin()
      plugin.setMockHomeDir(tempDir)

      const ctx: OutputPluginContext = {
        collectedInputContext: {
          workspace: { projects: [], directory: { path: tempDir, pathKind: FilePathKind.Absolute, getDirectoryName: () => 'test' } },
          ideConfigFiles: [],
          skills: [
            {
              type: PromptKind.Skill,
              yamlFrontMatter: { name: 'test-skill', description: 'Test' },
              content: '# Test',
              length: 6,
              filePathKind: FilePathKind.Relative,
              dir: createMockRelativePath('test-skill', tempDir),
              markdownContents: [],
              // No mcpConfig
            },
          ],
        } as unknown as CollectedInputContext,
        logger: { debug: vi.fn(), trace: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any,
        fs,
        path,
      }

      const result = await plugin.registerGlobalOutputFiles(ctx)

      // Should NOT include mcp.json
      const mcpFile = result.find((r) => r.path === 'mcp.json')
      expect(mcpFile).toBeUndefined()
    })

    it('should write mcp.json to each power directory with original content', async () => {
      const plugin = new TestableKiroCLIOutputPlugin()
      plugin.setMockHomeDir(tempDir)

      // Create powers directory
      const powersDir = path.join(tempDir, '.kiro', 'powers', 'installed')
      fs.mkdirSync(powersDir, { recursive: true })

      const mcpRawContent = JSON.stringify({
        mcpServers: {
          'my-server': { command: 'uvx', args: ['my-package'], env: { KEY: 'value' } },
        },
      }, null, 2)

      const skill = {
        type: PromptKind.Skill,
        yamlFrontMatter: { name: 'my-skill', description: 'My Skill' },
        content: '# My Skill',
        mcpConfig: {
          type: PromptKind.SkillMcpConfig,
          mcpServers: {
            'my-server': { command: 'uvx', args: ['my-package'], env: { KEY: 'value' } },
          },
          rawContent: mcpRawContent,
        },
      }

      const powerDir = path.join(powersDir, 'my-skill')
      const ctx = { dryRun: false }

      await plugin.testWriteSkillMcpConfig(ctx, skill, powerDir)

      // Check mcp.json was written to power directory
      const mcpConfigPath = path.join(powerDir, 'mcp.json')
      expect(fs.existsSync(mcpConfigPath)).toBe(true)

      // Should preserve original raw content
      const writtenContent = fs.readFileSync(mcpConfigPath, 'utf-8')
      expect(writtenContent).toBe(mcpRawContent)
    })

    it('should register mcp.json for each skill with MCP config separately', async () => {
      const plugin = new TestableKiroCLIOutputPlugin()
      plugin.setMockHomeDir(tempDir)

      const ctx: OutputPluginContext = {
        collectedInputContext: {
          workspace: { projects: [], directory: { path: tempDir, pathKind: FilePathKind.Absolute, getDirectoryName: () => 'test' } },
          ideConfigFiles: [],
          skills: [
            {
              type: PromptKind.Skill,
              yamlFrontMatter: { name: 'skill-a', description: 'Skill A' },
              content: '# Skill A',
              length: 9,
              filePathKind: FilePathKind.Relative,
              dir: createMockRelativePath('skill-a', tempDir),
              markdownContents: [],
              mcpConfig: {
                type: PromptKind.SkillMcpConfig,
                mcpServers: { server1: { command: 'cmd1' } },
                rawContent: '{}',
              },
            },
            {
              type: PromptKind.Skill,
              yamlFrontMatter: { name: 'skill-b', description: 'Skill B' },
              content: '# Skill B',
              length: 9,
              filePathKind: FilePathKind.Relative,
              dir: createMockRelativePath('skill-b', tempDir),
              markdownContents: [],
              mcpConfig: {
                type: PromptKind.SkillMcpConfig,
                mcpServers: { server2: { command: 'cmd2' } },
                rawContent: '{}',
              },
            },
            {
              type: PromptKind.Skill,
              yamlFrontMatter: { name: 'skill-c', description: 'Skill C (no MCP)' },
              content: '# Skill C',
              length: 9,
              filePathKind: FilePathKind.Relative,
              dir: createMockRelativePath('skill-c', tempDir),
              markdownContents: [],
              // No mcpConfig
            },
          ],
        } as unknown as CollectedInputContext,
        logger: { debug: vi.fn(), trace: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any,
        fs,
        path,
      }

      const result = await plugin.registerGlobalOutputFiles(ctx)

      // Should have mcp.json for skill-a, skill-b (in power dirs), and one global settings/mcp.json
      const mcpFiles = result.filter((r) => r.path === 'mcp.json')
      // 2 power mcp.json + 1 global settings/mcp.json = 3
      expect(mcpFiles).toHaveLength(3)

      // Check power directory mcp.json files
      const powerMcpFiles = mcpFiles.filter((f) => f.basePath.includes('powers/installed'))
      expect(powerMcpFiles).toHaveLength(2)

      const mcpBasePaths = powerMcpFiles.map((f) => f.basePath)
      expect(mcpBasePaths.some((p) => p.includes('skill-a'))).toBe(true)
      expect(mcpBasePaths.some((p) => p.includes('skill-b'))).toBe(true)
      expect(mcpBasePaths.some((p) => p.includes('skill-c'))).toBe(false)

      // Check global settings/mcp.json
      const globalMcpFile = mcpFiles.find((f) => f.basePath.includes('settings'))
      expect(globalMcpFile).toBeDefined()
    })
  })
})
