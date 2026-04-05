import type {CommandPrompt, InputCapabilityContext, OutputCleanContext, OutputWriteContext, SkillPrompt, SubAgentPrompt} from './plugin-core'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import glob from 'fast-glob'
import {describe, expect, it} from 'vitest'
import {collectDeletionTargets} from '../commands/CleanupUtils'
import {mergeConfig} from '../config'
import {CommandInputCapability} from '../inputs/input-command'
import {CodexCLIOutputPlugin} from './CodexCLIOutputPlugin'
import {createLogger, FilePathKind, PromptKind} from './plugin-core'

class TestCodexCLIOutputPlugin extends CodexCLIOutputPlugin {
  constructor(private readonly testHomeDir: string) {
    super()
  }

  protected override getHomeDir(): string {
    return this.testHomeDir
  }
}

async function withTempCodexDirs(
  prefix: string,
  run: (paths: {readonly workspace: string, readonly homeDir: string}) => Promise<void>
): Promise<void> {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-workspace-`))
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-home-`))

  try {
    await run({workspace, homeDir})
  }
  finally {
    fs.rmSync(workspace, {recursive: true, force: true})
    fs.rmSync(homeDir, {recursive: true, force: true})
  }
}

function createInputContext(tempWorkspace: string): InputCapabilityContext {
  return {
    logger: createLogger('CodexCLIOutputPluginTest', 'error'),
    fs,
    path,
    glob,
    userConfigOptions: mergeConfig({workspaceDir: tempWorkspace}),
    dependencyContext: {}
  } as InputCapabilityContext
}

function createCleanContext(tempWorkspace?: string): OutputCleanContext {
  const workspaceDirectory = tempWorkspace == null
    ? {
        pathKind: FilePathKind.Relative,
        path: '.',
        basePath: '.',
        getDirectoryName: () => '.',
        getAbsolutePath: () => path.resolve('.')
      }
    : {
        pathKind: FilePathKind.Absolute,
        path: tempWorkspace,
        getDirectoryName: () => path.basename(tempWorkspace)
      }

  const projects = tempWorkspace == null
    ? []
    : [{
        name: 'project-a',
        dirFromWorkspacePath: {
          pathKind: FilePathKind.Relative,
          path: 'project-a',
          basePath: tempWorkspace,
          getDirectoryName: () => 'project-a',
          getAbsolutePath: () => path.join(tempWorkspace, 'project-a')
        }
      }, {
        name: 'project-b',
        dirFromWorkspacePath: {
          pathKind: FilePathKind.Relative,
          path: 'project-b',
          basePath: tempWorkspace,
          getDirectoryName: () => 'project-b',
          getAbsolutePath: () => path.join(tempWorkspace, 'project-b')
        }
      }]

  return {
    logger: {
      trace: () => {},
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
      fatal: () => {}
    },
    fs,
    path,
    glob,
    dryRun: true,
    runtimeTargets: {
      jetbrainsCodexDirs: []
    },
    collectedOutputContext: {
      workspace: {
        directory: workspaceDirectory,
        projects
      }
    }
  } as unknown as OutputCleanContext
}

function createWriteContext(
  tempWorkspace: string,
  commands: readonly CommandPrompt[],
  subAgents: readonly SubAgentPrompt[] = [],
  pluginOptions?: OutputWriteContext['pluginOptions'],
  skills: readonly SkillPrompt[] = []
): OutputWriteContext {
  return {
    logger: createLogger('CodexCLIOutputPluginTest', 'error'),
    fs,
    path,
    glob,
    dryRun: true,
    ...pluginOptions != null && {pluginOptions},
    collectedOutputContext: {
      workspace: {
        directory: {
          pathKind: FilePathKind.Absolute,
          path: tempWorkspace,
          getDirectoryName: () => path.basename(tempWorkspace)
        },
        projects: [{
          name: 'project-a',
          dirFromWorkspacePath: {
            pathKind: FilePathKind.Relative,
            path: 'project-a',
            basePath: tempWorkspace,
            getDirectoryName: () => 'project-a',
            getAbsolutePath: () => path.join(tempWorkspace, 'project-a')
          },
          isPromptSourceProject: true
        }, {
          name: 'project-b',
          dirFromWorkspacePath: {
            pathKind: FilePathKind.Relative,
            path: 'project-b',
            basePath: tempWorkspace,
            getDirectoryName: () => 'project-b',
            getAbsolutePath: () => path.join(tempWorkspace, 'project-b')
          }
        }]
      },
      commands,
      subAgents,
      skills
    }
  } as unknown as OutputWriteContext
}

