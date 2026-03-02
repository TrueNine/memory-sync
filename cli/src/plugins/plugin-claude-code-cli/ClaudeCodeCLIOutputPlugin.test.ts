import type {CollectedInputContext, FastCommandPrompt, OutputPluginContext, Project, RelativePath, RootPath, RulePrompt, SkillPrompt, SubAgentPrompt} from '@truenine/plugin-shared'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {FilePathKind, NamingCaseKind, PromptKind} from '@truenine/plugin-shared'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {ClaudeCodeCLIOutputPlugin} from './ClaudeCodeCLIOutputPlugin'

function createMockRelativePath(pathStr: string, basePath: string): RelativePath { // Helper to create mock RelativePath
  return {
    pathKind: FilePathKind.Relative,
    path: pathStr,
    basePath,
    getDirectoryName: () => pathStr,
    getAbsolutePath: () => path.join(basePath, pathStr)
  }
}

class TestableClaudeCodeCLIOutputPlugin extends ClaudeCodeCLIOutputPlugin { // Testable subclass to mock home dir
  private mockHomeDir: string | null = null

  public setMockHomeDir(dir: string | null): void {
    this.mockHomeDir = dir
  }

  protected override getHomeDir(): string {
    if (this.mockHomeDir != null) return this.mockHomeDir
    return super.getHomeDir()
  }

  public testBuildRuleFileName(rule: RulePrompt): string {
    return (this as any).buildRuleFileName(rule)
  }

  public testBuildRuleContent(rule: RulePrompt): string {
    return (this as any).buildRuleContent(rule)
  }
}

function createMockRulePrompt(options: {series: string, ruleName: string, globs: readonly string[], scope?: 'global' | 'project', content?: string}): RulePrompt {
  const content = options.content ?? '# Rule body'
  return {
    type: PromptKind.Rule,
    content,
    length: content.length,
    filePathKind: FilePathKind.Relative,
    dir: createMockRelativePath('.', ''),
    markdownContents: [],
    yamlFrontMatter: {description: 'ignored', globs: options.globs},
    series: options.series,
    ruleName: options.ruleName,
    globs: options.globs,
    scope: options.scope ?? 'global'
  } as RulePrompt
}

