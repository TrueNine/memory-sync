import type {CommandPrompt, GlobalMemoryPrompt, OutputCleanContext, OutputWriteContext, RulePrompt, SkillPrompt} from './plugin-core'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import glob from 'fast-glob'
import {describe, expect, it} from 'vitest'
import {collectDeletionTargets} from '@/commands/CleanupUtils'
import {CursorOutputPlugin} from './CursorOutputPlugin'
import {createLogger, FilePathKind, PromptKind} from './plugin-core'

class TestCursorOutputPlugin extends CursorOutputPlugin {
  constructor(private readonly testHomeDir: string) {
    super()
  }

  protected override getHomeDir(): string {
    return this.testHomeDir
  }
}

function createCleanContext(): OutputCleanContext {
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
        directory: {
          pathKind: FilePathKind.Relative,
          path: '.',
          basePath: '.',
          getDirectoryName: () => '.',
          getAbsolutePath: () => path.resolve('.')
        },
        projects: []
      }
    }
  } as OutputCleanContext
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
      description: 'Build',
      scope: 'project'
    },
    markdownContents: []
  } as CommandPrompt
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
      description: 'Ship release',
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

function createRulePrompt(): RulePrompt {
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
    scope: 'project',
    markdownContents: []
  } as RulePrompt
}

