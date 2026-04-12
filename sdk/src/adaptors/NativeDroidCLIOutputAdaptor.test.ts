import type {
  CommandPrompt,
  GlobalMemoryPrompt,
  OutputCleanContext,
  OutputWriteContext,
  Project,
  ProjectChildrenMemoryPrompt,
  ProjectRootMemoryPrompt,
  SkillPrompt
} from './adaptor-core'
import {Buffer} from 'node:buffer'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {describe, expect, it} from 'vitest'
import {getEffectiveHomeDir} from '@/runtime-environment'
import {createLogger, FilePathKind, PromptKind} from './adaptor-core'
import {NativeDroidCLIOutputAdaptor} from './NativeDroidCLIOutputAdaptor'

function createRootPrompt(content: string): ProjectRootMemoryPrompt {
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

function createGlobalMemoryPrompt(content: string): GlobalMemoryPrompt {
  return {
    type: PromptKind.GlobalMemory,
    content,
    length: content.length,
    filePathKind: FilePathKind.Relative,
    dir: {
      pathKind: FilePathKind.Relative,
      path: '.factory',
      basePath: getEffectiveHomeDir(),
      getDirectoryName: () => '.factory',
      getAbsolutePath: () => path.join(getEffectiveHomeDir(), '.factory')
    },
    markdownContents: []
  } as GlobalMemoryPrompt
}

function createChildPrompt(
  workspaceBase: string,
  projectName: string,
  relativePath: string,
  content: string
): ProjectChildrenMemoryPrompt {
  return {
    type: PromptKind.ProjectChildrenMemory,
    content,
    length: content.length,
    filePathKind: FilePathKind.Relative,
    markdownContents: [],
    dir: {
      pathKind: FilePathKind.Relative,
      path: relativePath,
      basePath: path.join(workspaceBase, projectName),
      getDirectoryName: () => path.basename(relativePath),
      getAbsolutePath: () => path.join(workspaceBase, projectName, relativePath)
    },
    workingChildDirectoryPath: {
      pathKind: FilePathKind.Relative,
      path: relativePath,
      basePath: path.join(workspaceBase, projectName),
      getDirectoryName: () => path.basename(relativePath),
      getAbsolutePath: () => path.join(workspaceBase, projectName, relativePath)
    }
  } as ProjectChildrenMemoryPrompt
}

function createCommandPrompt(scope: 'project' | 'global'): CommandPrompt {
  return {
    type: PromptKind.Command,
    content: 'Run build',
    length: 'Run build'.length,
    commandName: 'build',
    commandPrefix: 'shared',
    ...(scope === 'global' ? {globalOnly: true} : {}),
    dir: {
      pathKind: FilePathKind.Relative,
      path: 'commands/build.mdx',
      basePath: path.resolve('tmp/native-droid-plugin/aindex'),
      getDirectoryName: () => 'commands',
      getAbsolutePath: () => path.resolve('tmp/native-droid-plugin/aindex/commands/build.mdx')
    },
    yamlFrontMatter: {
      description: 'Build command',
      ...(scope === 'global' ? {scope: 'global'} : {})
    },
    markdownContents: []
  } as CommandPrompt
}

function createSkillPrompt(scope: 'project' | 'global'): SkillPrompt {
  return {
    type: PromptKind.Skill,
    content: 'Skill body',
    length: 'Skill body'.length,
    skillName: 'ship',
    seriName: 'shared',
    dir: {
      pathKind: FilePathKind.Relative,
      path: 'ship',
      basePath: path.resolve('tmp/native-droid-plugin/aindex/dist/skills'),
      getDirectoryName: () => 'ship',
      getAbsolutePath: () => path.resolve('tmp/native-droid-plugin/aindex/dist/skills/ship')
    },
    yamlFrontMatter: {
      name: 'ship',
      description: 'Skill description',
      ...(scope === 'global' ? {scope: 'global'} : {})
    },
    childDocs: [
      {
        type: PromptKind.SkillChildDoc,
        content: 'Guide body',
        length: 'Guide body'.length,
        filePathKind: FilePathKind.Relative,
        relativePath: 'guide.mdx',
        dir: {
          pathKind: FilePathKind.Relative,
          path: 'ship',
          basePath: path.resolve('tmp/native-droid-plugin/aindex/dist/skills'),
          getDirectoryName: () => 'ship',
          getAbsolutePath: () => path.resolve('tmp/native-droid-plugin/aindex/dist/skills/ship')
        },
        markdownContents: []
      }
    ],
    resources: [
      {
        type: PromptKind.SkillResource,
        extension: '.bin',
        fileName: 'blob.bin',
        relativePath: 'assets/blob.bin',
        content: 'aGVsbG8=',
        encoding: 'base64',
        length: 8
      }
    ],
    markdownContents: []
  } as SkillPrompt
}

function createWriteContext(workspaceBase: string): OutputWriteContext {
  return {
    logger: createLogger('NativeDroidCLIOutputAdaptorTest', 'error'),
    fs,
    path,
    glob: {} as never,
    dryRun: true,
    runtimeTargets: {jetbrainsCodexDirs: []},
    collectedOutputContext: {
      workspace: {
        directory: {
          pathKind: FilePathKind.Absolute,
          path: workspaceBase,
          getDirectoryName: () => path.basename(workspaceBase)
        },
        projects: [
          {
            name: '__workspace__',
            isWorkspaceRootProject: true,
            rootMemoryPrompt: createRootPrompt('workspace root'),
            projectConfig: {
              includeSeries: ['shared'],
              skills: {includeSeries: ['shared']}
            }
          },
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
            projectConfig: {
              includeSeries: ['shared'],
              skills: {includeSeries: ['shared']}
            },
            rootMemoryPrompt: createRootPrompt('prompt-source root')
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
            projectConfig: {
              includeSeries: ['shared'],
              skills: {includeSeries: ['shared']}
            },
            rootMemoryPrompt: createRootPrompt('project root'),
            childMemoryPrompts: [
              createChildPrompt(
                workspaceBase,
                'project-a',
                'commands',
                'project child'
              )
            ]
          }
        ] as Project[]
      },
      commands: [createCommandPrompt('project')],
      skills: [createSkillPrompt('project')],
      globalMemory: createGlobalMemoryPrompt('global memory')
    }
  } as unknown as OutputWriteContext
}

