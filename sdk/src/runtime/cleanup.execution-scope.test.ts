import type {OutputCleanContext, OutputPlugin, Project} from '../plugins/plugin-core'
import * as path from 'node:path'
import {afterEach, describe, expect, it} from 'vitest'
import {
  createEmptyExecutionPlanProjectsBySeries,
  createLogger,
  FilePathKind,
  PluginKind
} from '../plugins/plugin-core'
import {collectDeletionTargets} from './cleanup'

function createProject(workspaceDir: string | undefined, name: string, series: Project['promptSeries']): Project {
  return {
    name,
    promptSeries: series,
    dirFromWorkspacePath: {
      pathKind: FilePathKind.Relative,
      path: name,
      basePath: workspaceDir ?? '',
      getDirectoryName: () => name,
      getAbsolutePath: () => path.join(workspaceDir ?? '', name)
    }
  }
}

function createPluginOptions(workspaceDir: string, plugins: Record<string, boolean> = {}) {
  return {
    version: '0.0.0',
    workspaceDir,
    logLevel: 'error' as const,
    aindex: {
      dir: 'aindex',
      skills: {src: 'skills', dist: 'dist/skills'},
      commands: {src: 'commands', dist: 'dist/commands'},
      subAgents: {src: 'subagents', dist: 'dist/subagents'},
      rules: {src: 'rules', dist: 'dist/rules'},
      globalPrompt: {src: 'global.src.mdx', dist: 'dist/global.mdx'},
      workspacePrompt: {src: 'workspace.src.mdx', dist: 'dist/workspace.mdx'},
      app: {src: 'app', dist: 'dist/app'},
      ext: {src: 'ext', dist: 'dist/ext'},
      arch: {src: 'arch', dist: 'dist/arch'},
      softwares: {src: 'softwares', dist: 'dist/softwares'}
    },
    frontMatter: {blankLineAfter: true},
    codeStyles: {
      indent: 'space' as const,
      tabSize: 2
    },
    windows: {},
    plugins
  }
}

afterEach(() => {
  const testGlobals = globalThis as typeof globalThis & {__TNMSC_TEST_NATIVE_BINDING__?: object}
  delete testGlobals.__TNMSC_TEST_NATIVE_BINDING__
})

