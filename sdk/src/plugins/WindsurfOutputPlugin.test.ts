import type {CommandPrompt, OutputScopeSelection, OutputWriteContext, Project, RulePrompt, SkillPrompt} from './plugin-core'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {describe, expect, it} from 'vitest'
import {createLogger, FilePathKind, PromptKind} from './plugin-core'
import {WindsurfOutputPlugin} from './WindsurfOutputPlugin'

function createCommandPrompt(scope: 'project' | 'global', seriName: string): CommandPrompt {
  return {
    type: PromptKind.Command,
    content: 'command content',
    length: 15,
    filePathKind: FilePathKind.Relative,
    dir: {
      pathKind: FilePathKind.Relative,
      path: 'dev/build.mdx',
      basePath: path.resolve('tmp/dist/commands'),
      getDirectoryName: () => 'dev',
      getAbsolutePath: () => path.resolve('tmp/dist/commands/dev/build.mdx')
    },
    commandPrefix: 'dev',
    commandName: 'build',
    seriName,
    yamlFrontMatter: {
      namingCase: 'kebabCase',
      description: 'Build command',
      scope
    },
    markdownContents: []
  } as CommandPrompt
}

function createSkillPrompt(scope: 'project' | 'global', seriName: string): SkillPrompt {
  return {
    type: PromptKind.Skill,
    content: 'skill content',
    length: 13,
    filePathKind: FilePathKind.Relative,
    skillName: 'ship-it',
    dir: {
      pathKind: FilePathKind.Relative,
      path: 'skills/ship-it',
      basePath: path.resolve('tmp/dist/skills'),
      getDirectoryName: () => 'ship-it',
      getAbsolutePath: () => path.resolve('tmp/dist/skills/ship-it')
    },
    seriName,
    yamlFrontMatter: {
      namingCase: 'kebabCase',
      description: 'Ship release',
      scope
    },
    markdownContents: []
  } as SkillPrompt
}

function createRulePrompt(scope: 'project' | 'global'): RulePrompt {
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

function createProject(workspaceBase: string, name: string, includeSeries: readonly string[], promptSource = false): Project {
  return {
    name,
    dirFromWorkspacePath: {
      pathKind: FilePathKind.Relative,
      path: name,
      basePath: workspaceBase,
      getDirectoryName: () => name,
      getAbsolutePath: () => path.join(workspaceBase, name)
    },
    isPromptSourceProject: promptSource,
    projectConfig: {
      includeSeries: [...includeSeries]
    }
  } as Project
}

function createWorkspaceRootProject(): Project {
  return {
    name: '__workspace__',
    isWorkspaceRootProject: true
  } as Project
}

function createWriteContext(
  workspaceBase: string,
  projects: readonly Project[],
  commands: readonly CommandPrompt[],
  skills: readonly SkillPrompt[],
  scopeOverrides: {
    readonly commands: OutputScopeSelection
    readonly skills: OutputScopeSelection
  }
): OutputWriteContext {
  return {
    logger: createLogger('WindsurfOutputPlugin', 'error'),
    fs,
    path,
    glob: {} as never,
    dryRun: true,
    pluginOptions: {
      outputScopes: {
        plugins: {
          WindsurfOutputPlugin: scopeOverrides
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
        projects: [...projects]
      },
      commands,
      skills
    }
  } as OutputWriteContext
}

describe('windsurfOutputPlugin synthetic workspace project output', () => {
  it('writes workflows and skills to each real project when project scope is selected', async () => {
    const workspaceBase = path.resolve('tmp/windsurf-project-scope')
    const plugin = new WindsurfOutputPlugin()
    const context = createWriteContext(
      workspaceBase,
      [
        createProject(workspaceBase, 'alpha-project', ['alpha'], true),
        createProject(workspaceBase, 'beta-project', ['beta'])
      ],
      [createCommandPrompt('project', 'alpha')],
      [createSkillPrompt('project', 'alpha')],
      {commands: 'project', skills: 'project'}
    )

    const declarations = await plugin.declareOutputFiles(context)
    const paths = declarations.map(declaration => declaration.path)

    expect(paths).toContain(path.join(workspaceBase, 'alpha-project', '.windsurf', 'workflows', 'dev-build.md'))
    expect(paths).toContain(path.join(workspaceBase, 'alpha-project', '.windsurf', 'skills', 'ship-it', 'SKILL.md'))
    expect(paths.some(outputPath => outputPath.includes(path.join('beta-project', '.windsurf')))).toBe(false)
    expect(declarations.every(declaration => declaration.scope === 'project')).toBe(true)
  })

  it('writes project-scoped workflows and skills into workspace root via the synthetic workspace project', async () => {
    const workspaceBase = path.resolve('tmp/windsurf-workspace-project')
    const plugin = new WindsurfOutputPlugin()
    const context = createWriteContext(
      workspaceBase,
      [createWorkspaceRootProject()],
      [createCommandPrompt('project', 'alpha')],
      [createSkillPrompt('project', 'alpha')],
      {commands: 'project', skills: 'project'}
    )

    const declarations = await plugin.declareOutputFiles(context)
    const paths = declarations.map(declaration => declaration.path)

    expect(paths).toContain(path.join(workspaceBase, '.windsurf', 'workflows', 'dev-build.md'))
    expect(paths).toContain(path.join(workspaceBase, '.windsurf', 'skills', 'ship-it', 'SKILL.md'))
    expect(declarations.every(declaration => declaration.scope === 'project')).toBe(true)
  })

  it('writes project-scoped rules into workspace-root .windsurf/rules via the synthetic workspace project', async () => {
    const workspaceBase = path.resolve('tmp/windsurf-workspace-rules')
    const plugin = new WindsurfOutputPlugin()
    const context = {
      logger: createLogger('WindsurfOutputPlugin', 'error'),
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
          projects: [createWorkspaceRootProject()]
        },
        rules: [createRulePrompt('project')]
      }
    } as OutputWriteContext

    const declarations = await plugin.declareOutputFiles(context)

    expect(declarations.map(declaration => declaration.path)).toContain(
      path.join(workspaceBase, '.windsurf', 'rules', 'rule-ops-guard.md')
    )
    expect(declarations.every(declaration => declaration.scope === 'project')).toBe(true)
  })
})
