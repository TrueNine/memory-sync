import type {CollectedInputContext, FastCommandPrompt, OutputPluginContext, Project, RulePrompt, SkillPrompt, SubAgentPrompt} from '@/types'
import type {RelativePath, RootPath} from '@/types/FileSystemTypes'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {FilePathKind, NamingCaseKind, PromptKind} from '@/types'
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
    it('should register commands, agents, and skills subdirectories in .claude', async () => {
      const dirs = await plugin.registerGlobalOutputDirs(mockContext)

      const dirPaths = dirs.map(d => d.path)
      expect(dirPaths).toContain('commands')
      expect(dirPaths).toContain('agents')
      expect(dirPaths).toContain('skills')

      const expectedBasePath = path.join(tempDir, '.claude')
      dirs.forEach(d => expect(d.basePath).toBe(expectedBasePath))
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
      const dirPaths = dirs.map(d => d.path) // (Or possibly more if logic changed, but based on code, it loops subdirs) // Expect 3 dirs: .claude/commands, .claude/agents, .claude/skills

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

    it('should register fast commands in commands subdirectory', async () => {
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

      expect(cmdFile).toBeDefined()
      expect(cmdFile?.path).toContain('commands')
      expect(cmdFile?.basePath).toBe(path.join(tempDir, '.claude'))
    })

    it('should register sub agents in agents subdirectory', async () => {
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

      expect(agentFile).toBeDefined()
      expect(agentFile?.path).toContain('agents')
      expect(agentFile?.basePath).toBe(path.join(tempDir, '.claude'))
    })

    it('should strip .mdx suffix from sub agent path and use .md', async () => {
      const mockAgent: SubAgentPrompt = {
        type: PromptKind.SubAgent,
        content: 'agent content',
        filePathKind: FilePathKind.Relative,
        dir: createMockRelativePath('code-review.cn.mdx', tempDir),
        markdownContents: [],
        length: 0,
        yamlFrontMatter: {namingCase: NamingCaseKind.KebabCase, name: 'code-review', description: 'desc'}
      }

      const ctxWithAgent = {
        ...mockContext,
        collectedInputContext: {
          ...mockContext.collectedInputContext,
          subAgents: [mockAgent]
        }
      }

      const files = await plugin.registerGlobalOutputFiles(ctxWithAgent)
      const agentFile = files.find(f => f.path.includes('agents'))

      expect(agentFile).toBeDefined()
      expect(agentFile?.path).toContain('code-review.cn.md')
      expect(agentFile?.path).not.toContain('.mdx')
    })

    it('should register skills in skills subdirectory', async () => {
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

      expect(skillFile).toBeDefined()
      expect(skillFile?.path).toContain('skills')
      expect(skillFile?.basePath).toBe(path.join(tempDir, '.claude'))
    })
  })

  describe('registerProjectOutputFiles', () => {
    it('should only register project CLAUDE.md files', async () => {
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

      const files = await plugin.registerProjectOutputFiles(ctxWithProject)

      expect(files).toHaveLength(1)
      expect(files[0].path).toBe(path.join('project-a', 'CLAUDE.md'))
      expect(files[0].basePath).toBe(tempDir)
    })
  })

  describe('writeGlobalOutputs', () => {
    it('should write sub agent file with .md extension when source has .mdx', async () => {
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

      expect(agentResult).toBeDefined()
      expect(agentResult?.success).toBe(true)

      const writtenPath = path.join(tempDir, '.claude', 'agents', 'reviewer.cn.md')
      expect(fs.existsSync(writtenPath)).toBe(true)
      expect(fs.existsSync(path.join(tempDir, '.claude', 'agents', 'reviewer.cn.mdx'))).toBe(false)
      expect(fs.existsSync(path.join(tempDir, '.claude', 'agents', 'reviewer.cn.mdx.md'))).toBe(false)
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
      expect(content).toContain('- "**/*.ts"')
      expect(content).toContain('- "**/*.tsx"')
    })

    it('should double-quote paths that do not start with *', () => {
      const rule = createMockRulePrompt({series: '01', ruleName: 'ts', globs: ['src/components/*.tsx', 'lib/utils.ts'], content: '# Body'})
      const content = plugin.testBuildRuleContent(rule)
      expect(content).toContain('- "src/components/*.tsx"')
      expect(content).toContain('- "lib/utils.ts"')
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
    it('should register rules subdir in global output dirs when global rules exist', async () => {
      const ctx = {
        ...mockContext,
        collectedInputContext: {...mockContext.collectedInputContext, rules: [createMockRulePrompt({series: '01', ruleName: 'ts', globs: ['**/*.ts'], scope: 'global'})]}
      }
      const dirs = await plugin.registerGlobalOutputDirs(ctx)
      expect(dirs.map(d => d.path)).toContain('rules')
    })

    it('should not register rules subdir when no global rules', async () => {
      const dirs = await plugin.registerGlobalOutputDirs(mockContext)
      expect(dirs.map(d => d.path)).not.toContain('rules')
    })

    it('should register global rule files in ~/.claude/rules/', async () => {
      const ctx = {
        ...mockContext,
        collectedInputContext: {...mockContext.collectedInputContext, rules: [createMockRulePrompt({series: '01', ruleName: 'ts', globs: ['**/*.ts'], scope: 'global'})]}
      }
      const files = await plugin.registerGlobalOutputFiles(ctx)
      const ruleFile = files.find(f => f.path === 'rule-01-ts.md')
      expect(ruleFile).toBeDefined()
      expect(ruleFile?.basePath).toBe(path.join(tempDir, '.claude', 'rules'))
    })

    it('should not register project rules as global files', async () => {
      const ctx = {
        ...mockContext,
        collectedInputContext: {...mockContext.collectedInputContext, rules: [createMockRulePrompt({series: '01', ruleName: 'ts', globs: ['**/*.ts'], scope: 'project'})]}
      }
      const files = await plugin.registerGlobalOutputFiles(ctx)
      expect(files.find(f => f.path.includes('rule-'))).toBeUndefined()
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
    it('should write global rule file to ~/.claude/rules/', async () => {
      const ctx = {
        ...mockContext,
        collectedInputContext: {
          ...mockContext.collectedInputContext,
          rules: [createMockRulePrompt({series: '01', ruleName: 'ts', globs: ['**/*.ts'], scope: 'global', content: '# TS rule'})]
        }
      }
      const results = await plugin.writeGlobalOutputs(ctx as any)
      const ruleResult = results.files.find(f => f.path.path === 'rule-01-ts.md')
      expect(ruleResult?.success).toBe(true)

      const filePath = path.join(tempDir, '.claude', 'rules', 'rule-01-ts.md')
      expect(fs.existsSync(filePath)).toBe(true)
      const content = fs.readFileSync(filePath, 'utf8')
      expect(content).toContain('paths:')
      expect(content).toContain('# TS rule')
    })

    it('should write rule without frontmatter when globs is empty', async () => {
      const ctx = {
        ...mockContext,
        collectedInputContext: {
          ...mockContext.collectedInputContext,
          rules: [createMockRulePrompt({series: '01', ruleName: 'general', globs: [], scope: 'global', content: '# Always apply'})]
        }
      }
      await plugin.writeGlobalOutputs(ctx as any)
      const filePath = path.join(tempDir, '.claude', 'rules', 'rule-01-general.md')
      const content = fs.readFileSync(filePath, 'utf8')
      expect(content).toBe('# Always apply')
      expect(content).not.toContain('---')
    })
  })

  describe('writeProjectOutputs with rules', () => {
    it('should write project rule file to {project}/.claude/rules/', async () => {
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
          rules: [createMockRulePrompt({series: '02', ruleName: 'api', globs: ['src/api/**'], scope: 'project', content: '# API rules'})]
        }
      }
      const results = await plugin.writeProjectOutputs(ctx as any)
      expect(results.files.some(f => f.path.path === 'rule-02-api.md' && f.success)).toBe(true)

      const filePath = path.join(tempDir, 'proj', '.claude', 'rules', 'rule-02-api.md')
      expect(fs.existsSync(filePath)).toBe(true)
      const content = fs.readFileSync(filePath, 'utf8')
      expect(content).toContain('paths:')
      expect(content).toContain('# API rules')
    })
  })
})
