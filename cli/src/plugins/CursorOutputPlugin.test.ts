import type {
  FastCommandPrompt,
  GlobalMemoryPrompt,
  OutputPluginContext,
  OutputWriteContext,
  RulePrompt
} from '@/types'
import type {RelativePath} from '@/types/FileSystemTypes'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {parseMarkdown} from '@truenine/md-compiler/markdown'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import {createLogger} from '@/log'
import {FilePathKind, PromptKind} from '@/types'
import {CursorOutputPlugin} from './CursorOutputPlugin'

function createMockRelativePath(pathStr: string, basePath: string): RelativePath {
  return {
    pathKind: FilePathKind.Relative,
    path: pathStr,
    basePath,
    getDirectoryName: () => pathStr,
    getAbsolutePath: () => path.join(basePath, pathStr)
  }
}

function createMockGlobalMemoryPrompt(content: string, basePath: string): GlobalMemoryPrompt {
  return {
    type: PromptKind.GlobalMemory,
    content,
    length: content.length,
    filePathKind: FilePathKind.Relative,
    dir: createMockRelativePath('.', basePath),
    markdownContents: []
  } as GlobalMemoryPrompt
}

function createMockFastCommandPrompt(
  commandName: string,
  series?: string,
  basePath = ''
): FastCommandPrompt {
  const content = 'Run something'
  return {
    type: PromptKind.FastCommand,
    content,
    length: content.length,
    filePathKind: FilePathKind.Relative,
    dir: createMockRelativePath('.', basePath),
    markdownContents: [],
    yamlFrontMatter: {description: 'Fast command'},
    ...series != null && {series},
    commandName
  } as FastCommandPrompt
}

function createMockSkillPrompt(
  name: string,
  content = '# Skill',
  basePath = '',
  options?: {mcpConfig?: unknown}
) {
  return {
    yamlFrontMatter: {name, description: 'A skill'},
    dir: createMockRelativePath(name, basePath),
    content,
    length: content.length,
    type: PromptKind.Skill,
    filePathKind: FilePathKind.Relative,
    markdownContents: [],
    ...options
  }
}

class TestableCursorOutputPlugin extends CursorOutputPlugin {
  private mockHomeDir: string | null = null

  public setMockHomeDir(dir: string | null): void {
    this.mockHomeDir = dir
  }

  protected override getHomeDir(): string {
    if (this.mockHomeDir != null) return this.mockHomeDir
    return super.getHomeDir()
  }

  public buildRuleMdcContentForTest(rule: RulePrompt): string {
    return this.buildRuleMdcContent(rule)
  }
}

function createMockRulePrompt(
  options: {series: string, ruleName: string, globs: readonly string[], content?: string}
): RulePrompt {
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
    scope: 'global'
  } as RulePrompt
}

