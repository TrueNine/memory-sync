import type {OutputCleanContext, OutputWriteContext, Project} from './adaptor-core'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {describe, expect, it} from 'vitest'
import {GitExcludeOutputAdaptor} from './GitExcludeOutputAdaptor'
import {createLogger, FilePathKind} from './adaptor-core'

function createWorkspaceRootProject(): Project {
  return {
    name: '__workspace__',
    isWorkspaceRootProject: true
  } as Project
}

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

function createWriteContext(workspaceBase: string, projects: readonly Project[]): OutputWriteContext {
  return {
    logger: createLogger('GitExcludeOutputAdaptor', 'error'),
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
      },
      globalGitIgnore: 'dist/\n',
      shadowGitExclude: '.idea/\n'
    }
  } as unknown as OutputWriteContext
}

function createCleanContext(workspaceBase: string, projects: readonly Project[]): OutputCleanContext {
  return {
    logger: createLogger('GitExcludeOutputAdaptor', 'error'),
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

describe('gitExcludeOutputAdaptor workspace cleanup', () => {
  it('includes workspace-root .git/info/exclude for output and cleanup', async () => {
    const workspaceBase = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-git-exclude-root-'))
    const projectDir = path.join(workspaceBase, 'packages', 'app')
    fs.mkdirSync(path.join(workspaceBase, '.git', 'info'), {recursive: true})
    fs.mkdirSync(path.join(projectDir, '.git', 'info'), {recursive: true})

    try {
      const plugin = new GitExcludeOutputAdaptor()
      const projects = [createWorkspaceRootProject(), createProject(workspaceBase, 'packages/app')]
      const outputDeclarations = await plugin.declareOutputFiles(createWriteContext(workspaceBase, projects))
      const cleanupDeclarations = await plugin.declareCleanupPaths(createCleanContext(workspaceBase, projects))
      const outputPaths = outputDeclarations.map(declaration => declaration.path)
      const cleanupPaths = cleanupDeclarations.delete?.map(target => target.path) ?? []

      expect(outputPaths).toContain(path.join(workspaceBase, '.git', 'info', 'exclude'))
      expect(outputPaths).toContain(path.join(projectDir, '.git', 'info', 'exclude'))
      expect(cleanupPaths).toContain(path.join(workspaceBase, '.git', 'info', 'exclude'))
      expect(cleanupPaths).toContain(path.join(projectDir, '.git', 'info', 'exclude'))
    } finally {
      fs.rmSync(workspaceBase, {recursive: true, force: true})
    }
  })

  it('still includes workspace-root .git/info/exclude when only the synthetic workspace project exists', async () => {
    const workspaceBase = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-git-exclude-synthetic-root-'))
    fs.mkdirSync(path.join(workspaceBase, '.git', 'info'), {recursive: true})

    try {
      const plugin = new GitExcludeOutputAdaptor()
      const projects = [createWorkspaceRootProject()]
      const outputDeclarations = await plugin.declareOutputFiles(createWriteContext(workspaceBase, projects))
      const cleanupDeclarations = await plugin.declareCleanupPaths(createCleanContext(workspaceBase, projects))
      const outputPaths = outputDeclarations.map(declaration => declaration.path)
      const cleanupPaths = cleanupDeclarations.delete?.map(target => target.path) ?? []
      const workspaceExcludePath = path.join(workspaceBase, '.git', 'info', 'exclude')

      expect(outputPaths).toEqual([workspaceExcludePath])
      expect(cleanupPaths).toEqual([workspaceExcludePath])
    } finally {
      fs.rmSync(workspaceBase, {recursive: true, force: true})
    }
  })
})