describe('cursorOutputPlugin cleanup', () => {
  it('declares cleanup exclusions for built-in skills and lets core cleanup skip them', async () => {
    const tempHomeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-cursor-cleanup-'))
    const skillsDir = path.join(tempHomeDir, '.cursor', 'skills-cursor')
    const preservedDir = path.join(skillsDir, 'create-rule')
    const staleDir = path.join(skillsDir, 'legacy-skill')

    fs.mkdirSync(preservedDir, {recursive: true})
    fs.mkdirSync(staleDir, {recursive: true})
    fs.writeFileSync(path.join(preservedDir, 'SKILL.md'), '# preserved', 'utf8')
    fs.writeFileSync(path.join(staleDir, 'SKILL.md'), '# stale', 'utf8')

    try {
      const plugin = new TestCursorOutputPlugin(tempHomeDir)
      const result = await plugin.declareCleanupPaths(createCleanContext())
      const protectPaths = result.protect?.map(target => target.path.replaceAll('\\', '/')) ?? []
      const normalizedCommandsDir = path.join(tempHomeDir, '.cursor', 'commands').replaceAll('\\', '/')
      const normalizedStaleDir = staleDir.replaceAll('\\', '/')
      const normalizedPreservedDir = preservedDir.replaceAll('\\', '/')
      const skillCleanupTarget = result.delete?.find(
        target => target.kind === 'glob' && target.path.replaceAll('\\', '/').includes(`/.cursor/skills-cursor/`)
      )
      const cleanupPlan = await collectDeletionTargets([plugin], createCleanContext())
      const normalizedDeleteDirs = cleanupPlan.dirsToDelete.map(target => target.replaceAll('\\', '/'))
      const normalizedViolationTargets = cleanupPlan.violations.map(violation => violation.targetPath.replaceAll('\\', '/'))

      expect(result.delete?.map(target => target.path.replaceAll('\\', '/')) ?? []).toContain(normalizedCommandsDir)
      expect(skillCleanupTarget?.excludeBasenames).toEqual(expect.arrayContaining(['create-rule']))
      expect(normalizedDeleteDirs).toContain(normalizedStaleDir)
      expect(normalizedDeleteDirs).not.toContain(normalizedPreservedDir)
      expect(protectPaths).toContain(normalizedPreservedDir)
      expect(normalizedViolationTargets).not.toContain(path.join(preservedDir, 'SKILL.md').replaceAll('\\', '/'))
      expect(cleanupPlan.violations).toEqual([])
    }
    finally {
      fs.rmSync(tempHomeDir, {recursive: true, force: true})
    }
  })

  it('writes project-scoped commands, skills, mcp, and rules into workspace root through the synthetic workspace project', async () => {
    const workspaceBase = path.resolve('tmp/cursor-workspace')
    const plugin = new TestCursorOutputPlugin(path.join(workspaceBase, 'home'))
    const ctx = {
      logger: createLogger('CursorOutputPlugin', 'error'),
      fs,
      path,
      glob,
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
        commands: [createCommandPrompt()],
        skills: [createSkillPrompt()],
        rules: [createRulePrompt()]
      }
    } as OutputWriteContext

    const declarations = await plugin.declareOutputFiles(ctx)
    const paths = declarations.map(declaration => declaration.path)

    expect(paths).toContain(path.join(workspaceBase, '.cursor', 'commands', 'dev-build.md'))
    expect(paths).toContain(path.join(workspaceBase, '.cursor', 'skills', 'ship-it', 'SKILL.md'))
    expect(paths).toContain(path.join(workspaceBase, '.cursor', 'mcp.json'))
    expect(paths).toContain(path.join(workspaceBase, '.cursor', 'rules', 'rule-ops-guard.md'))
    expect(declarations.every(declaration => declaration.scope === 'project')).toBe(true)
  })

  it('keeps skill files global when only mcp is project-scoped', async () => {
    const workspaceBase = path.resolve('tmp/cursor-split-scope-project-mcp')
    const homeDir = path.join(workspaceBase, 'home')
    const plugin = new TestCursorOutputPlugin(homeDir)
    const ctx = {
      logger: createLogger('CursorOutputPlugin', 'error'),
      fs,
      path,
      glob,
      dryRun: true,
      pluginOptions: {
        outputScopes: {
          plugins: {
            CursorOutputPlugin: {
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

    expect(paths).toContain(path.join(homeDir, '.cursor', 'skills-cursor', 'ship-it', 'SKILL.md'))
    expect(paths).toContain(path.join(workspaceBase, '.cursor', 'skills', 'inspect-locally', 'mcp.json'))
    expect(paths).toContain(path.join(workspaceBase, '.cursor', 'mcp.json'))
    expect(paths).not.toContain(path.join(workspaceBase, '.cursor', 'skills', 'ship-it', 'SKILL.md'))
    expect(paths).not.toContain(path.join(homeDir, '.cursor', 'skills-cursor', 'inspect-locally', 'SKILL.md'))
    expect(paths).not.toContain(path.join(homeDir, '.cursor', 'mcp.json'))
  })

  it('keeps skill files project-scoped when only mcp is global-scoped', async () => {
    const workspaceBase = path.resolve('tmp/cursor-split-scope-global-mcp')
    const homeDir = path.join(workspaceBase, 'home')
    const plugin = new TestCursorOutputPlugin(homeDir)
    const ctx = {
      logger: createLogger('CursorOutputPlugin', 'error'),
      fs,
      path,
      glob,
      dryRun: true,
      pluginOptions: {
        outputScopes: {
          plugins: {
            CursorOutputPlugin: {
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

    expect(paths).toContain(path.join(workspaceBase, '.cursor', 'skills', 'ship-it', 'SKILL.md'))
    expect(paths).toContain(path.join(homeDir, '.cursor', 'skills-cursor', 'inspect-globally', 'mcp.json'))
    expect(paths).toContain(path.join(homeDir, '.cursor', 'mcp.json'))
    expect(paths).not.toContain(path.join(homeDir, '.cursor', 'skills-cursor', 'ship-it', 'SKILL.md'))
    expect(paths).not.toContain(path.join(workspaceBase, '.cursor', 'skills', 'inspect-globally', 'SKILL.md'))
    expect(paths).not.toContain(path.join(workspaceBase, '.cursor', 'mcp.json'))
  })

  it('writes the global prompt to workspace root through the synthetic workspace project', async () => {
    const workspaceBase = path.resolve('tmp/cursor-workspace-global-prompt')
    const plugin = new TestCursorOutputPlugin(path.join(workspaceBase, 'home'))
    const ctx = {
      logger: createLogger('CursorOutputPlugin', 'error'),
      fs,
      path,
      glob,
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
      path.join(workspaceBase, '.cursor', 'rules', 'global.mdc')
    )
  })
})
