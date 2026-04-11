import type {
  GlobalMemoryPrompt,
  OutputCleanContext,
  OutputWriteContext,
  Project,
  ProjectChildrenMemoryPrompt,
  ProjectRootMemoryPrompt
} from './adaptor-core'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {describe, expect, it} from 'vitest'
import {getEffectiveHomeDir} from '@/runtime-environment'
import {createLogger, FilePathKind, PromptKind} from './adaptor-core'
import {NativeGeminiCLIOutputAdaptor} from './NativeGeminiCLIOutputAdaptor'

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
      path: '.gemini',
      basePath: getEffectiveHomeDir(),
      getDirectoryName: () => '.gemini',
      getAbsolutePath: () => path.join(getEffectiveHomeDir(), '.gemini')
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

function createWriteContext(workspaceBase: string): OutputWriteContext {
  return {
    logger: createLogger('NativeGeminiCLIOutputAdaptorTest', 'error'),
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
            rootMemoryPrompt: createRootPrompt('workspace root')
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
            rootMemoryPrompt: createRootPrompt('prompt-source root'),
            childMemoryPrompts: [
              createChildPrompt(
                workspaceBase,
                'aindex',
                'commands',
                'prompt-source child'
              )
            ]
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

describe('native gemini output adaptor', () => {
  it('keeps project and global prompt outputs through the native planner contract', async () => {
    const plugin = new NativeGeminiCLIOutputAdaptor()
    const workspaceBase = path.resolve('tmp/native-gemini-plugin')
    const ctx = createWriteContext(workspaceBase)
    const declarations = await plugin.declareOutputFiles(ctx)
    const outputPaths = declarations.map(declaration => declaration.path)
    const globalPath = path.join(getEffectiveHomeDir(), '.gemini', 'GEMINI.md')
    const workspaceDeclaration = declarations.find(declaration => declaration.path === path.join(workspaceBase, 'GEMINI.md'))
    const globalDeclaration = declarations.find(declaration => declaration.path === globalPath)

    expect(outputPaths).toContain(path.join(workspaceBase, 'GEMINI.md'))
    expect(outputPaths).toContain(path.join(workspaceBase, 'project-a', 'GEMINI.md'))
    expect(outputPaths).toContain(path.join(workspaceBase, 'project-a', 'commands', 'GEMINI.md'))
    expect(outputPaths).not.toContain(path.join(workspaceBase, 'aindex', 'GEMINI.md'))
    expect(outputPaths).toContain(globalPath)

    if (workspaceDeclaration == null || globalDeclaration == null) {
      throw new Error('Expected Gemini declarations were not emitted')
    }

    await expect(plugin.convertContent(workspaceDeclaration, ctx)).resolves.toBe('workspace root')
    await expect(plugin.convertContent(globalDeclaration, ctx)).resolves.toBe('global memory')
  })

  it('keeps prompt-source and global cleanup coverage through the native planner contract', async () => {
    const plugin = new NativeGeminiCLIOutputAdaptor()
    const workspaceBase = path.resolve('tmp/native-gemini-cleanup')
    const cleanup = await plugin.declareCleanupPaths(createCleanContext(workspaceBase))
    const deletePaths = cleanup.delete?.map(target => target.path.replaceAll('\\', '/')) ?? []

    expect(deletePaths).toContain(path.join(workspaceBase, 'GEMINI.md').replaceAll('\\', '/'))
    expect(deletePaths).toContain(path.join(workspaceBase, 'aindex', 'GEMINI.md').replaceAll('\\', '/'))
    expect(deletePaths).toContain(path.join(workspaceBase, 'aindex', 'commands', 'GEMINI.md').replaceAll('\\', '/'))
    expect(deletePaths).toContain(path.join(workspaceBase, 'project-a', 'GEMINI.md').replaceAll('\\', '/'))
    expect(deletePaths).toContain(path.join(getEffectiveHomeDir(), '.gemini', 'GEMINI.md').replaceAll('\\', '/'))
  })
})
