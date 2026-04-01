import type {CommandPrompt, GlobalMemoryPrompt, OutputWriteContext, ProjectChildrenMemoryPrompt, ProjectRootMemoryPrompt, RulePrompt, SkillPrompt} from './plugin-core'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {describe, expect, it} from 'vitest'
import {createLogger, FilePathKind, PromptKind} from './plugin-core'
import {QoderIDEPluginOutputPlugin} from './QoderIDEPluginOutputPlugin'

class TestQoderIDEPluginOutputPlugin extends QoderIDEPluginOutputPlugin {
  constructor(private readonly testHomeDir: string) {
    super()
  }

  protected override getHomeDir(): string {
    return this.testHomeDir
  }
}

function createWorkspaceRootPrompt(): ProjectRootMemoryPrompt {
  return {
    type: PromptKind.ProjectRootMemory,
    content: 'workspace root prompt',
    length: 21,
    filePathKind: FilePathKind.Relative,
    dir: {
      pathKind: FilePathKind.Root,
      path: '',
      getDirectoryName: () => ''
    },
    markdownContents: []
  } as ProjectRootMemoryPrompt
}

function createProjectRootPrompt(content: string): ProjectRootMemoryPrompt {
  return {
    type: PromptKind.ProjectRootMemory,
    content,
    length: content.length,
    filePathKind: FilePathKind.Relative,
    dir: {
      pathKind: FilePathKind.Root,
      path: '',
      getDirectoryName: () => ''
    },
    markdownContents: []
  } as ProjectRootMemoryPrompt
}

function createChildPrompt(relativePath: string, content: string): ProjectChildrenMemoryPrompt {
  return {
    type: PromptKind.ProjectChildrenMemory,
    content,
    length: content.length,
    filePathKind: FilePathKind.Relative,
    markdownContents: [],
    dir: {
      pathKind: FilePathKind.Relative,
      path: relativePath,
      basePath: path.resolve('tmp/qoder-dist/app'),
      getDirectoryName: () => path.basename(relativePath),
      getAbsolutePath: () => path.resolve('tmp/qoder-dist/app', relativePath)
    },
    workingChildDirectoryPath: {
      pathKind: FilePathKind.Relative,
      path: relativePath,
      basePath: path.resolve('tmp/qoder-workspace/project'),
      getDirectoryName: () => path.basename(relativePath),
      getAbsolutePath: () => path.resolve('tmp/qoder-workspace/project', relativePath)
    }
  } as ProjectChildrenMemoryPrompt
}

function createGlobalMemoryPrompt(): GlobalMemoryPrompt {
  return {
    type: PromptKind.GlobalMemory,
    content: 'global prompt',
    length: 13,
    filePathKind: FilePathKind.Relative,
    dir: {
      pathKind: FilePathKind.Relative,
      path: 'aindex/dist/global.mdx',
      basePath: path.resolve('.'),
      getDirectoryName: () => 'dist',
      getAbsolutePath: () => path.resolve('aindex/dist/global.mdx')
    },
    markdownContents: []
  } as GlobalMemoryPrompt
}

function createCommandPrompt(): CommandPrompt {
  return {
    type: PromptKind.Command,
    content: 'command body',
    length: 12,
    filePathKind: FilePathKind.Relative,
    dir: {
      pathKind: FilePathKind.Relative,
      path: 'commands/dev/build.mdx',
      basePath: path.resolve('tmp/dist/commands'),
      getDirectoryName: () => 'dev',
      getAbsolutePath: () => path.resolve('tmp/dist/commands/dev/build.mdx')
    },
    commandPrefix: 'dev',
    commandName: 'build',
    yamlFrontMatter: {
      description: 'Build command',
      scope: 'project'
    },
    markdownContents: []
  } as CommandPrompt
}

function createSkillPrompt(
  scope: 'project' | 'global' = 'project',
  name: string = 'ship-it'
): SkillPrompt {
  return {
    type: PromptKind.Skill,
    content: 'skill body',
    length: 10,
    filePathKind: FilePathKind.Relative,
    skillName: name,
    dir: {
      pathKind: FilePathKind.Relative,
      path: `skills/${name}`,
      basePath: path.resolve('tmp/dist/skills'),
      getDirectoryName: () => name,
      getAbsolutePath: () => path.resolve('tmp/dist/skills', name)
    },
    yamlFrontMatter: {
      description: 'Skill description',
      scope
    },
    mcpConfig: {
      type: PromptKind.SkillMcpConfig,
      mcpServers: {
        inspector: {
          command: 'npx',
          args: ['inspector']
        }
      },
      rawContent: '{"mcpServers":{"inspector":{"command":"npx","args":["inspector"]}}}'
    },
    markdownContents: []
  } as SkillPrompt
}

