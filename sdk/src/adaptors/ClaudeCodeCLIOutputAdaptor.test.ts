import type {OutputCleanContext, Project} from './adaptor-core'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {describe, expect, it} from 'vitest'
import {createLogger, FilePathKind} from './adaptor-core'
import {ClaudeCodeCLIOutputAdaptor} from './ClaudeCodeCLIOutputAdaptor'

function createProject(workspaceBase: string, name: string): Project {
  return {
    name,
    dirFromWorkspacePath: {
      pathKind: FilePathKind.Relative,
      path: name,
      basePath: workspaceBase,
      getDirectoryName: () => name,
      getAbsolutePath: () => path.join(workspaceBase, name)
    }
  } as Project
}

function createWorkspaceRootProject(): Project {
  return {
    name: '__workspace__',
    isWorkspaceRootProject: true
  } as Project
}

function createCleanContext(workspaceBase: string, projects: readonly Project[]): OutputCleanContext {
  return {
    logger: createLogger('ClaudeCodeCLIOutputAdaptorTest', 'error'),
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
        projects: [...projects]
      }
    }
  } as unknown as OutputCleanContext
}

describe('claudeCodeCLIOutputAdaptor cleanup', () => {
  it('includes project Claude settings cleanup targets', async () => {
    const workspaceBase = path.resolve('tmp/claude-code-cleanup')
    const plugin = new ClaudeCodeCLIOutputAdaptor()
    const cleanup = await plugin.declareCleanupPaths(createCleanContext(
      workspaceBase,
      [createWorkspaceRootProject(), createProject(workspaceBase, 'consumer-app')]
    ))
    const deletePaths = cleanup.delete?.map(target => target.path.replaceAll('\\', '/')) ?? []

    expect(deletePaths).toContain(path.join(workspaceBase, '.claude', 'settings.json').replaceAll('\\', '/'))
    expect(deletePaths).toContain(path.join(workspaceBase, '.claude', 'settings.local.json').replaceAll('\\', '/'))
    expect(deletePaths).toContain(path.join(workspaceBase, 'consumer-app', '.claude', 'settings.json').replaceAll('\\', '/'))
    expect(deletePaths).toContain(path.join(workspaceBase, 'consumer-app', '.claude', 'settings.local.json').replaceAll('\\', '/'))
  })
})
