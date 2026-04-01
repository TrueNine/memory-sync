import type {GlobalMemoryPrompt, OutputWriteContext, ProjectRootMemoryPrompt} from './plugin-core'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {describe, expect, it} from 'vitest'
import {createLogger, FilePathKind, PromptKind} from './plugin-core'
import {WarpIDEOutputPlugin} from './WarpIDEOutputPlugin'

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

function createWorkspaceRootPrompt(): ProjectRootMemoryPrompt {
  return {
    type: PromptKind.ProjectRootMemory,
    content: 'workspace prompt',
    length: 16,
    filePathKind: FilePathKind.Relative,
    dir: {
      pathKind: FilePathKind.Root,
      path: '',
      getDirectoryName: () => ''
    },
    markdownContents: []
  } as ProjectRootMemoryPrompt
}

describe('warpIDEOutputPlugin workspace prompt support', () => {
  it('writes the synthetic workspace root prompt to workspaceDir/WARP.md', async () => {
    const workspaceBase = path.resolve('tmp/warp-workspace')
    const plugin = new WarpIDEOutputPlugin()
    const ctx = {
      logger: createLogger('WarpIDEOutputPlugin', 'error'),
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
        globalMemory: createGlobalMemoryPrompt()
      }
    } as OutputWriteContext

    const declarations = await plugin.declareOutputFiles(ctx)
    const workspaceDeclaration = declarations.find(declaration => declaration.path === path.join(workspaceBase, 'WARP.md'))

    expect(workspaceDeclaration?.path).toBe(path.join(workspaceBase, 'WARP.md'))
    expect(workspaceDeclaration?.scope).toBe('project')
    expect((workspaceDeclaration?.source as {content?: string} | undefined)?.content).toContain('global prompt')
    expect((workspaceDeclaration?.source as {content?: string} | undefined)?.content).toContain('workspace prompt')
  })
})