function createProjectCommandPrompt(): CommandPrompt {
  return {
    type: PromptKind.Command,
    content: 'project command body',
    length: 22,
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
      description: 'Project command',
      scope: 'project'
    },
    markdownContents: []
  } as unknown as CommandPrompt
}

function createCommandPromptWithToolFields(): CommandPrompt {
  return {
    ...createProjectCommandPrompt(),
    yamlFrontMatter: {
      description: 'Tool-aware command',
      scope: 'project',
      allowTools: ['shell'],
      allowedTools: ['shell']
    } as unknown as CommandPrompt['yamlFrontMatter']
  } as unknown as CommandPrompt
}

function createSubAgentPrompt(scope: 'project' | 'global'): SubAgentPrompt {
  return {
    type: PromptKind.SubAgent,
    content: 'Review changes carefully.\nFocus on concrete regressions.',
    length: 55,
    filePathKind: FilePathKind.Relative,
    dir: {
      pathKind: FilePathKind.Relative,
      path: 'subagents/qa/reviewer.mdx',
      basePath: path.resolve('tmp/dist/subagents'),
      getDirectoryName: () => 'qa',
      getAbsolutePath: () => path.resolve('tmp/dist/subagents/qa/reviewer.mdx')
    },
    agentPrefix: 'qa',
    agentName: 'reviewer',
    canonicalName: 'qa-reviewer',
    yamlFrontMatter: {
      description: 'Review pull requests',
      scope,
      model: 'gpt-5.2',
      allowTools: ['shell'],
      color: 'blue',
      nickname_candidates: ['guard'],
      sandbox_mode: 'workspace-write',
      mcp_servers: {
        docs: {
          command: 'node',
          args: ['mcp.js']
        }
      }
    } as unknown as SubAgentPrompt['yamlFrontMatter'],
    markdownContents: []
  } as SubAgentPrompt
}

function createSkillPrompt(
  scope: 'project' | 'global',
  name: string
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
  } as unknown as SkillPrompt
}

