import type {CommandPrompt, OutputScopeSelection, OutputWriteContext, Project, SkillPrompt} from './plugin-core'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {describe, expect, it} from 'vitest'
import {createLogger, FilePathKind, PromptKind} from './plugin-core'
import {WindsurfOutputPlugin} from './WindsurfOutputPlugin'

function createCommandPrompt(scope: 'project' | 'workspace' | 'global', seriName: string): CommandPrompt {
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

function createSkillPrompt(scope: 'project' | 'workspace' | 'global', seriName: string): SkillPrompt {
  return {
    type: PromptKind.Skill,
    content: 'skill content',
    length: 13,
    filePathKind: FilePathKind.Relative,
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
      name: 'ship-it',
      description: 'Ship release',
      scope
    },
    markdownContents: []
  } as SkillPrompt
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

function createWriteContext(
  workspaceBase: string,
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
        projects: [
          createProject(workspaceBase, 'alpha-project', ['alpha'], true),
          createProject(workspaceBase, 'beta-project', ['beta'])
        ]
      },
      commands,
      skills
    }
  } as OutputWriteContext
}

describe('windsurfOutputPlugin scoped commands/skills output', () => {
  it('writes workflows and skills to each project when scope is project', async () => {
    const workspaceBase = path.resolve('tmp/windsurf-project-scope')
    const plugin = new WindsurfOutputPlugin()
    const context = createWriteContext(
      workspaceBase,
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

  it('writes workflows and skills to workspace-local .codeium when scope is workspace', async () => {
    const workspaceBase = path.resolve('tmp/windsurf-workspace-scope')
    const plugin = new WindsurfOutputPlugin()
    const context = createWriteContext(
      workspaceBase,
      [createCommandPrompt('workspace', 'alpha')],
      [createSkillPrompt('workspace', 'alpha')],
      {commands: 'workspace', skills: 'workspace'}
    )

    const declarations = await plugin.declareOutputFiles(context)
    const paths = declarations.map(declaration => declaration.path)

    expect(paths).toContain(path.join(workspaceBase, '.codeium', 'windsurf', 'global_workflows', 'dev-build.md'))
    expect(paths).toContain(path.join(workspaceBase, '.codeium', 'windsurf', 'skills', 'ship-it', 'SKILL.md'))
    expect(declarations.every(declaration => declaration.scope === 'workspace')).toBe(true)
  })
})