describe('cleanup execution scope filtering', () => {
  it('filters outputs and cleanup targets down to the matched project plus global entries', async () => {
    const workspaceDir = path.resolve('/tmp/tnmsc-cleanup-execution-scope')
    const globalConfigPath = path.resolve('/tmp/tnmsc-cleanup-execution-scope-global/CODEX.md')
    let capturedSnapshot: Record<string, unknown> | undefined

    const testGlobals = globalThis as typeof globalThis & {__TNMSC_TEST_NATIVE_BINDING__?: object}
    testGlobals.__TNMSC_TEST_NATIVE_BINDING__ = {
      planCleanup(snapshotJson: string) {
        capturedSnapshot = JSON.parse(snapshotJson) as Record<string, unknown>
        return JSON.stringify({
          filesToDelete: [],
          dirsToDelete: [],
          emptyDirsToDelete: [],
          violations: [],
          conflicts: [],
          excludedScanGlobs: []
        })
      },
      performCleanup() {
        throw new Error('performCleanup should not be called in this test')
      }
    }

    const plugin: OutputPlugin = {
      name: 'ExecutionScopeCleanupPlugin',
      type: PluginKind.Output,
      log: createLogger('ExecutionScopeCleanupPlugin', 'error'),
      declarativeOutput: true,
      outputCapabilities: {},
      async declareOutputFiles() {
        return [
          {path: path.join(workspaceDir, 'WARP.md'), scope: 'project', source: {}},
          {path: path.join(workspaceDir, 'plugin-one', 'WARP.md'), scope: 'project', source: {}},
          {path: path.join(workspaceDir, 'app-one', 'AGENTS.md'), scope: 'project', source: {}},
          {path: globalConfigPath, scope: 'global', source: {}}
        ]
      },
      async convertContent() {
        return ''
      },
      async declareCleanupPaths() {
        return {
          delete: [
            {path: path.join(workspaceDir, 'WARP.md'), kind: 'file', scope: 'project'},
            {path: path.join(workspaceDir, 'plugin-one', 'WARP.md'), kind: 'file', scope: 'project'},
            {path: path.join(workspaceDir, 'app-one', 'AGENTS.md'), kind: 'file', scope: 'project'},
            {path: globalConfigPath, kind: 'file', scope: 'global'}
          ],
          protect: [
            {path: path.join(workspaceDir, 'plugin-one', 'docs'), kind: 'directory', scope: 'project'},
            {path: path.join(workspaceDir, 'app-one', 'docs'), kind: 'directory', scope: 'project'}
          ]
        }
      }
    }

    const executionPlan = {
      scope: 'project' as const,
      cwd: path.join(workspaceDir, 'plugin-one', 'nested'),
      workspaceDir,
      projectsBySeries: {
        ...createEmptyExecutionPlanProjectsBySeries(),
        ext: [{
          name: 'plugin-one',
          rootDir: path.join(workspaceDir, 'plugin-one'),
          series: 'ext' as const
        }],
        app: [{
          name: 'app-one',
          rootDir: path.join(workspaceDir, 'app-one'),
          series: 'app' as const
        }]
      },
      matchedProject: {
        name: 'plugin-one',
        rootDir: path.join(workspaceDir, 'plugin-one'),
        series: 'ext' as const
      }
    }

    const cleanCtx: OutputCleanContext = {
      logger: createLogger('cleanup.execution-scope.test', 'error'),
      collectedOutputContext: {
        workspace: {
          directory: {
            pathKind: FilePathKind.Absolute,
            path: workspaceDir,
            getDirectoryName: () => path.basename(workspaceDir)
          },
          projects: [
            createProject(workspaceDir, 'app-one', 'app'),
            createProject(workspaceDir, 'plugin-one', 'ext')
          ]
        }
      },
      pluginOptions: createPluginOptions(workspaceDir),
      runtimeTargets: {jetbrainsCodexDirs: []},
      executionPlan,
      dryRun: true
    }

    await collectDeletionTargets([plugin], cleanCtx)

    const pluginSnapshot = (capturedSnapshot?.['pluginSnapshots'] as Record<string, unknown>[] | undefined)?.[0]
    expect(pluginSnapshot?.['outputs']).toEqual([
      path.join(workspaceDir, 'plugin-one', 'WARP.md'),
      globalConfigPath
    ])
    expect(pluginSnapshot?.['cleanup']).toEqual({
      delete: [
        {path: path.join(workspaceDir, 'plugin-one', 'WARP.md'), kind: 'file', scope: 'project'},
        {path: globalConfigPath, kind: 'file', scope: 'global'}
      ],
      protect: [
        {path: path.join(workspaceDir, 'plugin-one', 'docs'), kind: 'directory', scope: 'project'}
      ]
    })
  })

  it('keeps cleanup for opt-in plugins while suppressing their outputs by default', async () => {
    const workspaceDir = path.resolve('/tmp/tnmsc-cleanup-opt-in-disabled')
    let capturedSnapshot: Record<string, unknown> | undefined

    const testGlobals = globalThis as typeof globalThis & {__TNMSC_TEST_NATIVE_BINDING__?: object}
    testGlobals.__TNMSC_TEST_NATIVE_BINDING__ = {
      planCleanup(snapshotJson: string) {
        capturedSnapshot = JSON.parse(snapshotJson) as Record<string, unknown>
        return JSON.stringify({
          filesToDelete: [],
          dirsToDelete: [],
          emptyDirsToDelete: [],
          violations: [],
          conflicts: [],
          excludedScanGlobs: []
        })
      },
      performCleanup() {
        throw new Error('performCleanup should not be called in this test')
      }
    }

    const plugin: OutputPlugin = {
      name: 'TraeIDEOutputPlugin',
      type: PluginKind.Output,
      log: createLogger('TraeIDEOutputPlugin', 'error'),
      declarativeOutput: true,
      outputCapabilities: {},
      async declareOutputFiles() {
        return [{
          path: path.join(workspaceDir, '.trae', 'commands', 'review.md'),
          scope: 'project',
          source: {}
        }]
      },
      async convertContent() {
        return ''
      },
      async declareCleanupPaths() {
        return {
          delete: [{
            path: path.join(workspaceDir, '.trae', 'commands'),
            kind: 'directory',
            scope: 'project'
          }]
        }
      }
    }

    const cleanCtx: OutputCleanContext = {
      logger: createLogger('cleanup.execution-scope.test', 'error'),
      collectedOutputContext: {
        workspace: {
          directory: {
            pathKind: FilePathKind.Absolute,
            path: workspaceDir,
            getDirectoryName: () => path.basename(workspaceDir)
          },
          projects: []
        }
      },
      pluginOptions: createPluginOptions(workspaceDir),
      runtimeTargets: {jetbrainsCodexDirs: []},
      executionPlan: {
        scope: 'workspace',
        cwd: workspaceDir,
        workspaceDir,
        projectsBySeries: createEmptyExecutionPlanProjectsBySeries()
      },
      dryRun: true
    }

    await collectDeletionTargets([plugin], cleanCtx)

    const pluginSnapshot = (capturedSnapshot?.['pluginSnapshots'] as Record<string, unknown>[] | undefined)?.[0]
    expect(pluginSnapshot?.['outputs']).toEqual([])
    expect(pluginSnapshot?.['cleanup']).toEqual({
      delete: [{
        path: path.join(workspaceDir, '.trae', 'commands'),
        kind: 'directory',
        scope: 'project'
      }]
    })
  })

  it('restores outputs for opt-in plugins after they are explicitly enabled', async () => {
    const workspaceDir = path.resolve('/tmp/tnmsc-cleanup-opt-in-enabled')
    let capturedSnapshot: Record<string, unknown> | undefined

    const testGlobals = globalThis as typeof globalThis & {__TNMSC_TEST_NATIVE_BINDING__?: object}
    testGlobals.__TNMSC_TEST_NATIVE_BINDING__ = {
      planCleanup(snapshotJson: string) {
        capturedSnapshot = JSON.parse(snapshotJson) as Record<string, unknown>
        return JSON.stringify({
          filesToDelete: [],
          dirsToDelete: [],
          emptyDirsToDelete: [],
          violations: [],
          conflicts: [],
          excludedScanGlobs: []
        })
      },
      performCleanup() {
        throw new Error('performCleanup should not be called in this test')
      }
    }

    const outputPath = path.join(workspaceDir, '.trae', 'commands', 'review.md')
    const plugin: OutputPlugin = {
      name: 'TraeIDEOutputPlugin',
      type: PluginKind.Output,
      log: createLogger('TraeIDEOutputPlugin', 'error'),
      declarativeOutput: true,
      outputCapabilities: {},
      async declareOutputFiles() {
        return [{
          path: outputPath,
          scope: 'project',
          source: {}
        }]
      },
      async convertContent() {
        return ''
      },
      async declareCleanupPaths() {
        return {
          delete: [{
            path: path.join(workspaceDir, '.trae', 'commands'),
            kind: 'directory',
            scope: 'project'
          }]
        }
      }
    }

    const cleanCtx: OutputCleanContext = {
      logger: createLogger('cleanup.execution-scope.test', 'error'),
      collectedOutputContext: {
        workspace: {
          directory: {
            pathKind: FilePathKind.Absolute,
            path: workspaceDir,
            getDirectoryName: () => path.basename(workspaceDir)
          },
          projects: []
        }
      },
      pluginOptions: createPluginOptions(workspaceDir, {trae: true}),
      runtimeTargets: {jetbrainsCodexDirs: []},
      executionPlan: {
        scope: 'workspace',
        cwd: workspaceDir,
        workspaceDir,
        projectsBySeries: createEmptyExecutionPlanProjectsBySeries()
      },
      dryRun: true
    }

    await collectDeletionTargets([plugin], cleanCtx)

    const pluginSnapshot = (capturedSnapshot?.['pluginSnapshots'] as Record<string, unknown>[] | undefined)?.[0]
    expect(pluginSnapshot?.['outputs']).toEqual([outputPath])
  })
})