describe('cursor output plugin', () => {
  let tempDir: string, plugin: TestableCursorOutputPlugin

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-mcp-test-'))
    plugin = new TestableCursorOutputPlugin()
    plugin.setMockHomeDir(tempDir)
  })

  afterEach(() => {
    if (tempDir != null && fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, {recursive: true, force: true})
      }
      catch { // ignore cleanup errors
      }
    }
  })

  describe('constructor', () => {
    it('should have correct plugin name', () => expect(plugin.name).toBe('CursorOutputPlugin'))

    it('should depend on AgentsOutputPlugin', () => expect(plugin.dependsOn).toContain('AgentsOutputPlugin'))
  })

  describe('buildRuleMdcContent (Cursor rules front matter)', () => {
    it('should output only alwaysApply and globs in front matter', () => {
      const rule = createMockRulePrompt({
        series: 'cursor',
        ruleName: 'ts',
        globs: ['**/*.ts'],
        content: '# TypeScript rule'
      })
      const raw = plugin.buildRuleMdcContentForTest(rule)
      const lines = raw.split('\n')
      const start = lines.indexOf('---')
      const end = lines.indexOf('---', start + 1)
      expect(start).toBeGreaterThanOrEqual(0)
      expect(end).toBeGreaterThan(start)
      const fmLines = lines.slice(start + 1, end).filter(l => l.trim().length > 0)
      const keys = fmLines.map(l => l.split(':')[0]!.trim()).sort()
      expect(keys).toEqual(['alwaysApply', 'globs'])
    })

    it('should set alwaysApply to false', () => {
      const rule = createMockRulePrompt({
        series: 'cursor',
        ruleName: 'ts',
        globs: ['**/*.ts'],
        content: '# Body'
      })
      const raw = plugin.buildRuleMdcContentForTest(rule)
      const lines = raw.split('\n')
      const fmLine = lines.find(l => l.trimStart().startsWith('alwaysApply:'))
      expect(fmLine).toBeDefined()
      expect(fmLine).toBe('alwaysApply: false')
    })

    it('should output globs as comma-separated string, not YAML array', () => {
      const rule = createMockRulePrompt({
        series: 'cursor',
        ruleName: 'ts',
        globs: ['**/*.ts', '**/*.tsx'],
        content: '# Body'
      })
      const raw = plugin.buildRuleMdcContentForTest(rule)
      const lines = raw.split('\n')
      const globsLine = lines.find(l => l.trimStart().startsWith('globs:'))
      expect(globsLine).toBeDefined()
      expect(globsLine).toBe('globs: **/*.ts, **/*.tsx')
    })

    it('should output single glob as string without trailing comma', () => {
      const rule = createMockRulePrompt({
        series: 'cursor',
        ruleName: 'ts',
        globs: ['**/*.ts'],
        content: '# Body'
      })
      const raw = plugin.buildRuleMdcContentForTest(rule)
      const lines = raw.split('\n')
      const globsLine = lines.find(l => l.trimStart().startsWith('globs:'))
      expect(globsLine).toBeDefined()
      expect(globsLine).toBe('globs: **/*.ts')
    })

    it('should output empty string for empty globs', () => {
      const rule = createMockRulePrompt({
        series: 'cursor',
        ruleName: 'empty',
        globs: [],
        content: '# Body'
      })
      const raw = plugin.buildRuleMdcContentForTest(rule)
      const parsed = parseMarkdown(raw)
      const fm = parsed.yamlFrontMatter as Record<string, unknown>
      expect(fm.globs).toBe('')
    })

    it('should not contain YAML array syntax for globs in raw output', () => {
      const rule = createMockRulePrompt({
        series: 'cursor',
        ruleName: 'multi',
        globs: ['src/**', 'lib/**'],
        content: '# Body'
      })
      const raw = plugin.buildRuleMdcContentForTest(rule)
      expect(raw).not.toMatch(/\n\s*-\s+/)
      expect(raw).not.toContain('  - ')
    })

    it('should preserve rule body after front matter', () => {
      const body = '# My Rule\n\nOnly for **/*.kt.'
      const rule = createMockRulePrompt({
        series: 'cursor',
        ruleName: 'kt',
        globs: ['**/*.kt'],
        content: body
      })
      const raw = plugin.buildRuleMdcContentForTest(rule)
      const parsed = parseMarkdown(raw)
      expect(parsed.contentWithoutFrontMatter.trim()).toBe(body)
    })

    it('should not wrap glob patterns with double quotes in front matter', () => {
      const rule = createMockRulePrompt({
        series: 'cursor',
        ruleName: 'sql',
        globs: ['**/*.sql'],
        content: '# SQL rule'
      })
      const raw = plugin.buildRuleMdcContentForTest(rule)
      const lines = raw.split('\n')
      const globsLine = lines.find(l => l.trimStart().startsWith('globs:'))
      expect(globsLine).toBeDefined()
      expect(globsLine).toBe('globs: **/*.sql')
    })
  })

  describe('registerGlobalOutputFiles', () => {
    it('should register mcp.json and skill files when any skill has mcpConfig', async () => {
      const ctx = {
        collectedInputContext: {
          workspace: {projects: [], directory: createMockRelativePath('.', tempDir)},
          skills: [
            {
              ...createMockSkillPrompt('skill-a', '# Skill', tempDir),
              mcpConfig: {
                mcpServers: {foo: {command: 'npx', args: ['-y', 'mcp-foo']}}
              }
            }
          ]
        }
      } as unknown as OutputPluginContext

      const results = await plugin.registerGlobalOutputFiles(ctx)
      expect(results.some(r => r.path === 'mcp.json')).toBe(true)
      expect(results.some(r => r.path === path.join('skills-cursor', 'skill-a', 'SKILL.md'))).toBe(true)
      expect(results.some(r => r.path === path.join('skills-cursor', 'skill-a', 'mcp.json'))).toBe(true)
      const mcpEntry = results.find(r => r.path === 'mcp.json')
      expect(mcpEntry?.getAbsolutePath()).toBe(path.join(tempDir, '.cursor', 'mcp.json'))
    })

    it('should not register mcp.json when no skill has mcpConfig but register skill files', async () => {
      const ctx = {
        collectedInputContext: {
          workspace: {projects: [], directory: createMockRelativePath('.', tempDir)},
          skills: [createMockSkillPrompt('skill-a', '# Skill', tempDir)]
        }
      } as unknown as OutputPluginContext

      const results = await plugin.registerGlobalOutputFiles(ctx)
      expect(results.some(r => r.path === 'mcp.json')).toBe(false)
      expect(results.some(r => r.path === path.join('skills-cursor', 'skill-a', 'SKILL.md'))).toBe(true)
    })

    it('should not register mcp.json when skills is empty', async () => {
      const ctx = {
        collectedInputContext: {
          workspace: {projects: [], directory: createMockRelativePath('.', tempDir)},
          skills: []
        }
      } as unknown as OutputPluginContext

      const results = await plugin.registerGlobalOutputFiles(ctx)
      expect(results).toHaveLength(0)
    })

    it('should register command files under commands/ when fastCommands exist', async () => {
      const ctx = {
        collectedInputContext: {
          workspace: {projects: [], directory: createMockRelativePath('.', tempDir)},
          skills: [],
          fastCommands: [
            createMockFastCommandPrompt('compile', 'build', tempDir),
            createMockFastCommandPrompt('test', void 0, tempDir)
          ]
        }
      } as unknown as OutputPluginContext

      const results = await plugin.registerGlobalOutputFiles(ctx)
      expect(results.length).toBeGreaterThanOrEqual(2)
      const paths = results.map(r => r.path)
      expect(paths).toContain(path.join('commands', 'build-compile.md'))
      expect(paths).toContain(path.join('commands', 'test.md'))
      const compileEntry = results.find(r => r.path.includes('build-compile'))
      expect(compileEntry?.getAbsolutePath()).toBe(path.join(tempDir, '.cursor', 'commands', 'build-compile.md'))
    })

    it('should register both mcp.json and command files when skills have mcpConfig and fastCommands exist', async () => {
      const ctx = {
        collectedInputContext: {
          workspace: {projects: [], directory: createMockRelativePath('.', tempDir)},
          skills: [
            {
              ...createMockSkillPrompt('skill-a', '# Skill', tempDir),
              mcpConfig: {
                mcpServers: {foo: {command: 'npx', args: ['-y', 'mcp-foo']}},
                rawContent: '{}'
              }
            }
          ],
          fastCommands: [createMockFastCommandPrompt('lint', void 0, tempDir)]
        }
      } as unknown as OutputPluginContext

      const results = await plugin.registerGlobalOutputFiles(ctx)
      expect(results.some(r => r.path === 'mcp.json')).toBe(true)
      expect(results.some(r => r.path === path.join('commands', 'lint.md'))).toBe(true)
    })

    it('should not register preserved skill files (create-rule, create-skill, etc.)', async () => {
      const ctx = {
        collectedInputContext: {
          workspace: {projects: [], directory: createMockRelativePath('.', tempDir)},
          skills: [
            createMockSkillPrompt('create-rule', '# Skill', tempDir),
            createMockSkillPrompt('my-custom-skill', '# Skill', tempDir)
          ]
        }
      } as unknown as OutputPluginContext

      const results = await plugin.registerGlobalOutputFiles(ctx)
      expect(results.some(r => r.path.includes('create-rule'))).toBe(false)
      expect(results.some(r => r.path === path.join('skills-cursor', 'my-custom-skill', 'SKILL.md'))).toBe(true)
    })
  })

  describe('registerGlobalOutputDirs', () => {
    it('should return empty when no fastCommands and no skills', async () => {
      const ctx = {
        collectedInputContext: {
          workspace: {projects: [], directory: createMockRelativePath('.', tempDir)},
          skills: []
        }
      } as unknown as OutputPluginContext

      const results = await plugin.registerGlobalOutputDirs(ctx)
      expect(results).toHaveLength(0)
    })

    it('should register commands dir when fastCommands exist', async () => {
      const ctx = {
        collectedInputContext: {
          workspace: {projects: [], directory: createMockRelativePath('.', tempDir)},
          skills: [],
          fastCommands: [createMockFastCommandPrompt('compile', void 0, tempDir)]
        }
      } as unknown as OutputPluginContext

      const results = await plugin.registerGlobalOutputDirs(ctx)
      expect(results).toHaveLength(1)
      expect(results[0].path).toBe('commands')
      expect(results[0].getAbsolutePath()).toBe(path.join(tempDir, '.cursor', 'commands'))
    })

    it('should register skills-cursor/<skillName> when skills exist', async () => {
      const ctx = {
        collectedInputContext: {
          workspace: {projects: [], directory: createMockRelativePath('.', tempDir)},
          skills: [
            createMockSkillPrompt('custom-skill', '# Skill', tempDir)
          ]
        }
      } as unknown as OutputPluginContext

      const results = await plugin.registerGlobalOutputDirs(ctx)
      const skillDirs = results.filter(r => r.path.startsWith('skills-cursor'))
      expect(skillDirs).toHaveLength(1)
      expect(skillDirs[0].path).toBe(path.join('skills-cursor', 'custom-skill'))
      expect(skillDirs[0].getAbsolutePath()).toBe(path.join(tempDir, '.cursor', 'skills-cursor', 'custom-skill'))
    })

    it('should not register preserved skill dirs (create-rule, create-skill, etc.)', async () => {
      const ctx = {
        collectedInputContext: {
          workspace: {projects: [], directory: createMockRelativePath('.', tempDir)},
          skills: [
            createMockSkillPrompt('create-rule', '# Skill', tempDir),
            createMockSkillPrompt('custom-skill', '# Skill', tempDir)
          ]
        }
      } as unknown as OutputPluginContext

      const results = await plugin.registerGlobalOutputDirs(ctx)
      const skillDirs = results.filter(r => r.path.startsWith('skills-cursor'))
      expect(skillDirs).toHaveLength(1)
      expect(skillDirs[0].path).toBe(path.join('skills-cursor', 'custom-skill'))
      expect(results.some(r => r.path.includes('create-rule'))).toBe(false)
    })
  })

  describe('canWrite', () => {
    it('should return true when skills exist', async () => {
      const ctx = {
        collectedInputContext: {
          workspace: {projects: [], directory: createMockRelativePath('.', tempDir)},
          skills: [{yamlFrontMatter: {name: 's'}, dir: createMockRelativePath('s', tempDir)}]
        }
      } as unknown as OutputWriteContext

      const result = await plugin.canWrite(ctx)
      expect(result).toBe(true)
    })

    it('should return false when no skills and no fastCommands', async () => {
      const ctx = {
        collectedInputContext: {
          workspace: {projects: [], directory: createMockRelativePath('.', tempDir)},
          skills: [],
          fastCommands: []
        }
      } as unknown as OutputWriteContext

      const result = await plugin.canWrite(ctx)
      expect(result).toBe(false)
    })

    it('should return true when only fastCommands exist', async () => {
      const ctx = {
        collectedInputContext: {
          workspace: {projects: [], directory: createMockRelativePath('.', tempDir)},
          skills: [],
          fastCommands: [createMockFastCommandPrompt('lint', void 0, tempDir)]
        }
      } as unknown as OutputWriteContext

      const result = await plugin.canWrite(ctx)
      expect(result).toBe(true)
    })
  })

  describe('writeGlobalOutputs', () => {
    it('should write merged mcp.json with stdio server from skills', async () => {
      const ctx = {
        collectedInputContext: {
          workspace: {projects: [], directory: createMockRelativePath('.', tempDir)},
          skills: [
            {
              ...createMockSkillPrompt('skill-a', '# Skill', tempDir),
              mcpConfig: {
                mcpServers: {
                  myServer: {command: 'npx', args: ['-y', 'mcp-server'], env: {API_KEY: 'secret'}}
                },
                rawContent: '{"mcpServers":{"myServer":{"command":"npx","args":["-y","mcp-server"],"env":{"API_KEY":"secret"}}}}'
              }
            }
          ]
        },
        logger: createLogger('test', 'debug'),
        dryRun: false
      } as unknown as OutputWriteContext

      const results = await plugin.writeGlobalOutputs(ctx)
      expect(results.files.length).toBeGreaterThanOrEqual(2)
      expect(results.files.some(f => f.path.path === 'mcp.json')).toBe(true)
      expect(results.files.every(f => f.success)).toBe(true)

      const mcpPath = path.join(tempDir, '.cursor', 'mcp.json')
      expect(fs.existsSync(mcpPath)).toBe(true)
      const content = JSON.parse(fs.readFileSync(mcpPath, 'utf8')) as Record<string, unknown>
      expect(content.mcpServers).toBeDefined()
      const servers = content.mcpServers as Record<string, unknown>
      expect(servers.myServer).toEqual({
        command: 'npx',
        args: ['-y', 'mcp-server'],
        env: {API_KEY: 'secret'}
      })
    })

    it('should merge with existing mcp.json and preserve user entries', async () => {
      const cursorDir = path.join(tempDir, '.cursor')
      fs.mkdirSync(cursorDir, {recursive: true})
      const mcpPath = path.join(cursorDir, 'mcp.json')
      const existing = {
        mcpServers: {
          userServer: {command: 'python', args: ['server.py']},
          fromSkill: {url: 'https://old.example.com/mcp'}
        }
      }
      fs.writeFileSync(mcpPath, JSON.stringify(existing, null, 2))

      const ctx = {
        collectedInputContext: {
          workspace: {projects: [], directory: createMockRelativePath('.', tempDir)},
          skills: [
            {
              ...createMockSkillPrompt('skill-a', '# Skill', tempDir),
              mcpConfig: {
                mcpServers: {
                  fromSkill: {command: 'npx', args: ['-y', 'new-skill-mcp']}
                },
                rawContent: '{}'
              }
            }
          ]
        },
        logger: createLogger('test', 'debug'),
        dryRun: false
      } as unknown as OutputWriteContext

      await plugin.writeGlobalOutputs(ctx)

      const content = JSON.parse(fs.readFileSync(mcpPath, 'utf8')) as Record<string, unknown>
      const servers = content.mcpServers as Record<string, unknown>
      expect(servers.userServer).toEqual({command: 'python', args: ['server.py']})
      expect(servers.fromSkill).toEqual({command: 'npx', args: ['-y', 'new-skill-mcp']})
    })

    it('should transform remote server url or serverUrl to url', async () => {
      const ctx = {
        collectedInputContext: {
          workspace: {projects: [], directory: createMockRelativePath('.', tempDir)},
          skills: [
            {
              ...createMockSkillPrompt('skill-remote', '# Skill', tempDir),
              mcpConfig: {
                mcpServers: {
                  remote: {serverUrl: 'https://api.example.com/mcp', headers: {Authorization: 'Bearer x'}}
                },
                rawContent: '{}'
              }
            }
          ]
        },
        logger: createLogger('test', 'debug'),
        dryRun: false
      } as unknown as OutputWriteContext

      await plugin.writeGlobalOutputs(ctx)

      const mcpPath = path.join(tempDir, '.cursor', 'mcp.json')
      const content = JSON.parse(fs.readFileSync(mcpPath, 'utf8')) as Record<string, unknown>
      const servers = content.mcpServers as Record<string, unknown>
      expect(servers.remote).toEqual({
        url: 'https://api.example.com/mcp',
        headers: {Authorization: 'Bearer x'}
      })
    })

    it('should write fast command files to ~/.cursor/commands/', async () => {
      const ctx = {
        collectedInputContext: {
          workspace: {projects: [], directory: createMockRelativePath('.', tempDir)},
          skills: [],
          fastCommands: [
            createMockFastCommandPrompt('compile', 'build', tempDir),
            createMockFastCommandPrompt('test', void 0, tempDir)
          ]
        },
        logger: createLogger('test', 'debug'),
        dryRun: false
      } as unknown as OutputWriteContext

      const results = await plugin.writeGlobalOutputs(ctx)
      expect(results.files).toHaveLength(2)

      const commandsDir = path.join(tempDir, '.cursor', 'commands')
      expect(fs.existsSync(commandsDir)).toBe(true)

      const buildCompilePath = path.join(commandsDir, 'build-compile.md')
      const testPath = path.join(commandsDir, 'test.md')
      expect(fs.existsSync(buildCompilePath)).toBe(true)
      expect(fs.existsSync(testPath)).toBe(true)

      const buildCompileContent = fs.readFileSync(buildCompilePath, 'utf8')
      expect(buildCompileContent).toContain('description: Fast command')
      expect(buildCompileContent).toContain('Run something')

      const testContent = fs.readFileSync(testPath, 'utf8')
      expect(testContent).toContain('Run something')
    })

    it('should write skill to ~/.cursor/skills-cursor/<name>/SKILL.md', async () => {
      const ctx = {
        collectedInputContext: {
          workspace: {projects: [], directory: createMockRelativePath('.', tempDir)},
          skills: [createMockSkillPrompt('my-skill', '# My Skill Content', tempDir)]
        },
        logger: createLogger('test', 'debug'),
        dryRun: false
      } as unknown as OutputWriteContext

      await plugin.writeGlobalOutputs(ctx)

      const skillPath = path.join(tempDir, '.cursor', 'skills-cursor', 'my-skill', 'SKILL.md')
      expect(fs.existsSync(skillPath)).toBe(true)
      const content = fs.readFileSync(skillPath, 'utf8')
      expect(content).toContain('name: my-skill')
      expect(content).toContain('# My Skill Content')
    })

    it('should not overwrite preserved skill (create-rule)', async () => {
      const preservedSkillDir = path.join(tempDir, '.cursor', 'skills-cursor', 'create-rule')
      fs.mkdirSync(preservedSkillDir, {recursive: true})
      const originalContent = '# Original Cursor built-in skill'
      fs.writeFileSync(path.join(preservedSkillDir, 'SKILL.md'), originalContent)

      const ctx = {
        collectedInputContext: {
          workspace: {projects: [], directory: createMockRelativePath('.', tempDir)},
          skills: [
            createMockSkillPrompt('create-rule', '# Would overwrite', tempDir),
            createMockSkillPrompt('custom-skill', '# Custom', tempDir)
          ]
        },
        logger: createLogger('test', 'debug'),
        dryRun: false
      } as unknown as OutputWriteContext

      await plugin.writeGlobalOutputs(ctx)

      const preservedPath = path.join(preservedSkillDir, 'SKILL.md')
      expect(fs.readFileSync(preservedPath, 'utf8')).toBe(originalContent)
      const customPath = path.join(tempDir, '.cursor', 'skills-cursor', 'custom-skill', 'SKILL.md')
      expect(fs.existsSync(customPath)).toBe(true)
      expect(fs.readFileSync(customPath, 'utf8')).toContain('# Custom')
    })
  })

  describe('clean effect', () => {
    it('should reset mcp.json to empty mcpServers shell on clean', async () => {
      const cursorDir = path.join(tempDir, '.cursor')
      fs.mkdirSync(cursorDir, {recursive: true})
      const mcpPath = path.join(cursorDir, 'mcp.json')
      fs.writeFileSync(mcpPath, JSON.stringify({mcpServers: {some: {command: 'npx'}}}, null, 2))

      const ctx = {
        collectedInputContext: {
          workspace: {projects: [], directory: createMockRelativePath('.', tempDir)}
        },
        logger: createLogger('test', 'debug'),
        dryRun: false
      } as any

      await plugin.onCleanComplete(ctx)

      expect(fs.existsSync(mcpPath)).toBe(true)
      const content = JSON.parse(fs.readFileSync(mcpPath, 'utf8')) as Record<string, unknown>
      expect(content).toEqual({mcpServers: {}})
    })

    it('should not write on clean when dryRun is true', async () => {
      const cursorDir = path.join(tempDir, '.cursor')
      fs.mkdirSync(cursorDir, {recursive: true})
      const mcpPath = path.join(cursorDir, 'mcp.json')
      const original = {mcpServers: {keep: {command: 'npx'}}}
      fs.writeFileSync(mcpPath, JSON.stringify(original, null, 2))

      const ctx = {
        collectedInputContext: {
          workspace: {projects: [], directory: createMockRelativePath('.', tempDir)}
        },
        logger: createLogger('test', 'debug'),
        dryRun: true
      } as any

      await plugin.onCleanComplete(ctx)

      const content = JSON.parse(fs.readFileSync(mcpPath, 'utf8')) as Record<string, unknown>
      expect(content).toEqual(original)
    })
  })

  describe('project outputs', () => {
    it('should implement writeProjectOutputs', () => expect(plugin.writeProjectOutputs).toBeDefined())

    it('should implement registerProjectOutputFiles and registerProjectOutputDirs', () => {
      expect(plugin.registerProjectOutputFiles).toBeDefined()
      expect(plugin.registerProjectOutputDirs).toBeDefined()
    })

    it('should implement registerGlobalOutputDirs for commands dir', () => expect(plugin.registerGlobalOutputDirs).toBeDefined())

    it('should register .cursor/rules dir for each project when globalMemory exists', async () => {
      const projectDir = createMockRelativePath('project-a', tempDir)
      const ctx = {
        collectedInputContext: {
          workspace: {
            projects: [{name: 'project-a', dirFromWorkspacePath: projectDir}],
            directory: createMockRelativePath('.', tempDir)
          },
          globalMemory: createMockGlobalMemoryPrompt('Global rules', tempDir)
        }
      } as unknown as OutputPluginContext

      const dirs = await plugin.registerProjectOutputDirs(ctx)
      expect(dirs.length).toBe(1)
      expect(dirs[0].path).toBe(path.join('project-a', '.cursor', 'rules'))
      expect(dirs[0].getAbsolutePath()).toBe(path.join(tempDir, 'project-a', '.cursor', 'rules'))
    })

    it('should register .cursor/rules/global.mdc for each project when globalMemory exists', async () => {
      const projectDir = createMockRelativePath('project-a', tempDir)
      const ctx = {
        collectedInputContext: {
          workspace: {
            projects: [{name: 'project-a', dirFromWorkspacePath: projectDir}],
            directory: createMockRelativePath('.', tempDir)
          },
          globalMemory: createMockGlobalMemoryPrompt('Global rules', tempDir)
        }
      } as unknown as OutputPluginContext

      const files = await plugin.registerProjectOutputFiles(ctx)
      const paths = files.map(f => f.path.replaceAll('\\', '/'))

      expect(paths).toContain(path.join('project-a', '.cursor', 'rules', 'global.mdc').replaceAll('\\', '/'))

      const globalEntry = files.find(f => f.path.replaceAll('\\', '/') === 'project-a/.cursor/rules/global.mdc')
      expect(globalEntry?.getAbsolutePath().replaceAll('\\', '/')).toBe(
        path.join(tempDir, 'project-a', '.cursor', 'rules', 'global.mdc').replaceAll('\\', '/')
      )
    })

    it('should not register project rules when globalMemory is null', async () => {
      const projectDir = createMockRelativePath('project-a', tempDir)
      const ctx = {
        collectedInputContext: {
          workspace: {
            projects: [{name: 'project-a', dirFromWorkspacePath: projectDir}],
            directory: createMockRelativePath('.', tempDir)
          },
          globalMemory: void 0
        }
      } as unknown as OutputPluginContext

      const dirs = await plugin.registerProjectOutputDirs(ctx)
      const files = await plugin.registerProjectOutputFiles(ctx)
      expect(dirs.length).toBe(0)
      expect(files.length).toBe(0)
    })

    it('should return true from canWrite when only globalMemory and projects exist', async () => {
      const projectDir = createMockRelativePath('project-a', tempDir)
      const ctx = {
        collectedInputContext: {
          workspace: {
            projects: [{name: 'project-a', dirFromWorkspacePath: projectDir}],
            directory: createMockRelativePath('.', tempDir)
          },
          globalMemory: createMockGlobalMemoryPrompt('Global rules', tempDir),
          skills: [],
          fastCommands: []
        },
        logger: createLogger('test', 'debug'),
        dryRun: false
      } as unknown as OutputWriteContext

      const result = await plugin.canWrite(ctx)
      expect(result).toBe(true)
    })

    it('should write global.mdc with alwaysApply true and global content', async () => {
      const projectDir = createMockRelativePath('project-a', tempDir)
      const globalContent = '# Global prompt\n\nAlways apply this.'
      const ctx = {
        collectedInputContext: {
          workspace: {
            projects: [{name: 'project-a', dirFromWorkspacePath: projectDir}],
            directory: createMockRelativePath('.', tempDir)
          },
          globalMemory: createMockGlobalMemoryPrompt(globalContent, tempDir)
        },
        logger: createLogger('test', 'debug'),
        dryRun: false
      } as unknown as OutputWriteContext

      const results = await plugin.writeProjectOutputs(ctx)
      expect(results.files.length).toBe(1)
      expect(results.files[0].success).toBe(true)

      const fullPath = path.join(tempDir, 'project-a', '.cursor', 'rules', 'global.mdc')
      expect(fs.existsSync(fullPath)).toBe(true)
      const content = fs.readFileSync(fullPath, 'utf8')
      expect(content).toContain('alwaysApply: true')
      expect(content).toContain('Global prompt (synced)')
      expect(content).toContain(globalContent)
    })

    it('should not write files on dryRun', async () => {
      const projectDir = createMockRelativePath('project-a', tempDir)
      const ctx = {
        collectedInputContext: {
          workspace: {
            projects: [{name: 'project-a', dirFromWorkspacePath: projectDir}],
            directory: createMockRelativePath('.', tempDir)
          },
          globalMemory: createMockGlobalMemoryPrompt('Global rules', tempDir)
        },
        logger: createLogger('test', 'debug'),
        dryRun: true
      } as unknown as OutputWriteContext

      const results = await plugin.writeProjectOutputs(ctx)
      expect(results.files.length).toBe(1)
      expect(results.files[0].success).toBe(true)

      const fullPath = path.join(tempDir, 'project-a', '.cursor', 'rules', 'global.mdc')
      expect(fs.existsSync(fullPath)).toBe(false)
    })
  })
})
