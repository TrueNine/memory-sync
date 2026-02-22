import type {
  FastCommandPrompt,
  GlobalMemoryPrompt,
  OutputPluginContext,
  OutputWriteContext,
  RelativePath,
  RulePrompt,
  SkillPrompt
} from '@truenine/plugin-shared'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {createLogger, FilePathKind, NamingCaseKind, PromptKind} from '@truenine/plugin-shared'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import {WindsurfOutputPlugin} from './WindsurfOutputPlugin'

function createMockRelativePath(pathStr: string, basePath: string): RelativePath {
  return {
    pathKind: FilePathKind.Relative,
    path: pathStr,
    basePath,
    getDirectoryName: () => pathStr,
    getAbsolutePath: () => path.join(basePath, pathStr)
  }
}

function createMockRulePrompt(
  series: string,
  ruleName: string,
  globs: readonly string[],
  scope: 'global' | 'project',
  seriName?: string
): RulePrompt {
  const content = '# Rule body\n\nFollow this rule.'
  return {
    type: PromptKind.Rule,
    content,
    length: content.length,
    filePathKind: FilePathKind.Relative,
    dir: createMockRelativePath('.', ''),
    markdownContents: [],
    yamlFrontMatter: {
      description: 'Rule description',
      globs,
      namingCase: NamingCaseKind.KebabCase
    },
    series,
    ruleName,
    globs,
    scope,
    ...seriName != null && {seriName}
  } as RulePrompt
}

function createMockGlobalMemoryPrompt(content: string, basePath: string): GlobalMemoryPrompt {
  return {
    type: PromptKind.GlobalMemory,
    content,
    length: content.length,
    filePathKind: FilePathKind.Relative,
    dir: createMockRelativePath('.', basePath),
    markdownContents: [],
    parentDirectoryPath: {
      type: 'UserHome',
      directory: createMockRelativePath('.codeium/windsurf', basePath)
    }
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
    yamlFrontMatter: {description: 'Fast command', namingCase: NamingCaseKind.KebabCase},
    ...series != null && {series},
    commandName
  } as FastCommandPrompt
}

function createMockSkillPrompt(
  name: string,
  content = '# Skill',
  basePath = '',
  options?: {childDocs?: {relativePath: string, content: unknown}[], resources?: {relativePath: string, content: string, encoding: 'text' | 'base64'}[]}
): SkillPrompt {
  return {
    yamlFrontMatter: {name, description: 'A skill', namingCase: NamingCaseKind.KebabCase},
    dir: createMockRelativePath(name, basePath),
    content,
    length: content.length,
    type: PromptKind.Skill,
    filePathKind: FilePathKind.Relative,
    markdownContents: [],
    ...options
  } as unknown as SkillPrompt
}

class TestableWindsurfOutputPlugin extends WindsurfOutputPlugin {
  private mockHomeDir: string | null = null

  public setMockHomeDir(dir: string | null): void {
    this.mockHomeDir = dir
  }

  protected override getHomeDir(): string {
    if (this.mockHomeDir != null) return this.mockHomeDir
    return super.getHomeDir()
  }
}