describe('claudeCodeCLIOutputPlugin', () => {
  let tempDir: string,
    plugin: TestableClaudeCodeCLIOutputPlugin,
    mockContext: OutputPluginContext

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-test-'))
    plugin = new TestableClaudeCodeCLIOutputPlugin()
    plugin.setMockHomeDir(tempDir)

    mockContext = {
      collectedInputContext: {
        workspace: {
          projects: [],
          directory: createMockRelativePath('.', tempDir)
        },
        globalMemory: {
          type: PromptKind.GlobalMemory,
          content: 'Global Memory Content',
          filePathKind: FilePathKind.Absolute,
          dir: createMockRelativePath('.', tempDir),
          markdownContents: []
        },
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
    if (tempDir && fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, {recursive: true, force: true})
      }
      catch {
      } // ignore cleanup errors
    }
  })

  describe('registerGlobalOutputDirs', () => {
    it('should return empty array since all outputs go to project level', async () => {
      const dirs = await plugin.registerGlobalOutputDirs(mockContext)
      expect(dirs).toHaveLength(0)
    })
  })

  describe('registerProjectOutputDirs', () => {
    it('should register project cleanup directories', async () => {
      const mockProject: Project = {
        name: 'test-project',
        dirFromWorkspacePath: createMockRelativePath('project-a', tempDir),
        rootMemoryPrompt: {
          type: PromptKind.ProjectRootMemory,
          content: 'content',
          filePathKind: FilePathKind.Root,
          dir: createMockRelativePath('.', tempDir) as unknown as RootPath,
          markdownContents: [],
          length: 0,
          yamlFrontMatter: {namingCase: NamingCaseKind.KebabCase}
        },
        childMemoryPrompts: [],
        sourceFiles: []
      }

      const ctxWithProject = {
        ...mockContext,
        collectedInputContext: {
          ...mockContext.collectedInputContext,
          workspace: {
            ...mockContext.collectedInputContext.workspace,
            projects: [mockProject]
          }
        }
      }

      const dirs = await plugin.registerProjectOutputDirs(ctxWithProject)
      const dirPaths = dirs.map(d => d.path)

      expect(dirPaths.some(p => p.includes(path.join('.claude', 'commands')))).toBe(true)
      expect(dirPaths.some(p => p.includes(path.join('.claude', 'agents')))).toBe(true)
      expect(dirPaths.some(p => p.includes(path.join('.claude', 'skills')))).toBe(true)
    })
  })

  describe('registerGlobalOutputFiles', () => {
    it('should register CLAUDE.md in global config dir', async () => {
      const files = await plugin.registerGlobalOutputFiles(mockContext)
      const outputFile = files.find(f => f.path === 'CLAUDE.md')
      expect(outputFile).toBeDefined()
      expect(outputFile?.basePath).toBe(path.join(tempDir, '.claude'))
    })

    it('should not register fast commands globally (only project level)', async () => {
      const mockCmd: FastCommandPrompt = {
        type: PromptKind.FastCommand,
        commandName: 'test-cmd',
        content: 'content',
        filePathKind: FilePathKind.Relative,
        dir: createMockRelativePath('test-cmd', tempDir),
        markdownContents: [],
        length: 0,
        yamlFrontMatter: {namingCase: NamingCaseKind.KebabCase, description: 'desc'}
      }

      const ctxWithCmd = {
        ...mockContext,
        collectedInputContext: {
          ...mockContext.collectedInputContext,
          fastCommands: [mockCmd]
        }
      }

      const files = await plugin.registerGlobalOutputFiles(ctxWithCmd)
      const cmdFile = files.find(f => f.path.includes('test-cmd.md'))

      expect(cmdFile).toBeUndefined()
    })

    it('should not register sub agents globally (only project level)', async () => {
      const mockAgent: SubAgentPrompt = {
        type: PromptKind.SubAgent,
        content: 'content',
        filePathKind: FilePathKind.Relative,
        dir: createMockRelativePath('test-agent.md', tempDir),
        markdownContents: [],
        length: 0,
        yamlFrontMatter: {namingCase: NamingCaseKind.KebabCase, name: 'agent', description: 'desc'}
      }

      const ctxWithAgent = {
        ...mockContext,
        collectedInputContext: {
          ...mockContext.collectedInputContext,
          subAgents: [mockAgent]
        }
      }

      const files = await plugin.registerGlobalOutputFiles(ctxWithAgent)
      const agentFile = files.find(f => f.path.includes('test-agent.md'))

      expect(agentFile).toBeUndefined()
    })

    it('should not register skills globally (only project level)', async () => {
      const mockSkill: SkillPrompt = {
        type: PromptKind.Skill,
        content: 'content',
        filePathKind: FilePathKind.Relative,
        dir: createMockRelativePath('test-skill', tempDir),
        markdownContents: [],
        length: 0,
        yamlFrontMatter: {namingCase: NamingCaseKind.KebabCase, name: 'test-skill', description: 'desc'}
      }

      const ctxWithSkill = {
        ...mockContext,
        collectedInputContext: {
          ...mockContext.collectedInputContext,
          skills: [mockSkill]
        }
      }

      const files = await plugin.registerGlobalOutputFiles(ctxWithSkill)
      const skillFile = files.find(f => f.path.includes('SKILL.md'))

      expect(skillFile).toBeUndefined()
    })
  })

  describe('registerProjectOutputFiles', () => {
    it('should register project CLAUDE.md and project-level commands/agents/skills', async () => {
      const mockProject: Project = {
        name: 'test-project',
        dirFromWorkspacePath: createMockRelativePath('project-a', tempDir),
        rootMemoryPrompt: {
          type: PromptKind.ProjectRootMemory,
          content: 'content',
          filePathKind: FilePathKind.Root,
          dir: createMockRelativePath('.', tempDir) as unknown as RootPath,
          markdownContents: [],
          length: 0,
          yamlFrontMatter: {namingCase: NamingCaseKind.KebabCase}
        },
        childMemoryPrompts: [],
        sourceFiles: []
      }

      const mockCmd: FastCommandPrompt = {
        type: PromptKind.FastCommand,
        commandName: 'test-cmd',
        content: 'content',
        filePathKind: FilePathKind.Relative,
        dir: createMockRelativePath('test-cmd', tempDir),
        markdownContents: [],
        length: 0,
        yamlFrontMatter: {namingCase: NamingCaseKind.KebabCase, description: 'desc'}
      }

      const mockAgent: SubAgentPrompt = {
        type: PromptKind.SubAgent,
        content: 'content',
        filePathKind: FilePathKind.Relative,
        dir: createMockRelativePath('code-review.cn.mdx', tempDir),
        markdownContents: [],
        length: 0,
        yamlFrontMatter: {namingCase: NamingCaseKind.KebabCase, name: 'code-review', description: 'desc'}
      }

      const mockSkill: SkillPrompt = {
        type: PromptKind.Skill,
        content: 'content',
        filePathKind: FilePathKind.Relative,
        dir: createMockRelativePath('test-skill', tempDir),
        markdownContents: [],
        length: 0,
        yamlFrontMatter: {namingCase: NamingCaseKind.KebabCase, name: 'test-skill', description: 'desc'}
      }

      const ctxWithProject = {
        ...mockContext,
        collectedInputContext: {
          ...mockContext.collectedInputContext,
          workspace: {
            ...mockContext.collectedInputContext.workspace,
            projects: [mockProject]
          },
          fastCommands: [mockCmd],
          subAgents: [mockAgent],
          skills: [mockSkill]
        }
      }

      const files = await plugin.registerProjectOutputFiles(ctxWithProject)

      const claudeFile = files.find(f => f.path.includes('CLAUDE.md')) // Check CLAUDE.md
      expect(claudeFile).toBeDefined()

      const cmdFile = files.find(f => f.path.includes('test-cmd.md')) // Check command
      expect(cmdFile).toBeDefined()
      expect(cmdFile?.path).toContain('commands')

      const agentFile = files.find(f => f.path.includes('code-review.cn.md')) // Check agent (should have .md not .mdx)
      expect(agentFile).toBeDefined()
      expect(agentFile?.path).toContain('agents')
      expect(agentFile?.path).not.toContain('.mdx')

      const skillFile = files.find(f => f.path.includes('SKILL.md')) // Check skill
      expect(skillFile).toBeDefined()
      expect(skillFile?.path).toContain('skills')
    })
  })

  describe('writeGlobalOutputs', () => {
    it('should not write sub agents globally (only project level)', async () => {
      const mockAgent: SubAgentPrompt = {
        type: PromptKind.SubAgent,
        content: '# Code Review Agent',
        filePathKind: FilePathKind.Relative,
        dir: createMockRelativePath('reviewer.cn.mdx', tempDir),
        markdownContents: [],
        length: 0,
        yamlFrontMatter: {namingCase: NamingCaseKind.KebabCase, name: 'reviewer', description: 'desc'}
      }

      const writeCtx = {
        ...mockContext,
        collectedInputContext: {
          ...mockContext.collectedInputContext,
          subAgents: [mockAgent]
        }
      }

      const results = await plugin.writeGlobalOutputs(writeCtx)
      const agentResult = results.files.find(f => f.path.path === 'reviewer.cn.md')

      expect(agentResult).toBeUndefined()

      const writtenPath = path.join(tempDir, '.claude', 'agents', 'reviewer.cn.md') // Verify file was not written globally
      expect(fs.existsSync(writtenPath)).toBe(false)
    })
  })

  describe('buildRuleFileName', () => {
    it('should produce rule-{series}-{ruleName}.md', () => {
      const rule = createMockRulePrompt({series: '01', ruleName: 'naming', globs: []})
      expect(plugin.testBuildRuleFileName(rule)).toBe('rule-01-naming.md')
    })
  })

  describe('buildRuleContent', () => {
    it('should return plain content when globs is empty', () => {
      const rule = createMockRulePrompt({series: '01', ruleName: 'ts', globs: [], content: '# No globs'})
      expect(plugin.testBuildRuleContent(rule)).toBe('# No globs')
    })

    it('should use paths field (not globs) in YAML frontmatter per Claude Code docs', () => {
      const rule = createMockRulePrompt({series: '01', ruleName: 'ts', globs: ['**/*.ts'], content: '# TS rule'})
      const content = plugin.testBuildRuleContent(rule)
      expect(content).toContain('paths:')
      expect(content).not.toMatch(/^globs:/m)
    })

    it('should output paths as YAML array items', () => {
      const rule = createMockRulePrompt({series: '01', ruleName: 'ts', globs: ['**/*.ts', '**/*.tsx'], content: '# Body'})
      const content = plugin.testBuildRuleContent(rule)
      expect(content).toMatch(/-\s+['"]?\*\*\/\*\.ts['"]?/) // Accept quoted or unquoted formats
      expect(content).toMatch(/-\s+['"]?\*\*\/\*\.tsx['"]?/)
    })

    it('should include paths in YAML array', () => {
      const rule = createMockRulePrompt({series: '01', ruleName: 'ts', globs: ['src/components/*.tsx', 'lib/utils.ts'], content: '# Body'})
      const content = plugin.testBuildRuleContent(rule)
      expect(content).toMatch(/-\s+['"]?src\/components\/\*\.tsx['"]?/) // Accept quoted or unquoted formats
      expect(content).toMatch(/-\s+['"]?lib\/utils\.ts['"]?/)
    })

    it('should preserve rule body after frontmatter', () => {
      const body = '# My Rule\n\nSome content.'
      const rule = createMockRulePrompt({series: '01', ruleName: 'x', globs: ['*.ts'], content: body})
      const content = plugin.testBuildRuleContent(rule)
      expect(content).toContain(body)
    })

    it('should wrap content in valid YAML frontmatter delimiters', () => {
      const rule = createMockRulePrompt({series: '01', ruleName: 'x', globs: ['*.ts'], content: '# Body'})
      const content = plugin.testBuildRuleContent(rule)
      const lines = content.split('\n')
      expect(lines[0]).toBe('---')
      expect(lines.indexOf('---', 1)).toBeGreaterThan(0)
    })
  })

  describe('rules registration', () => {
    it('should not register rules globally (only project level)', async () => {
      const ctx = {
        ...mockContext,
        collectedInputContext: {...mockContext.collectedInputContext, rules: [createMockRulePrompt({series: '01', ruleName: 'ts', globs: ['**/*.ts'], scope: 'global'})]}
      }
      const dirs = await plugin.registerGlobalOutputDirs(ctx)
      expect(dirs.map(d => d.path)).not.toContain('rules')
    })

    it('should register rules at project level', async () => {
      const mockProject: Project = {
        name: 'proj',
        dirFromWorkspacePath: createMockRelativePath('proj', tempDir),
        rootMemoryPrompt: {type: PromptKind.ProjectRootMemory, content: '', filePathKind: FilePathKind.Root, dir: createMockRelativePath('.', tempDir) as unknown as RootPath, markdownContents: [], length: 0, yamlFrontMatter: {namingCase: NamingCaseKind.KebabCase}},
        childMemoryPrompts: [],
        sourceFiles: []
      }
      const ctx = {
        ...mockContext,
        collectedInputContext: {
          ...mockContext.collectedInputContext,
          workspace: {...mockContext.collectedInputContext.workspace, projects: [mockProject]},
          rules: [createMockRulePrompt({series: '01', ruleName: 'ts', globs: ['**/*.ts'], scope: 'global'})]
        }
      }
      const dirs = await plugin.registerProjectOutputDirs(ctx)
      expect(dirs.map(d => d.path)).toContain(path.join('proj', '.claude', 'rules'))
    })

    it('should not register global rule files (only project level)', async () => {
      const ctx = {
        ...mockContext,
        collectedInputContext: {...mockContext.collectedInputContext, rules: [createMockRulePrompt({series: '01', ruleName: 'ts', globs: ['**/*.ts'], scope: 'global'})]}
      }
      const files = await plugin.registerGlobalOutputFiles(ctx)
      const ruleFile = files.find(f => f.path === 'rule-01-ts.md')
      expect(ruleFile).toBeUndefined()
    })
  })

  describe('canWrite with rules', () => {
    it('should return true when rules exist even without other content', async () => {
      const ctx = {
        ...mockContext,
        collectedInputContext: {
          ...mockContext.collectedInputContext,
          globalMemory: void 0,
          rules: [createMockRulePrompt({series: '01', ruleName: 'ts', globs: []})]
        }
      }
      expect(await plugin.canWrite(ctx as any)).toBe(true)
    })
  })

  describe('writeGlobalOutputs with rules', () => {
    it('should not write global rule files (only project level)', async () => {
      const ctx = {
        ...mockContext,
        collectedInputContext: {
          ...mockContext.collectedInputContext,
          rules: [createMockRulePrompt({series: '01', ruleName: 'ts', globs: ['**/*.ts'], scope: 'global', content: '# TS rule'})]
        }
      }
      const results = await plugin.writeGlobalOutputs(ctx as any)
      const ruleResult = results.files.find(f => f.path.path === 'rule-01-ts.md')
      expect(ruleResult).toBeUndefined()

      const filePath = path.join(tempDir, '.claude', 'rules', 'rule-01-ts.md')
      expect(fs.existsSync(filePath)).toBe(false)
    })
  })

  describe('writeProjectOutputs with rules', () => {
    it('should write all rules to {project}/.claude/rules/ (including previously global scoped)', async () => {
      const mockProject: Project = {
        name: 'proj',
        dirFromWorkspacePath: createMockRelativePath('proj', tempDir),
        rootMemoryPrompt: {type: PromptKind.ProjectRootMemory, content: '', filePathKind: FilePathKind.Root, dir: createMockRelativePath('.', tempDir) as unknown as RootPath, markdownContents: [], length: 0, yamlFrontMatter: {namingCase: NamingCaseKind.KebabCase}},
        childMemoryPrompts: [],
        sourceFiles: []
      }
      const ctx = {
        ...mockContext,
        collectedInputContext: {
          ...mockContext.collectedInputContext,
          workspace: {...mockContext.collectedInputContext.workspace, projects: [mockProject]},
          rules: [
            createMockRulePrompt({series: '01', ruleName: 'ts', globs: ['**/*.ts'], scope: 'global', content: '# TS rule'}),
            createMockRulePrompt({series: '02', ruleName: 'api', globs: ['src/api/**'], scope: 'project', content: '# API rules'})
          ]
        }
      }
      const results = await plugin.writeProjectOutputs(ctx as any)
      expect(results.files.some(f => f.path.path === 'rule-01-ts.md' && f.success)).toBe(true)
      expect(results.files.some(f => f.path.path === 'rule-02-api.md' && f.success)).toBe(true)

      const filePath1 = path.join(tempDir, 'proj', '.claude', 'rules', 'rule-01-ts.md')
      const filePath2 = path.join(tempDir, 'proj', '.claude', 'rules', 'rule-02-api.md')
      expect(fs.existsSync(filePath1)).toBe(true)
      expect(fs.existsSync(filePath2)).toBe(true)
    })

    it('should write rule without frontmatter when globs is empty', async () => {
      const mockProject: Project = {
        name: 'proj',
        dirFromWorkspacePath: createMockRelativePath('proj', tempDir),
        rootMemoryPrompt: {type: PromptKind.ProjectRootMemory, content: '', filePathKind: FilePathKind.Root, dir: createMockRelativePath('.', tempDir) as unknown as RootPath, markdownContents: [], length: 0, yamlFrontMatter: {namingCase: NamingCaseKind.KebabCase}},
        childMemoryPrompts: [],
        sourceFiles: []
      }
      const ctx = {
        ...mockContext,
        collectedInputContext: {
          ...mockContext.collectedInputContext,
          workspace: {...mockContext.collectedInputContext.workspace, projects: [mockProject]},
          rules: [createMockRulePrompt({series: '01', ruleName: 'general', globs: [], scope: 'global', content: '# Always apply'})]
        }
      }
      await plugin.writeProjectOutputs(ctx as any)
      const filePath = path.join(tempDir, 'proj', '.claude', 'rules', 'rule-01-general.md')
      const content = fs.readFileSync(filePath, 'utf8')
      expect(content).toBe('# Always apply')
      expect(content).not.toContain('---')
    })
  })
})
