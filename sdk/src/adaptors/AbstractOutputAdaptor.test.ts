import type {OutputWriteContext, ProjectChildrenMemoryPrompt, ProjectRootMemoryPrompt} from './adaptor-core'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {describe, expect, it} from 'vitest'
import {AbstractOutputAdaptor, createLogger, FilePathKind, PromptKind} from './adaptor-core'

class TestDefaultPromptOutputAdaptor extends AbstractOutputAdaptor {
  constructor() {
    super('TestDefaultPromptOutputAdaptor', {
      outputFileName: 'TEST.md',
      treatWorkspaceRootProjectAsProject: true
    })
  }
}

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

describe('abstractOutputAdaptor prompt-source project exclusion', () => {
  it('skips prompt-source projects and still writes synthetic workspace root prompts through the default builder', async () => {
    const plugin = new TestDefaultPromptOutputAdaptor()
    const workspaceBase = path.resolve('tmp/abstract-output-plugin')
    const ctx = {
      logger: createLogger('TestDefaultPromptOutputAdaptor', 'error'),
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
              childMemoryPrompts: [createChildPrompt(workspaceBase, 'aindex', 'commands', 'prompt-source child')]
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
              childMemoryPrompts: [createChildPrompt(workspaceBase, 'project-a', 'commands', 'project child')]
            }
          ]
        }
      }
    } as unknown as OutputWriteContext

    const declarations = await plugin.declareOutputFiles(ctx)
    const paths = declarations.map(declaration => declaration.path)

    expect(paths).toContain(path.join(workspaceBase, 'TEST.md'))
    expect(paths).toContain(path.join(workspaceBase, 'project-a', 'TEST.md'))
    expect(paths).toContain(path.join(workspaceBase, 'project-a', 'commands', 'TEST.md'))
    expect(paths).not.toContain(path.join(workspaceBase, 'aindex', 'TEST.md'))
    expect(paths).not.toContain(path.join(workspaceBase, 'aindex', 'commands', 'TEST.md'))
  })
})