describe('windsurf output plugin', () => {
  let tempDir: string, plugin: TestableWindsurfOutputPlugin

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'windsurf-test-'))
    plugin = new TestableWindsurfOutputPlugin()
    plugin.setMockHomeDir(tempDir)
  })

  afterEach(() => {
    if (tempDir != null && fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, {recursive: true, force: true})
      }
      catch {
      } // ignore cleanup errors
    }
  })

  describe('constructor', () => {
    it('should have correct plugin name', () => expect(plugin.name).toBe('WindsurfOutputPlugin'))

    it('should depend on AgentsOutputPlugin', () => expect(plugin.dependsOn).toContain('AgentsOutputPlugin'))
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

    it('should register global_workflows dir when fastCommands exist', async () => {
      const ctx = {
        collectedInputContext: {
          workspace: {projects: [], directory: createMockRelativePath('.', tempDir)},
          skills: [],
          fastCommands: [createMockFastCommandPrompt('compile', void 0, tempDir)]
        }
      } as unknown as OutputPluginContext

      const results = await plugin.registerGlobalOutputDirs(ctx)
      expect(results).toHaveLength(1)
      expect(results[0]?.path).toBe('global_workflows')
      expect(results[0]?.getAbsolutePath()).toBe(path.join(tempDir, '.codeium', 'windsurf', 'global_workflows'))
    })

    it('should register skills/<skillName> dir when skills exist', async () => {
      const ctx = {
        collectedInputContext: {
          workspace: {projects: [], directory: createMockRelativePath('.', tempDir)},
          skills: [createMockSkillPrompt('custom-skill', '# Skill', tempDir)]
        }
      } as unknown as OutputPluginContext

      const results = await plugin.registerGlobalOutputDirs(ctx)
      expect(results).toHaveLength(1)
      expect(results[0]?.path).toBe(path.join('skills', 'custom-skill'))
      expect(results[0]?.getAbsolutePath()).toBe(path.join(tempDir, '.codeium', 'windsurf', 'skills', 'custom-skill'))
    })

    it('should register both workflows and skills dirs when both exist', async () => {
      const ctx = {
        collectedInputContext: {
          workspace: {projects: [], directory: createMockRelativePath('.', tempDir)},
          skills: [createMockSkillPrompt('skill-a', '# Skill', tempDir)],
          fastCommands: [createMockFastCommandPrompt('compile', void 0, tempDir)]
        }
      } as unknown as OutputPluginContext

      const results = await plugin.registerGlobalOutputDirs(ctx)
      expect(results).toHaveLength(2)
      const paths = results.map(r => r.path)
      expect(paths).toContain('global_workflows')
      expect(paths).toContain(path.join('skills', 'skill-a'))
    })
  })

  describe('registerGlobalOutputFiles', () => {
    it('should return empty when no fastCommands and no skills', async () => {
      const ctx = {
        collectedInputContext: {
          workspace: {projects: [], directory: createMockRelativePath('.', tempDir)},
          skills: []
        }
      } as unknown as OutputPluginContext

      const results = await plugin.registerGlobalOutputFiles(ctx)
      expect(results).toHaveLength(0)
    })

    it('should register workflow files under global_workflows/ when fastCommands exist', async () => {
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
      expect(paths).toContain(path.join('global_workflows', 'build-compile.md'))
      expect(paths).toContain(path.join('global_workflows', 'test.md'))
      const compileEntry = results.find(r => r.path.includes('build-compile'))
      expect(compileEntry?.getAbsolutePath()).toBe(path.join(tempDir, '.codeium', 'windsurf', 'global_workflows', 'build-compile.md'))
    })

    it('should register skill files under skills/<name>/SKILL.md when skills exist', async () => {
      const ctx = {
        collectedInputContext: {
          workspace: {projects: [], directory: createMockRelativePath('.', tempDir)},
          skills: [createMockSkillPrompt('my-skill', '# Skill', tempDir)]
        }
      } as unknown as OutputPluginContext

      const results = await plugin.registerGlobalOutputFiles(ctx)
      expect(results.some(r => r.path === path.join('skills', 'my-skill', 'SKILL.md'))).toBe(true)
    })

    it('should register childDocs when skills have them', async () => {
      const ctx = {
        collectedInputContext: {
          workspace: {projects: [], directory: createMockRelativePath('.', tempDir)},
          skills: [
            createMockSkillPrompt('my-skill', '# Skill', tempDir, {
              childDocs: [{relativePath: 'doc.cn.mdx', content: '# Child Doc'}]
            })
          ]
        }
      } as unknown as OutputPluginContext

      const results = await plugin.registerGlobalOutputFiles(ctx)
      expect(results.some(r => r.path === path.join('skills', 'my-skill', 'doc.cn.md'))).toBe(true)
    })

    it('should register resources when skills have them', async () => {
      const ctx = {
        collectedInputContext: {
          workspace: {projects: [], directory: createMockRelativePath('.', tempDir)},
          skills: [
            createMockSkillPrompt('my-skill', '# Skill', tempDir, {
              resources: [{relativePath: 'resource.json', content: '{}', encoding: 'text'}]
            })
          ]
        }
      } as unknown as OutputPluginContext

      const results = await plugin.registerGlobalOutputFiles(ctx)
      expect(results.some(r => r.path === path.join('skills', 'my-skill', 'resource.json'))).toBe(true)
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

    it('should return false when no skills and no fastCommands and no globalMemory', async () => {
      const ctx = {
        collectedInputContext: {
          workspace: {projects: [], directory: createMockRelativePath('.', tempDir)},
          skills: [],
          fastCommands: [],
          globalMemory: null
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
          fastCommands: [createMockFastCommandPrompt('lint', void 0, tempDir)],
          globalMemory: null
        }
      } as unknown as OutputWriteContext

      const result = await plugin.canWrite(ctx)
      expect(result).toBe(true)
    })

    it('should return true when only globalMemory exists', async () => {
      const ctx = {
        collectedInputContext: {
          workspace: {projects: [], directory: createMockRelativePath('.', tempDir)},
          skills: [],
          fastCommands: [],
          globalMemory: createMockGlobalMemoryPrompt('Global rules', tempDir)
        }
      } as unknown as OutputWriteContext

      const result = await plugin.canWrite(ctx)
      expect(result).toBe(true)
    })

    it('should return true when .codeiumignore exists in aiAgentIgnoreConfigFiles', async () => {
      const ctx = {
        collectedInputContext: {
          workspace: {projects: [], directory: createMockRelativePath('.', tempDir)},
          skills: [],
          fastCommands: [],
          globalMemory: null,
          rules: [],
          aiAgentIgnoreConfigFiles: [{fileName: '.codeiumignore', content: 'node_modules/'}]
        }
      } as unknown as OutputWriteContext

      const result = await plugin.canWrite(ctx)
      expect(result).toBe(true)
    })

    it('should return false when only .codeignore (wrong name) exists in aiAgentIgnoreConfigFiles', async () => { // @see https://docs.windsurf.com/context-awareness/windsurf-ignore#windsurf-ignore
      const ctx = {
        collectedInputContext: {
          workspace: {projects: [], directory: createMockRelativePath('.', tempDir)},
          skills: [],
          fastCommands: [],
          globalMemory: null,
          rules: [],
          aiAgentIgnoreConfigFiles: [{fileName: '.codeignore', content: 'node_modules/'}]
        }
      } as unknown as OutputWriteContext

      const result = await plugin.canWrite(ctx)
      expect(result).toBe(false)
    })
  })

  describe('writeGlobalOutputs', () => {
    it('should write global memory to ~/.codeium/windsurf/memories/global_rules.md', async () => {
      const globalContent = '# Global Rules\n\nAlways apply these rules.'
      const ctx = {
        collectedInputContext: {
          workspace: {projects: [], directory: createMockRelativePath('.', tempDir)},
          globalMemory: createMockGlobalMemoryPrompt(globalContent, tempDir),
          skills: [],
          fastCommands: []
        },
        logger: createLogger('test', 'debug'),
        dryRun: false
      } as unknown as OutputWriteContext

      const results = await plugin.writeGlobalOutputs(ctx)
      expect(results.files.length).toBeGreaterThanOrEqual(1)
      expect(results.files[0]?.success).toBe(true)

      const memoryPath = path.join(tempDir, '.codeium', 'windsurf', 'memories', 'global_rules.md')
      expect(fs.existsSync(memoryPath)).toBe(true)
      const content = fs.readFileSync(memoryPath, 'utf8')
      expect(content).toContain(globalContent)
    })

    it('should write fast command files to ~/.codeium/windsurf/global_workflows/', async () => {
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

      const workflowsDir = path.join(tempDir, '.codeium', 'windsurf', 'global_workflows')
      expect(fs.existsSync(workflowsDir)).toBe(true)

      const buildCompilePath = path.join(workflowsDir, 'build-compile.md')
      const testPath = path.join(workflowsDir, 'test.md')
      expect(fs.existsSync(buildCompilePath)).toBe(true)
      expect(fs.existsSync(testPath)).toBe(true)

      const buildCompileContent = fs.readFileSync(buildCompilePath, 'utf8')
      expect(buildCompileContent).toContain('Run something')
    })

    it('should write skill to ~/.codeium/windsurf/skills/<name>/SKILL.md', async () => {
      const ctx = {
        collectedInputContext: {
          workspace: {projects: [], directory: createMockRelativePath('.', tempDir)},
          skills: [createMockSkillPrompt('my-skill', '# My Skill Content', tempDir)],
          globalMemory: null,
          fastCommands: []
        },
        logger: createLogger('test', 'debug'),
        dryRun: false
      } as unknown as OutputWriteContext

      const results = await plugin.writeGlobalOutputs(ctx)
      expect(results.files.length).toBeGreaterThanOrEqual(1)
      expect(results.files.every(f => f.success)).toBe(true)

      const skillPath = path.join(tempDir, '.codeium', 'windsurf', 'skills', 'my-skill', 'SKILL.md')
      expect(fs.existsSync(skillPath)).toBe(true)
      const content = fs.readFileSync(skillPath, 'utf8')
      expect(content).toContain('name: my-skill')
      expect(content).toContain('# My Skill Content')
    })

    it('should write childDocs when skills have them', async () => {
      const ctx = {
        collectedInputContext: {
          workspace: {projects: [], directory: createMockRelativePath('.', tempDir)},
          skills: [
            createMockSkillPrompt('my-skill', '# Skill', tempDir, {
              childDocs: [{relativePath: 'guide.cn.mdx', content: '# Guide Content'}]
            })
          ],
          globalMemory: null,
          fastCommands: []
        },
        logger: createLogger('test', 'debug'),
        dryRun: false
      } as unknown as OutputWriteContext

      await plugin.writeGlobalOutputs(ctx)

      const childDocPath = path.join(tempDir, '.codeium', 'windsurf', 'skills', 'my-skill', 'guide.cn.md')
      expect(fs.existsSync(childDocPath)).toBe(true)
      const content = fs.readFileSync(childDocPath, 'utf8')
      expect(content).toContain('# Guide Content')
    })

    it('should write resources when skills have them', async () => {
      const ctx = {
        collectedInputContext: {
          workspace: {projects: [], directory: createMockRelativePath('.', tempDir)},
          skills: [
            createMockSkillPrompt('my-skill', '# Skill', tempDir, {
              resources: [{relativePath: 'schema.json', content: '{"type": "object"}', encoding: 'text'}]
            })
          ],
          globalMemory: null,
          fastCommands: []
        },
        logger: createLogger('test', 'debug'),
        dryRun: false
      } as unknown as OutputWriteContext

      await plugin.writeGlobalOutputs(ctx)

      const resourcePath = path.join(tempDir, '.codeium', 'windsurf', 'skills', 'my-skill', 'schema.json')
      expect(fs.existsSync(resourcePath)).toBe(true)
      const content = fs.readFileSync(resourcePath, 'utf8')
      expect(content).toContain('{"type": "object"}')
    })

    it('should not write files on dryRun', async () => {
      const ctx = {
        collectedInputContext: {
          workspace: {projects: [], directory: createMockRelativePath('.', tempDir)},
          globalMemory: createMockGlobalMemoryPrompt('Global rules', tempDir),
          skills: [],
          fastCommands: []
        },
        logger: createLogger('test', 'debug'),
        dryRun: true
      } as unknown as OutputWriteContext

      const results = await plugin.writeGlobalOutputs(ctx)
      expect(results.files.length).toBeGreaterThanOrEqual(1)
      expect(results.files[0]?.success).toBe(true)

      const memoryPath = path.join(tempDir, '.codeium', 'windsurf', 'memories', 'global_rules.md')
      expect(fs.existsSync(memoryPath)).toBe(false)
    })

    it('should write global rule files with trigger/globs frontmatter', async () => {
      const ctx = {
        collectedInputContext: {
          workspace: {projects: [], directory: createMockRelativePath('.', tempDir)},
          skills: [],
          fastCommands: [],
          rules: [
            createMockRulePrompt('test', 'glob', ['src/**/*.ts', '**/*.tsx'], 'global')
          ]
        },
        logger: createLogger('test', 'debug'),
        dryRun: false
      } as unknown as OutputWriteContext

      const results = await plugin.writeGlobalOutputs(ctx)
      expect(results.files).toHaveLength(1)

      const rulePath = path.join(tempDir, '.codeium', 'windsurf', 'memories', 'rule-test-glob.md')
      expect(fs.existsSync(rulePath)).toBe(true)

      const content = fs.readFileSync(rulePath, 'utf8')
      expect(content).toContain('trigger: glob')
      expect(content).toContain('globs: src/**/*.ts, **/*.tsx')
      expect(content).not.toContain('globs: "src/**/*.ts, **/*.tsx"')
      expect(content).toContain('Follow this rule.')
    })
  })

  describe('writeProjectOutputs', () => {
    it('should return empty results when no project rules', async () => {
      const ctx = {
        collectedInputContext: {
          workspace: {projects: [], directory: createMockRelativePath('.', tempDir)},
          globalMemory: createMockGlobalMemoryPrompt('Global rules', tempDir)
        },
        logger: createLogger('test', 'debug'),
        dryRun: false
      } as unknown as OutputWriteContext

      const results = await plugin.writeProjectOutputs(ctx)
      expect(results.files).toHaveLength(0)
      expect(results.dirs).toHaveLength(0)
    })

    it('should write .codeiumignore to project directories', async () => {
      const projectDir = path.join(tempDir, 'my-project')
      fs.mkdirSync(projectDir, {recursive: true})

      const ctx = {
        collectedInputContext: {
          workspace: {
            projects: [
              {
                name: 'my-project',
                dirFromWorkspacePath: createMockRelativePath('my-project', tempDir)
              }
            ],
            directory: createMockRelativePath('.', tempDir)
          },
          rules: [],
          aiAgentIgnoreConfigFiles: [{fileName: '.codeiumignore', content: 'node_modules/\n.env\ndist/'}]
        },
        logger: createLogger('test', 'debug'),
        dryRun: false
      } as unknown as OutputWriteContext

      const results = await plugin.writeProjectOutputs(ctx)

      const ignorePath = path.join(tempDir, 'my-project', '.codeiumignore')
      expect(fs.existsSync(ignorePath)).toBe(true)
      const content = fs.readFileSync(ignorePath, 'utf8')
      expect(content).toContain('node_modules/')
      expect(results.files.some(f => f.success)).toBe(true)
    })

    it('should not write .codeignore (wrong name) to project directories', async () => {
      const projectDir = path.join(tempDir, 'my-project')
      fs.mkdirSync(projectDir, {recursive: true})

      const ctx = {
        collectedInputContext: {
          workspace: {
            projects: [
              {
                name: 'my-project',
                dirFromWorkspacePath: createMockRelativePath('my-project', tempDir)
              }
            ],
            directory: createMockRelativePath('.', tempDir)
          },
          rules: [],
          aiAgentIgnoreConfigFiles: [{fileName: '.codeignore', content: 'node_modules/'}]
        },
        logger: createLogger('test', 'debug'),
        dryRun: false
      } as unknown as OutputWriteContext

      await plugin.writeProjectOutputs(ctx)

      const wrongIgnorePath = path.join(tempDir, 'my-project', '.codeignore')
      const correctIgnorePath = path.join(tempDir, 'my-project', '.codeiumignore')
      expect(fs.existsSync(wrongIgnorePath)).toBe(false)
      expect(fs.existsSync(correctIgnorePath)).toBe(false)
    })

    it('should write project rules and apply seriName include filter from projectConfig', async () => {
      const ctx = {
        collectedInputContext: {
          workspace: {
            projects: [
              {
                name: 'proj1',
                dirFromWorkspacePath: createMockRelativePath('proj1', tempDir),
                projectConfig: {rules: {include: ['uniapp']}}
              }
            ],
            directory: createMockRelativePath('.', tempDir)
          },
          rules: [
            createMockRulePrompt('test', 'uniapp-only', ['src/**/*.vue'], 'project', 'uniapp'),
            createMockRulePrompt('test', 'vue-only', ['src/**/*.ts'], 'project', 'vue')
          ]
        },
        logger: createLogger('test', 'debug'),
        dryRun: false
      } as unknown as OutputWriteContext

      const results = await plugin.writeProjectOutputs(ctx)
      const outputPaths = results.files.map(file => file.path.path.replaceAll('\\', '/'))

      expect(outputPaths.some(p => p.endsWith('rule-test-uniapp-only.md'))).toBe(true)
      expect(outputPaths.some(p => p.endsWith('rule-test-vue-only.md'))).toBe(false)

      const includedRulePath = path.join(tempDir, 'proj1', '.windsurf', 'rules', 'rule-test-uniapp-only.md')
      const excludedRulePath = path.join(tempDir, 'proj1', '.windsurf', 'rules', 'rule-test-vue-only.md')

      expect(fs.existsSync(includedRulePath)).toBe(true)
      expect(fs.existsSync(excludedRulePath)).toBe(false)

      const includedRuleContent = fs.readFileSync(includedRulePath, 'utf8')
      expect(includedRuleContent).toContain('trigger: glob')
      expect(includedRuleContent).toContain('globs: src/**/*.vue')
    })
  })

  describe('clean support', () => {
    it('should register global output dirs for cleanup', async () => {
      const ctx = {
        collectedInputContext: {
          workspace: {projects: [], directory: createMockRelativePath('.', tempDir)},
          skills: [createMockSkillPrompt('my-skill', '# Skill', tempDir)],
          fastCommands: [createMockFastCommandPrompt('test', void 0, tempDir)]
        }
      } as unknown as OutputPluginContext

      const dirs = await plugin.registerGlobalOutputDirs(ctx)
      expect(dirs.length).toBe(2)

      const files = await plugin.registerGlobalOutputFiles(ctx)
      expect(files.length).toBeGreaterThanOrEqual(2)
    })
  })
})