describe('codexCLIOutputPlugin command output', () => {
  it('renders codex commands from dist content instead of the zh source prompt', async () => {
    await withTempCodexDirs('tnmsc-codex-command', async ({workspace, homeDir}) => {
      const srcDir = path.join(workspace, 'aindex', 'commands', 'find')
      const distDir = path.join(workspace, 'aindex', 'dist', 'commands', 'find')

      fs.mkdirSync(srcDir, {recursive: true})
      fs.mkdirSync(distDir, {recursive: true})

      fs.writeFileSync(path.join(srcDir, 'opensource.src.mdx'), [
        'export default {',
        '  description: \'中文源描述\',',
        '}',
        '',
        '中文源命令内容',
        ''
      ].join('\n'), 'utf8')
      fs.writeFileSync(path.join(distDir, 'opensource.mdx'), [
        'export default {',
        '  description: \'English dist description\',',
        '}',
        '',
        'English dist command body',
        ''
      ].join('\n'), 'utf8')

      const commandInputCapability = new CommandInputCapability()
      const collected = await commandInputCapability.collect(createInputContext(workspace))
      const commands = collected.commands ?? []

      expect(commands).toHaveLength(1)

      const codexPlugin = new TestCodexCLIOutputPlugin(homeDir)
      const writeCtx = createWriteContext(workspace, commands)
      const declarations = await codexPlugin.declareOutputFiles(writeCtx)
      const commandDeclaration = declarations.find(
        declaration => declaration.path.replaceAll('\\', '/').endsWith('/.codex/prompts/find-opensource.md')
      )

      expect(commandDeclaration).toBeDefined()
      if (commandDeclaration == null) throw new Error('Expected codex command declaration')

      const rendered = await codexPlugin.convertContent(commandDeclaration, writeCtx)
      expect(String(rendered)).toContain('English dist description')
      expect(String(rendered)).toContain('English dist command body')
      expect(String(rendered)).not.toContain('中文源描述')
      expect(String(rendered)).not.toContain('中文源命令内容')
    })
  })

  it('keeps project-scoped commands in the global codex directory and never mirrors them into workspace root', async () => {
    await withTempCodexDirs('tnmsc-codex-project-command', async ({workspace, homeDir}) => {
      const plugin = new TestCodexCLIOutputPlugin(homeDir)
      const writeCtx = createWriteContext(workspace, [createProjectCommandPrompt()])

      const declarations = await plugin.declareOutputFiles(writeCtx)

      expect(declarations.map(declaration => declaration.path)).toContain(
        path.join(homeDir, '.codex', 'prompts', 'dev-build.md')
      )
      expect(declarations.map(declaration => declaration.path)).not.toContain(
        path.join(workspace, '.codex', 'prompts', 'dev-build.md')
      )
      expect(declarations.every(declaration => declaration.scope === 'global')).toBe(true)
    })
  })

  it('drops tool allowlist fields from codex command front matter', async () => {
    await withTempCodexDirs('tnmsc-codex-command-tools', async ({workspace, homeDir}) => {
      const plugin = new TestCodexCLIOutputPlugin(homeDir)
      const writeCtx = createWriteContext(workspace, [createCommandPromptWithToolFields()])
      const declarations = await plugin.declareOutputFiles(writeCtx)
      const declaration = declarations.find(item => item.path === path.join(homeDir, '.codex', 'prompts', 'dev-build.md'))

      expect(declaration).toBeDefined()
      if (declaration == null) throw new Error('Expected codex command declaration')

      const rendered = await plugin.convertContent(declaration, writeCtx)
      expect(String(rendered)).toContain('description: Tool-aware command')
      expect(String(rendered)).not.toContain('allowTools')
      expect(String(rendered)).not.toContain('allowedTools')
    })
  })

  it('writes project-scoped subagents into each project .codex/agents directory as toml', async () => {
    await withTempCodexDirs('tnmsc-codex-project-subagent', async ({workspace, homeDir}) => {
      const plugin = new TestCodexCLIOutputPlugin(homeDir)
      const writeCtx = createWriteContext(workspace, [], [createSubAgentPrompt('project')])

      const declarations = await plugin.declareOutputFiles(writeCtx)
      const paths = declarations.map(declaration => declaration.path)

      expect(paths).toContain(path.join(workspace, 'project-a', '.codex', 'agents', 'qa-reviewer.toml'))
      expect(paths).toContain(path.join(workspace, 'project-b', '.codex', 'agents', 'qa-reviewer.toml'))
      expect(paths).not.toContain(path.join(homeDir, '.codex', 'agents', 'qa-reviewer.toml'))

      const declaration = declarations.find(item => item.path === path.join(workspace, 'project-a', '.codex', 'agents', 'qa-reviewer.toml'))
      expect(declaration).toBeDefined()
      if (declaration == null) throw new Error('Expected codex subagent declaration')

      const rendered = await plugin.convertContent(declaration, writeCtx)
      expect(String(rendered)).toContain('name = "qa-reviewer"')
      expect(String(rendered)).toContain('description = "Review pull requests"')
      expect(String(rendered)).toContain([
        'developer_instructions = """',
        'Review changes carefully.',
        'Focus on concrete regressions."""'
      ].join('\n'))
      expect(String(rendered)).toContain('nickname_candidates = ["guard"]')
      expect(String(rendered)).toContain('sandbox_mode = "workspace-write"')
      expect(String(rendered)).toContain('[mcp_servers]')
      expect(String(rendered)).toContain('[mcp_servers.docs]')
      expect(String(rendered)).not.toContain('model = ')
      expect(String(rendered)).not.toContain('scope = ')
      expect(String(rendered)).not.toContain('allowTools')
      expect(String(rendered)).not.toContain('allowedTools')
      expect(String(rendered)).not.toContain('color = ')
    })
  })

  it('remaps global-scoped subagents to project outputs instead of writing to the global codex directory', async () => {
    await withTempCodexDirs('tnmsc-codex-global-subagent', async ({workspace, homeDir}) => {
      const plugin = new TestCodexCLIOutputPlugin(homeDir)
      const writeCtx = createWriteContext(workspace, [], [createSubAgentPrompt('global')])

      const declarations = await plugin.declareOutputFiles(writeCtx)

      expect(declarations.map(declaration => declaration.path)).toContain(
        path.join(workspace, 'project-a', '.codex', 'agents', 'qa-reviewer.toml')
      )
      expect(declarations.map(declaration => declaration.path)).not.toContain(
        path.join(homeDir, '.codex', 'agents', 'qa-reviewer.toml')
      )
      expect(declarations.every(declaration => declaration.scope === 'project')).toBe(true)
    })
  })

  it('writes project-scoped skills and mcp into each project .codex/skills directory', async () => {
    await withTempCodexDirs('tnmsc-codex-project-skills', async ({workspace, homeDir}) => {
      const plugin = new TestCodexCLIOutputPlugin(homeDir)
      const writeCtx = createWriteContext(
        workspace,
        [],
        [],
        void 0,
        [createSkillPrompt('project', 'ship-it')]
      )

      const declarations = await plugin.declareOutputFiles(writeCtx)
      const paths = declarations.map(declaration => declaration.path)

      expect(paths).toContain(
        path.join(workspace, 'project-a', '.codex', 'skills', 'ship-it', 'SKILL.md')
      )
      expect(paths).toContain(
        path.join(workspace, 'project-a', '.codex', 'skills', 'ship-it', 'mcp.json')
      )
      expect(paths).toContain(
        path.join(workspace, 'project-b', '.codex', 'skills', 'ship-it', 'SKILL.md')
      )
      expect(paths).toContain(
        path.join(workspace, 'project-b', '.codex', 'skills', 'ship-it', 'mcp.json')
      )
      expect(paths).not.toContain(
        path.join(homeDir, '.codex', 'skills', 'ship-it', 'SKILL.md')
      )
    })
  })

  it('cleans global codex skills while preserving the built-in .system directory', async () => {
    await withTempCodexDirs('tnmsc-codex-cleanup-skills', async ({homeDir}) => {
      const plugin = new TestCodexCLIOutputPlugin(homeDir)
      const skillsDir = path.join(homeDir, '.codex', 'skills')
      const preservedDir = path.join(skillsDir, '.system')
      const staleDir = path.join(skillsDir, 'legacy-skill')

      fs.mkdirSync(preservedDir, {recursive: true})
      fs.mkdirSync(staleDir, {recursive: true})
      fs.writeFileSync(path.join(preservedDir, 'SKILL.md'), '# preserved', 'utf8')
      fs.writeFileSync(path.join(staleDir, 'SKILL.md'), '# stale', 'utf8')

      const cleanupDeclarations = await plugin.declareCleanupPaths(createCleanContext())
      const protectPaths = cleanupDeclarations.protect?.map(target => target.path.replaceAll('\\', '/')) ?? []
      const skillCleanupTarget = cleanupDeclarations.delete?.find(target => target.kind === 'glob' && target.path.includes(`${path.sep}.codex${path.sep}skills${path.sep}`))
      const cleanupPlan = await collectDeletionTargets([plugin], createCleanContext())
      const normalizedDeleteDirs = cleanupPlan.dirsToDelete.map(target => target.replaceAll('\\', '/'))
      const normalizedPreservedDir = preservedDir.replaceAll('\\', '/')
      const normalizedStaleDir = staleDir.replaceAll('\\', '/')

      expect(skillCleanupTarget).toBeDefined()
      expect(skillCleanupTarget?.excludeBasenames).toEqual(['.system'])
      expect(protectPaths).toContain(normalizedPreservedDir)
      expect(normalizedDeleteDirs).toContain(normalizedStaleDir)
      expect(normalizedDeleteDirs).not.toContain(normalizedPreservedDir)
      expect(cleanupPlan.violations).toEqual([])
    })
  })

  it('keeps legacy .skills cleanup declarations for both project and global scopes', async () => {
    await withTempCodexDirs('tnmsc-codex-cleanup-legacy-skills', async ({workspace, homeDir}) => {
      const plugin = new TestCodexCLIOutputPlugin(homeDir)
      const cleanupDeclarations = await plugin.declareCleanupPaths(createCleanContext(workspace))
      const deletePaths = cleanupDeclarations.delete?.map(target => target.path.replaceAll('\\', '/')) ?? []

      expect(deletePaths).toContain(
        path.join(workspace, 'project-a', '.skills').replaceAll('\\', '/')
      )
      expect(deletePaths).toContain(
        path.join(workspace, 'project-b', '.skills').replaceAll('\\', '/')
      )
      expect(deletePaths).toContain(
        path.join(homeDir, '.skills').replaceAll('\\', '/')
      )
    })
  })

  it('keeps legacy .agents/skills cleanup declarations for both project and global scopes', async () => {
    await withTempCodexDirs('tnmsc-codex-cleanup-legacy-agentskills', async ({workspace, homeDir}) => {
      const plugin = new TestCodexCLIOutputPlugin(homeDir)
      const cleanupDeclarations = await plugin.declareCleanupPaths(createCleanContext(workspace))
      const deletePaths = cleanupDeclarations.delete?.map(target => target.path.replaceAll('\\', '/')) ?? []

      expect(deletePaths).toContain(
        path.join(workspace, 'project-a', '.agents', 'skills').replaceAll('\\', '/')
      )
      expect(deletePaths).toContain(
        path.join(workspace, 'project-b', '.agents', 'skills').replaceAll('\\', '/')
      )
      expect(deletePaths).toContain(
        path.join(homeDir, '.agents', 'skills').replaceAll('\\', '/')
      )
    })
  })
})
