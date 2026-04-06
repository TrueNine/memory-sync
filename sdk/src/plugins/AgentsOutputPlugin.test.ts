import type {OutputWriteContext, ProjectChildrenMemoryPrompt, ProjectRootMemoryPrompt} from './plugin-core'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {describe, expect, it} from 'vitest'
import {AgentsOutputPlugin} from './AgentsOutputPlugin'
import {createLogger, FilePathKind, PromptKind} from './plugin-core'

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

describe('agentsOutputPlugin prompt-source project exclusion', () => {
  it('skips prompt-source project files and still writes the synthetic workspace root prompt', async () => {
    const plugin = new AgentsOutputPlugin()
    const workspaceBase = path.resolve('tmp/agents-plugin')
    const ctx = {
      logger: createLogger('AgentsOutputPlugin', 'error'),
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
    const workspaceDeclaration = declarations.find(declaration => declaration.path === path.join(workspaceBase, 'AGENTS.md'))
    const rootDeclaration = declarations.find(declaration => declaration.path === path.join(workspaceBase, 'project-a', 'AGENTS.md'))
    const childDeclaration = declarations.find(declaration => declaration.path === path.join(workspaceBase, 'project-a', 'commands', 'AGENTS.md'))

    expect(paths).toContain(path.join(workspaceBase, 'AGENTS.md'))
    expect(paths).toContain(path.join(workspaceBase, 'project-a', 'AGENTS.md'))
    expect(paths).toContain(path.join(workspaceBase, 'project-a', 'commands', 'AGENTS.md'))
    expect(paths).not.toContain(path.join(workspaceBase, 'aindex', 'AGENTS.md'))
    expect(paths).not.toContain(path.join(workspaceBase, 'aindex', 'commands', 'AGENTS.md'))
    if (workspaceDeclaration == null || rootDeclaration == null || childDeclaration == null) {
      throw new Error('Expected AGENTS.md declarations were not emitted')
    }

    await expect(plugin.convertContent(workspaceDeclaration, ctx)).resolves.toBe('workspace root')
    await expect(plugin.convertContent(rootDeclaration, ctx)).resolves.toBe('project root')
    await expect(plugin.convertContent(childDeclaration, ctx)).resolves.toBe('project child')
  })
})