function createCleanContext(workspaceBase: string): OutputCleanContext {
  return {
    ...createWriteContext(workspaceBase),
    dryRun: true
  } as OutputCleanContext
}

describe('native droid output adaptor', () => {
  it('keeps prompt, command, and skill outputs through the native planner contract', async () => {
    const plugin = new NativeDroidCLIOutputAdaptor()
    const workspaceBase = path.resolve('tmp/native-droid-plugin')
    const ctx = createWriteContext(workspaceBase)
    const declarations = await plugin.declareOutputFiles(ctx)
    const outputPaths = declarations.map(declaration => declaration.path)
    const globalPath = path.join(getEffectiveHomeDir(), '.factory', 'AGENTS.md')
    const skillMain = declarations.find(declaration => declaration.path.endsWith('.factory/skills/ship/SKILL.md'))
    const skillResource = declarations.find(declaration => declaration.path.endsWith('.factory/skills/ship/assets/blob.bin'))

    expect(outputPaths).toContain(path.join(workspaceBase, 'AGENTS.md'))
    expect(outputPaths).toContain(path.join(workspaceBase, 'project-a', 'AGENTS.md'))
    expect(outputPaths).toContain(path.join(workspaceBase, 'project-a', 'commands', 'AGENTS.md'))
    expect(outputPaths).toContain(path.join(workspaceBase, '.factory', 'commands', 'shared-build.md'))
    expect(outputPaths).toContain(path.join(workspaceBase, 'project-a', '.factory', 'skills', 'ship', 'guide.md'))
    expect(outputPaths).toContain(globalPath)

    if (skillMain == null || skillResource == null) {
      throw new Error('Expected Droid declarations were not emitted')
    }

    await expect(plugin.convertContent(skillMain, ctx)).resolves.toBe('---\nname: ship\ndescription: Skill description\n---\n\nSkill body')

    const resourceContent = await plugin.convertContent(skillResource, ctx)
    expect(Buffer.isBuffer(resourceContent)).toBe(true)
    expect((resourceContent as Buffer).toString('utf8')).toBe('hello')
  })

  it('keeps cleanup coverage through the native planner contract', async () => {
    const plugin = new NativeDroidCLIOutputAdaptor()
    const workspaceBase = path.resolve('tmp/native-droid-cleanup')
    const cleanup = await plugin.declareCleanupPaths(createCleanContext(workspaceBase))
    const deletePaths = cleanup.delete?.map(target => target.path.replaceAll('\\', '/')) ?? []

    expect(deletePaths).toContain(path.join(workspaceBase, 'AGENTS.md').replaceAll('\\', '/'))
    expect(deletePaths).toContain(path.join(workspaceBase, '.factory', 'commands').replaceAll('\\', '/'))
    expect(deletePaths).toContain(path.join(workspaceBase, 'aindex', '.factory', 'skills').replaceAll('\\', '/'))
    expect(deletePaths).toContain(path.join(getEffectiveHomeDir(), '.factory', 'AGENTS.md').replaceAll('\\', '/'))
    expect(deletePaths).not.toContain(path.join(workspaceBase, 'project-a', 'commands', 'AGENTS.md').replaceAll('\\', '/'))
  })
})
