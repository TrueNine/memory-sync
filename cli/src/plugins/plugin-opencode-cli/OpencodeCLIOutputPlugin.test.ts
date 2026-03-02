import type {CollectedInputContext, FastCommandPrompt, OutputPluginContext, Project, RelativePath, RulePrompt, SkillPrompt, SubAgentPrompt} from '@truenine/plugin-shared'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {FilePathKind, NamingCaseKind, PromptKind} from '@truenine/plugin-shared'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {OpencodeCLIOutputPlugin} from './OpencodeCLIOutputPlugin'

function createMockRelativePath(pathStr: string, basePath: string): RelativePath {
  return {
    pathKind: FilePathKind.Relative,
    path: pathStr,
    basePath,
    getDirectoryName: () => pathStr,
    getAbsolutePath: () => path.join(basePath, pathStr)
  }
}

class TestableOpencodeCLIOutputPlugin extends OpencodeCLIOutputPlugin {
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

describe('opencodeCLIOutputPlugin', () => {
  let tempDir: string,
    plugin: TestableOpencodeCLIOutputPlugin,
    mockContext: OutputPluginContext

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opencode-test-'))
    plugin = new TestableOpencodeCLIOutputPlugin()
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
  })

  afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, {recursive: true, force: true})
      }
      catch {
      } // ignore cleanup errors
    }
  })

  describe('constructor', () => {
    it('should have correct plugin name', () => expect(plugin.name).toBe('OpencodeCLIOutputPlugin'))

    it('should have correct dependencies', () => expect(plugin.dependsOn).toContain('AgentsOutputPlugin'))
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
          filePathKind: FilePathKind.Relative,
          dir: createMockRelativePath('.', tempDir) as any,
          markdownContents: [],
          length: 0,
          yamlFrontMatter: {namingCase: NamingCaseKind.KebabCase}
        },
        childMemoryPrompts: []
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

      expect(dirPaths.some(p => p.includes(path.join('.config/opencode', 'commands')))).toBe(true)
      expect(dirPaths.some(p => p.includes(path.join('.config/opencode', 'agents')))).toBe(true)
      expect(dirPaths.some(p => p.includes(path.join('.config/opencode', 'skills')))).toBe(true)
    })
  })

  describe('registerGlobalOutputFiles', () => {
    it('should register AGENTS.md in global config dir', async () => {
      const files = await plugin.registerGlobalOutputFiles(mockContext)
      const outputFile = files.find(f => f.path === 'AGENTS.md')

      expect(outputFile).toBeDefined()
      expect(outputFile?.basePath).toBe(path.join(tempDir, '.config/opencode'))
    })

    it('should NOT register fast commands globally (only project level)', async () => {
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

    it('should NOT register agents globally (only project level)', async () => {
      const mockAgent: SubAgentPrompt = {
        type: PromptKind.SubAgent,
        content: 'content',
        filePathKind: FilePathKind.Relative,
        dir: createMockRelativePath('review-agent.md', tempDir),
        markdownContents: [],
        length: 0,
        yamlFrontMatter: {namingCase: NamingCaseKind.KebabCase, name: 'review-agent', description: 'Code review agent'}
      }

      const ctxWithAgent = {
        ...mockContext,
        collectedInputContext: {
          ...mockContext.collectedInputContext,
          subAgents: [mockAgent]
        }
      }

      const files = await plugin.registerGlobalOutputFiles(ctxWithAgent)
      const agentFile = files.find(f => f.path.includes('review-agent.md'))

      expect(agentFile).toBeUndefined()
    })

    it('should NOT register agents globally (mdx test)', async () => {
      const mockAgent: SubAgentPrompt = {
        type: PromptKind.SubAgent,
        content: 'agent content',
        filePathKind: FilePathKind.Relative,
        dir: createMockRelativePath('code-review.cn.mdx', tempDir),
        markdownContents: [],
        length: 0,
        yamlFrontMatter: {namingCase: NamingCaseKind.KebabCase, name: 'code-review', description: 'Code review agent'}
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

      expect(agentFile).toBeUndefined()
    })

    it('should NOT register skills globally (only project level)', async () => {
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
    it('should register project-level commands, agents, and skills', async () => {
      const mockProject: Project = {
        name: 'test-project',
        dirFromWorkspacePath: createMockRelativePath('project-a', tempDir),
        rootMemoryPrompt: {
          type: PromptKind.ProjectRootMemory,
          content: 'content',
          filePathKind: FilePathKind.Relative,
          dir: createMockRelativePath('.', tempDir) as any,
          markdownContents: [],
          length: 0,
          yamlFrontMatter: {namingCase: NamingCaseKind.KebabCase}
        },
        childMemoryPrompts: []
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
        dir: createMockRelativePath('test-agent.md', tempDir),
        markdownContents: [],
        length: 0,
        yamlFrontMatter: {namingCase: NamingCaseKind.KebabCase, name: 'agent', description: 'desc'}
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

      const cmdFile = files.find(f => f.path.includes('test-cmd.md')) // Check command
      expect(cmdFile).toBeDefined()
      expect(cmdFile?.path).toContain('commands')

      const agentFile = files.find(f => f.path.includes('test-agent.md')) // Check agent
      expect(agentFile).toBeDefined()
      expect(agentFile?.path).toContain('agents')

      const skillFile = files.find(f => f.path.includes('SKILL.md')) // Check skill
      expect(skillFile).toBeDefined()
      expect(skillFile?.path).toContain('skills')
    })
  })

  describe('skill name normalization', () => {
    it('should normalize skill names to opencode format at project level', async () => {
      const testCases = [
        {input: 'My Skill', expected: 'my-skill'},
        {input: 'Skill__Name', expected: 'skill-name'},
        {input: '-skill-', expected: 'skill'},
        {input: 'UPPER_CASE', expected: 'upper-case'},
        {input: 'tool.name', expected: 'tool-name'},
        {input: 'a'.repeat(70), expected: 'a'.repeat(64)} // truncated to 64 chars
      ]

      for (const {input, expected} of testCases) {
        const mockSkill: SkillPrompt = {
          type: PromptKind.Skill,
          content: 'content',
          filePathKind: FilePathKind.Relative,
          dir: createMockRelativePath(input, tempDir),
          markdownContents: [],
          length: 0,
          yamlFrontMatter: {namingCase: NamingCaseKind.KebabCase, name: input, description: 'desc'}
        }

        const mockProject: Project = {
          name: 'test-project',
          dirFromWorkspacePath: createMockRelativePath('project-a', tempDir),
          rootMemoryPrompt: {
            type: PromptKind.ProjectRootMemory,
            content: 'content',
            filePathKind: FilePathKind.Relative,
            dir: createMockRelativePath('.', tempDir) as any,
            markdownContents: [],
            length: 0,
            yamlFrontMatter: {namingCase: NamingCaseKind.KebabCase}
          },
          childMemoryPrompts: []
        }

        const ctxWithSkill = {
          ...mockContext,
          collectedInputContext: {
            ...mockContext.collectedInputContext,
            workspace: {
              ...mockContext.collectedInputContext.workspace,
              projects: [mockProject]
            },
            skills: [mockSkill]
          }
        }

        const files = await plugin.registerProjectOutputFiles(ctxWithSkill)
        const skillFile = files.find(f => f.path.includes('SKILL.md'))

        expect(skillFile).toBeDefined()
        expect(skillFile?.path).toContain(`skills/${expected}/`)
      }
    })
  })

  describe('mcp config output', () => {
    it('should register opencode.json when skill has mcp config', async () => {
      const mockSkill: SkillPrompt = {
        type: PromptKind.Skill,
        content: 'content',
        filePathKind: FilePathKind.Relative,
        dir: createMockRelativePath('test-skill', tempDir),
        markdownContents: [],
        length: 0,
        yamlFrontMatter: {namingCase: NamingCaseKind.KebabCase, name: 'test-skill', description: 'desc'},
        mcpConfig: {
          type: PromptKind.SkillMcpConfig,
          rawContent: '{}',
          mcpServers: {
            'test-server': {command: 'test-cmd'}
          }
        }
      }

      const ctxWithSkill = {
        ...mockContext,
        collectedInputContext: {
          ...mockContext.collectedInputContext,
          skills: [mockSkill]
        }
      }

      const files = await plugin.registerGlobalOutputFiles(ctxWithSkill)
      const configFile = files.find(f => f.path === 'opencode.json')

      expect(configFile).toBeDefined()
      expect(configFile?.basePath).toBe(path.join(tempDir, '.config/opencode'))
    })

    it('should write correct local mcp config', async () => {
      const mockSkill: SkillPrompt = {
        type: PromptKind.Skill,
        content: 'content',
        filePathKind: FilePathKind.Relative,
        dir: createMockRelativePath('test-skill', tempDir),
        markdownContents: [],
        length: 0,
        yamlFrontMatter: {namingCase: NamingCaseKind.KebabCase, name: 'test-skill', description: 'desc'},
        mcpConfig: {
          type: PromptKind.SkillMcpConfig,
          rawContent: '{}',
          mcpServers: {
            'local-server': {
              command: 'node',
              args: ['index.js'],
              env: {KEY: 'value'}
            }
          }
        }
      }

      const ctxWithSkill = {
        ...mockContext,
        collectedInputContext: {
          ...mockContext.collectedInputContext,
          skills: [mockSkill]
        }
      }

      await plugin.writeGlobalOutputs(ctxWithSkill)

      const configPath = path.join(tempDir, '.config/opencode/opencode.json')
      expect(fs.existsSync(configPath)).toBe(true)

      const content = JSON.parse(fs.readFileSync(configPath, 'utf8'))
      expect(content.mcp).toBeDefined()
      expect(content.mcp['local-server']).toBeDefined()
      expect(content.mcp['local-server'].type).toBe('local')
      expect(content.mcp['local-server'].command).toEqual(['node', 'index.js'])
      expect(content.mcp['local-server'].environment).toEqual({KEY: 'value'})
      expect(content.mcp['local-server'].enabled).toBe(true)
    })

    it('should write correct remote mcp config', async () => {
      const mockSkill: SkillPrompt = {
        type: PromptKind.Skill,
        content: 'content',
        filePathKind: FilePathKind.Relative,
        dir: createMockRelativePath('test-skill', tempDir),
        markdownContents: [],
        length: 0,
        yamlFrontMatter: {namingCase: NamingCaseKind.KebabCase, name: 'test-skill', description: 'desc'},
        mcpConfig: {
          type: PromptKind.SkillMcpConfig,
          rawContent: '{}',
          mcpServers: {
            'remote-server': {
              url: 'https://example.com/mcp'
            } as any
          }
        }
      }

      const ctxWithSkill = {
        ...mockContext,
        collectedInputContext: {
          ...mockContext.collectedInputContext,
          skills: [mockSkill]
        }
      }

      await plugin.writeGlobalOutputs(ctxWithSkill)

      const configPath = path.join(tempDir, '.config/opencode/opencode.json')
      const content = JSON.parse(fs.readFileSync(configPath, 'utf8'))

      expect(content.mcp['remote-server']).toBeDefined()
      expect(content.mcp['remote-server'].type).toBe('remote')
      expect(content.mcp['remote-server'].url).toBe('https://example.com/mcp')
      expect(content.mcp['remote-server'].enabled).toBe(true)
    })

    it('should add opencode-rules@latest to plugin array when writing mcp config', async () => {
      const mockSkill: SkillPrompt = {
        type: PromptKind.Skill,
        content: 'content',
        filePathKind: FilePathKind.Relative,
        dir: createMockRelativePath('test-skill', tempDir),
        markdownContents: [],
        length: 0,
        yamlFrontMatter: {namingCase: NamingCaseKind.KebabCase, name: 'test-skill', description: 'desc'},
        mcpConfig: {
          type: PromptKind.SkillMcpConfig,
          rawContent: '{}',
          mcpServers: {
            'local-server': {
              command: 'node'
            }
          }
        }
      }

      const ctxWithSkill = {
        ...mockContext,
        collectedInputContext: {
          ...mockContext.collectedInputContext,
          skills: [mockSkill]
        }
      }

      await plugin.writeGlobalOutputs(ctxWithSkill)

      const configPath = path.join(tempDir, '.config/opencode/opencode.json')
      const content = JSON.parse(fs.readFileSync(configPath, 'utf8')) as Record<string, unknown>
      expect(Array.isArray(content.plugin)).toBe(true)
      expect((content.plugin as unknown[])).toContain('opencode-rules@latest')
    })

    it('should preserve existing plugins and append opencode-rules@latest only once', async () => {
      const opencodeDir = path.join(tempDir, '.config/opencode')
      fs.mkdirSync(opencodeDir, {recursive: true})
      const configPath = path.join(opencodeDir, 'opencode.json')
      fs.writeFileSync(
        configPath,
        JSON.stringify({plugin: ['existing-plugin', 'opencode-rules@latest']}, null, 2),
        'utf8'
      )

      const mockSkill: SkillPrompt = {
        type: PromptKind.Skill,
        content: 'content',
        filePathKind: FilePathKind.Relative,
        dir: createMockRelativePath('test-skill', tempDir),
        markdownContents: [],
        length: 0,
        yamlFrontMatter: {namingCase: NamingCaseKind.KebabCase, name: 'test-skill', description: 'desc'},
        mcpConfig: {
          type: PromptKind.SkillMcpConfig,
          rawContent: '{}',
          mcpServers: {
            'local-server': {
              command: 'node'
            }
          }
        }
      }

      const ctxWithSkill = {
        ...mockContext,
        collectedInputContext: {
          ...mockContext.collectedInputContext,
          skills: [mockSkill]
        }
      }

      await plugin.writeGlobalOutputs(ctxWithSkill)

      const content = JSON.parse(fs.readFileSync(configPath, 'utf8')) as Record<string, unknown>
      expect(content.plugin).toEqual(['existing-plugin', 'opencode-rules@latest'])
    })
  })

  describe('clean effect', () => {
    it('should remove opencode-rules@latest from plugin array on clean', async () => {
      const opencodeDir = path.join(tempDir, '.config/opencode')
      fs.mkdirSync(opencodeDir, {recursive: true})
      const configPath = path.join(opencodeDir, 'opencode.json')
      fs.writeFileSync(
        configPath,
        JSON.stringify({mcp: {some: {command: 'npx'}}, plugin: ['a', 'opencode-rules@latest', 'b']}, null, 2),
        'utf8'
      )

      const ctx = {
        collectedInputContext: {
          workspace: {projects: [], directory: createMockRelativePath('.', tempDir)}
        },
        logger: {debug: vi.fn(), trace: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn()},
        dryRun: false
      } as any

      await plugin.onCleanComplete(ctx)

      const content = JSON.parse(fs.readFileSync(configPath, 'utf8')) as Record<string, unknown>
      expect(content.mcp).toEqual({})
      expect(content.plugin).toEqual(['a', 'b'])
    })

    it('should delete plugin field when opencode-rules@latest is the only plugin on clean', async () => {
      const opencodeDir = path.join(tempDir, '.config/opencode')
      fs.mkdirSync(opencodeDir, {recursive: true})
      const configPath = path.join(opencodeDir, 'opencode.json')
      fs.writeFileSync(
        configPath,
        JSON.stringify({mcp: {some: {command: 'npx'}}, plugin: ['opencode-rules@latest']}, null, 2),
        'utf8'
      )

      const ctx = {
        collectedInputContext: {
          workspace: {projects: [], directory: createMockRelativePath('.', tempDir)}
        },
        logger: {debug: vi.fn(), trace: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn()},
        dryRun: false
      } as any

      await plugin.onCleanComplete(ctx)

      const content = JSON.parse(fs.readFileSync(configPath, 'utf8')) as Record<string, unknown>
      expect(content.mcp).toEqual({})
      expect(content.plugin).toBeUndefined()
    })
  })

  describe('writeProjectOutputs sub-agent mdx regression', () => {
    it('should write sub agent file with .md extension when source has .mdx at project level', async () => {
      const mockProject: Project = {
        name: 'test-project',
        dirFromWorkspacePath: createMockRelativePath('project-a', tempDir),
        rootMemoryPrompt: {
          type: PromptKind.ProjectRootMemory,
          content: 'content',
          filePathKind: FilePathKind.Relative,
          dir: createMockRelativePath('.', tempDir) as any,
          markdownContents: [],
          length: 0,
          yamlFrontMatter: {namingCase: NamingCaseKind.KebabCase}
        },
        childMemoryPrompts: []
      }

      const mockAgent: SubAgentPrompt = {
        type: PromptKind.SubAgent,
        content: '# Code Review Agent',
        filePathKind: FilePathKind.Relative,
        dir: createMockRelativePath('reviewer.cn.mdx', tempDir),
        markdownContents: [],
        length: 0,
        yamlFrontMatter: {namingCase: NamingCaseKind.KebabCase, name: 'reviewer', description: 'Code review agent'}
      }

      const writeCtx = {
        ...mockContext,
        collectedInputContext: {
          ...mockContext.collectedInputContext,
          workspace: {
            ...mockContext.collectedInputContext.workspace,
            projects: [mockProject]
          },
          subAgents: [mockAgent]
        }
      }

      const results = await plugin.writeProjectOutputs(writeCtx)
      const agentResult = results.files.find(f => f.path.path === 'reviewer.cn.md')

      expect(agentResult).toBeDefined()
      expect(agentResult?.success).toBe(true)

      const writtenPath = path.join(tempDir, 'project-a', '.config/opencode', 'agents', 'reviewer.cn.md')
      expect(fs.existsSync(writtenPath)).toBe(true)
      expect(fs.existsSync(path.join(tempDir, 'project-a', '.config/opencode', 'agents', 'reviewer.cn.mdx'))).toBe(false)
      expect(fs.existsSync(path.join(tempDir, 'project-a', '.config/opencode', 'agents', 'reviewer.cn.mdx.md'))).toBe(false)
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

    it('should use globs field (not paths) in YAML frontmatter per opencode-rules format', () => {
      const rule = createMockRulePrompt({series: '01', ruleName: 'ts', globs: ['**/*.ts'], content: '# TS rule'})
      const content = plugin.testBuildRuleContent(rule)
      expect(content).toContain('globs:')
      expect(content).not.toMatch(/^paths:/m)
    })

    it('should output globs as YAML array items', () => {
      const rule = createMockRulePrompt({series: '01', ruleName: 'ts', globs: ['**/*.ts', '**/*.tsx'], content: '# Body'})
      const content = plugin.testBuildRuleContent(rule)
      expect(content).toMatch(/-\s+['"]?\*\*\/\*\.ts['"]?/) // Accept quoted or unquoted formats
      expect(content).toMatch(/-\s+['"]?\*\*\/\*\.tsx['"]?/)
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

    it('should register global rule files in ~/.config/opencode/rules/', async () => {
      const ctx = {
        ...mockContext,
        collectedInputContext: {...mockContext.collectedInputContext, rules: [createMockRulePrompt({series: '01', ruleName: 'ts', globs: ['**/*.ts'], scope: 'global'})]}
      }
      const files = await plugin.registerGlobalOutputFiles(ctx)
      const ruleFile = files.find(f => f.path === 'rule-01-ts.md')
      expect(ruleFile).toBeDefined()
      expect(ruleFile?.basePath).toBe(path.join(tempDir, '.config/opencode', 'rules'))
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
    it('should write global rule file to ~/.config/opencode/rules/', async () => {
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

      const filePath = path.join(tempDir, '.config/opencode', 'rules', 'rule-01-ts.md')
      expect(fs.existsSync(filePath)).toBe(true)
      const content = fs.readFileSync(filePath, 'utf8')
      expect(content).toContain('globs:')
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
      const filePath = path.join(tempDir, '.config/opencode', 'rules', 'rule-01-general.md')
      const content = fs.readFileSync(filePath, 'utf8')
      expect(content).toBe('# Always apply')
      expect(content).not.toContain('---')
    })
  })

  describe('writeProjectOutputs with rules', () => {
    it('should write project rule file to {project}/.opencode/rules/', async () => {
      const mockProject: Project = {
        name: 'proj',
        dirFromWorkspacePath: createMockRelativePath('proj', tempDir),
        rootMemoryPrompt: {type: PromptKind.ProjectRootMemory, content: '', filePathKind: FilePathKind.Relative, dir: createMockRelativePath('.', tempDir) as any, markdownContents: [], length: 0, yamlFrontMatter: {namingCase: NamingCaseKind.KebabCase}},
        childMemoryPrompts: []
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

      const filePath = path.join(tempDir, 'proj', '.opencode', 'rules', 'rule-02-api.md')
      expect(fs.existsSync(filePath)).toBe(true)
      const content = fs.readFileSync(filePath, 'utf8')
      expect(content).toContain('globs:')
      expect(content).toContain('# API rules')
    })
  })
})