function createRulePrompt(scope: 'project' | 'global' = 'project'): RulePrompt {
  return {
    type: PromptKind.Rule,
    content: 'rule body',
    length: 9,
    filePathKind: FilePathKind.Relative,
    dir: {
      pathKind: FilePathKind.Relative,
      path: 'rules/ops/guard.mdx',
      basePath: path.resolve('tmp/dist/rules'),
      getDirectoryName: () => 'ops',
      getAbsolutePath: () => path.resolve('tmp/dist/rules/ops/guard.mdx')
    },
    prefix: 'ops',
    ruleName: 'guard',
    globs: ['src/**'],
    scope,
    markdownContents: []
  } as RulePrompt
}

describe('qoderIDEPluginOutputPlugin synthetic workspace project output', () => {
  it('writes workspace-root prompt, rules, commands, and skills through the synthetic workspace project', async () => {
    const workspaceBase = path.resolve('tmp/qoder-workspace')
    const plugin = new QoderIDEPluginOutputPlugin()
    const ctx = {
      logger: createLogger('QoderIDEPluginOutputPlugin', 'error'),
      fs,
      path,
      glob: {} as never,
      dryRun: true,
      collectedOutputContext: {
        workspace: {
          directory: {
            pathKind: FilePathKind.Absolute,
            path: workspaceBase,
            getDirectoryName: () => path.basename(workspaceBase)
          },
          projects: [{
            name: '__workspace__',
            isWorkspaceRootProject: true,
            rootMemoryPrompt: createWorkspaceRootPrompt()
          }]
        },
        commands: [createCommandPrompt()],
        skills: [createSkillPrompt()],
        rules: [createRulePrompt('project')]
      }
    } as OutputWriteContext

    const declarations = await plugin.declareOutputFiles(ctx)
    const paths = declarations.map(declaration => declaration.path)

    expect(paths).toContain(path.join(workspaceBase, '.qoder', 'rules', 'always.md'))
    expect(paths).toContain(path.join(workspaceBase, '.qoder', 'rules', 'rule-ops-guard.md'))
    expect(paths).toContain(path.join(workspaceBase, '.qoder', 'commands', 'dev-build.md'))
    expect(paths).toContain(path.join(workspaceBase, '.qoder', 'skills', 'ship-it', 'SKILL.md'))
    expect(declarations.every(declaration => declaration.scope === 'project')).toBe(true)
  })

  it('skips prompt-derived rules for the prompt-source project but still keeps real project rules', async () => {
    const workspaceBase = path.resolve('tmp/qoder-prompt-source')
    const plugin = new QoderIDEPluginOutputPlugin()
    const ctx = {
      logger: createLogger('QoderIDEPluginOutputPlugin', 'error'),
      fs,
      path,
      glob: {} as never,
      dryRun: true,
      collectedOutputContext: {
        workspace: {
          directory: {
            pathKind: FilePathKind.Absolute,
            path: workspaceBase,
            getDirectoryName: () => path.basename(workspaceBase)
          },
          projects: [
            {
              name: 'aindex',
              isPromptSourceProject: true,
              dirFromWorkspacePath: {
                pathKind: FilePathKind.Relative,
                path: 'aindex',
                basePath: workspaceBase,
                getDirectoryName: () => 'aindex',
                getAbsolutePath: () => path.join(workspaceBase, 'aindex')
              },
              rootMemoryPrompt: createProjectRootPrompt('prompt-source root'),
              childMemoryPrompts: [createChildPrompt('commands', 'prompt-source child')]
            },
            {
              name: 'project-a',
              dirFromWorkspacePath: {
                pathKind: FilePathKind.Relative,
                path: 'project-a',
                basePath: workspaceBase,
                getDirectoryName: () => 'project-a',
                getAbsolutePath: () => path.join(workspaceBase, 'project-a')
              },
              rootMemoryPrompt: createProjectRootPrompt('project root'),
              childMemoryPrompts: [createChildPrompt('commands', 'project child')]
            }
          ]
        },
        globalMemory: createGlobalMemoryPrompt(),
        rules: [createRulePrompt('project')]
      }
    } as OutputWriteContext

    const declarations = await plugin.declareOutputFiles(ctx)
    const paths = declarations.map(declaration => declaration.path)

    expect(paths).not.toContain(path.join(workspaceBase, 'aindex', '.qoder', 'rules', 'global.md'))
    expect(paths).not.toContain(path.join(workspaceBase, 'aindex', '.qoder', 'rules', 'always.md'))
    expect(paths).not.toContain(path.join(workspaceBase, 'aindex', '.qoder', 'rules', 'glob-commands.md'))
    expect(paths).toContain(path.join(workspaceBase, 'aindex', '.qoder', 'rules', 'rule-ops-guard.md'))
    expect(paths).toContain(path.join(workspaceBase, 'project-a', '.qoder', 'rules', 'global.md'))
    expect(paths).toContain(path.join(workspaceBase, 'project-a', '.qoder', 'rules', 'always.md'))
    expect(paths).toContain(path.join(workspaceBase, 'project-a', '.qoder', 'rules', 'glob-commands.md'))
    expect(paths).toContain(path.join(workspaceBase, 'project-a', '.qoder', 'rules', 'rule-ops-guard.md'))
  })

  it('keeps skill files global when only mcp is project-scoped', async () => {
    const workspaceBase = path.resolve('tmp/qoder-split-scope-project-mcp')
    const homeDir = path.join(workspaceBase, 'home')
    const plugin = new TestQoderIDEPluginOutputPlugin(homeDir)
    const ctx = {
      logger: createLogger('QoderIDEPluginOutputPlugin', 'error'),
      fs,
      path,
      glob: {} as never,
      dryRun: true,
      pluginOptions: {
        outputScopes: {
          plugins: {
            QoderIDEPluginOutputPlugin: {
              skills: 'global',
              mcp: 'project'
            }
          }
        }
      },
      collectedOutputContext: {
        workspace: {
          directory: {
            pathKind: FilePathKind.Absolute,
            path: workspaceBase,
            getDirectoryName: () => path.basename(workspaceBase)
          },
          projects: [{
            name: '__workspace__',
            isWorkspaceRootProject: true
          }]
        },
        skills: [
          createSkillPrompt('project', 'inspect-locally'),
          createSkillPrompt('global', 'ship-it')
        ]
      }
    } as OutputWriteContext

    const declarations = await plugin.declareOutputFiles(ctx)
    const paths = declarations.map(declaration => declaration.path)

    expect(paths).toContain(path.join(homeDir, '.qoder', 'skills', 'ship-it', 'SKILL.md'))
    expect(paths).toContain(path.join(workspaceBase, '.qoder', 'skills', 'inspect-locally', 'mcp.json'))
    expect(paths).not.toContain(path.join(workspaceBase, '.qoder', 'skills', 'ship-it', 'SKILL.md'))
    expect(paths).not.toContain(path.join(homeDir, '.qoder', 'skills', 'inspect-locally', 'SKILL.md'))
  })

  it('keeps skill files project-scoped when only mcp is global-scoped', async () => {
    const workspaceBase = path.resolve('tmp/qoder-split-scope-global-mcp')
    const homeDir = path.join(workspaceBase, 'home')
    const plugin = new TestQoderIDEPluginOutputPlugin(homeDir)
    const ctx = {
      logger: createLogger('QoderIDEPluginOutputPlugin', 'error'),
      fs,
      path,
      glob: {} as never,
      dryRun: true,
      pluginOptions: {
        outputScopes: {
          plugins: {
            QoderIDEPluginOutputPlugin: {
              skills: 'project',
              mcp: 'global'
            }
          }
        }
      },
      collectedOutputContext: {
        workspace: {
          directory: {
            pathKind: FilePathKind.Absolute,
            path: workspaceBase,
            getDirectoryName: () => path.basename(workspaceBase)
          },
          projects: [{
            name: '__workspace__',
            isWorkspaceRootProject: true
          }]
        },
        skills: [
          createSkillPrompt('project', 'ship-it'),
          createSkillPrompt('global', 'inspect-globally')
        ]
      }
    } as OutputWriteContext

    const declarations = await plugin.declareOutputFiles(ctx)
    const paths = declarations.map(declaration => declaration.path)

    expect(paths).toContain(path.join(workspaceBase, '.qoder', 'skills', 'ship-it', 'SKILL.md'))
    expect(paths).toContain(path.join(homeDir, '.qoder', 'skills', 'inspect-globally', 'mcp.json'))
    expect(paths).not.toContain(path.join(homeDir, '.qoder', 'skills', 'ship-it', 'SKILL.md'))
    expect(paths).not.toContain(path.join(workspaceBase, '.qoder', 'skills', 'inspect-globally', 'SKILL.md'))
  })

  it('writes the global prompt to workspace root through the synthetic workspace project', async () => {
    const workspaceBase = path.resolve('tmp/qoder-workspace-global-prompt')
    const plugin = new QoderIDEPluginOutputPlugin()
    const ctx = {
      logger: createLogger('QoderIDEPluginOutputPlugin', 'error'),
      fs,
      path,
      glob: {} as never,
      dryRun: true,
      collectedOutputContext: {
        workspace: {
          directory: {
            pathKind: FilePathKind.Absolute,
            path: workspaceBase,
            getDirectoryName: () => path.basename(workspaceBase)
          },
          projects: [{
            name: '__workspace__',
            isWorkspaceRootProject: true
          }]
        },
        globalMemory: createGlobalMemoryPrompt()
      }
    } as OutputWriteContext

    const declarations = await plugin.declareOutputFiles(ctx)

    expect(declarations.map(declaration => declaration.path)).toContain(
      path.join(workspaceBase, '.qoder', 'rules', 'global.md')
    )
  })
})
