import type {ILogger, OutputCleanContext, OutputCleanupDeclarations, OutputPlugin} from '../plugins/plugin-core'
import * as fs from 'node:fs'
import * as path from 'node:path'
import glob from 'fast-glob'
import {describe, expect, it, vi} from 'vitest'
import {FilePathKind, PluginKind} from '../plugins/plugin-core'

const nativeBindingMocks = vi.hoisted(() => ({
  planCleanup: vi.fn<(snapshotJson: string) => string>(),
  performCleanup: vi.fn<(snapshotJson: string) => string>()
}))

vi.mock('../core/native-binding', () => ({
  getNativeBinding: () => ({
    ...globalThis.__TNMSC_TEST_NATIVE_BINDING__,
    planCleanup: nativeBindingMocks.planCleanup,
    performCleanup: nativeBindingMocks.performCleanup
  })
}))

const cleanupModulePromise = import('./CleanupUtils')

function createMockLogger(): ILogger {
  return {
    trace: () => {},
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    fatal: () => {}
  } as ILogger
}

function createCleanContext(workspaceDir: string): OutputCleanContext {
  return {
    logger: createMockLogger(),
    fs,
    path,
    glob,
    collectedOutputContext: {
      workspace: {
        directory: {
          pathKind: FilePathKind.Absolute,
          path: workspaceDir,
          getDirectoryName: () => path.basename(workspaceDir),
          getAbsolutePath: () => workspaceDir
        },
        projects: [
          {
            dirFromWorkspacePath: {
              pathKind: FilePathKind.Relative,
              path: 'project-a',
              basePath: workspaceDir,
              getDirectoryName: () => 'project-a',
              getAbsolutePath: () => path.join(workspaceDir, 'project-a')
            }
          }
        ]
      },
      aindexDir: path.join(workspaceDir, 'aindex')
    }
  } as OutputCleanContext
}

function createMockOutputPlugin(): OutputPlugin {
  return {
    type: PluginKind.Output,
    name: 'MockOutputPlugin',
    log: createMockLogger(),
    declarativeOutput: true,
    outputCapabilities: {},
    async declareOutputFiles() {
      return [{path: path.join('/tmp', 'project-a', 'AGENTS.md'), source: {}}]
    },
    async declareCleanupPaths(): Promise<OutputCleanupDeclarations> {
      return {
        delete: [{kind: 'glob', path: path.join('/tmp', '.codex', 'skills', '*'), excludeBasenames: ['.system']}]
      }
    },
    async convertContent() {
      return 'test'
    }
  }
}

describe('cleanupUtils native adapter', () => {
  it('uses the native cleanup bridge when it is available', async () => {
    nativeBindingMocks.planCleanup.mockReset()
    nativeBindingMocks.performCleanup.mockReset()

    nativeBindingMocks.planCleanup.mockReturnValue(
      JSON.stringify({
        filesToDelete: ['/tmp/project-a/AGENTS.md'],
        dirsToDelete: ['/tmp/.codex/skills/legacy'],
        emptyDirsToDelete: ['/tmp/.codex/skills'],
        violations: [],
        conflicts: [],
        excludedScanGlobs: ['**/.git/**']
      })
    )
    nativeBindingMocks.performCleanup.mockReturnValue(
      JSON.stringify({
        deletedFiles: 1,
        deletedDirs: 2,
        errors: [],
        violations: [],
        conflicts: [],
        filesToDelete: ['/tmp/project-a/AGENTS.md'],
        dirsToDelete: ['/tmp/.codex/skills/legacy'],
        emptyDirsToDelete: ['/tmp/.codex/skills'],
        excludedScanGlobs: ['**/.git/**']
      })
    )

    const {collectDeletionTargets, hasNativeCleanupBinding, performCleanup} = await cleanupModulePromise
    const workspaceDir = path.resolve('tmp-native-cleanup-adapter')
    const cleanCtx = createCleanContext(workspaceDir)
    const plugin = createMockOutputPlugin()

    expect(hasNativeCleanupBinding()).toBe(true)

    const plan = await collectDeletionTargets([plugin], cleanCtx)
    expect(plan).toEqual({
      filesToDelete: ['/tmp/project-a/AGENTS.md'],
      dirsToDelete: ['/tmp/.codex/skills/legacy'],
      emptyDirsToDelete: ['/tmp/.codex/skills'],
      violations: [],
      conflicts: [],
      excludedScanGlobs: ['**/.git/**']
    })
    expect(nativeBindingMocks.planCleanup).toHaveBeenCalledOnce()

    const planSnapshot = JSON.parse(String(nativeBindingMocks.planCleanup.mock.calls[0]?.[0])) as {
      readonly pluginSnapshots: readonly {pluginName: string, outputs: readonly string[], cleanup: {delete?: readonly {kind: string}[]}}[]
    }
    expect(planSnapshot.pluginSnapshots).toEqual([
      expect.objectContaining({
        pluginName: 'MockOutputPlugin',
        outputs: ['/tmp/project-a/AGENTS.md'],
        cleanup: expect.objectContaining({
          delete: [expect.objectContaining({kind: 'glob'})]
        })
      })
    ])

    const result = await performCleanup([plugin], cleanCtx, createMockLogger())
    expect(result).toEqual({
      deletedFiles: 1,
      deletedDirs: 3,
      errors: [],
      violations: [],
      conflicts: []
    })
    expect(nativeBindingMocks.performCleanup).toHaveBeenCalledOnce()
  })
})
