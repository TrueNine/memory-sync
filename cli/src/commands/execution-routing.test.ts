import type {ExecutionPlan} from '@truenine/memory-sync-sdk'
import type {CommandContext} from './Command'
import * as path from 'node:path'
import {createLogger, FilePathKind, mergeConfig} from '@truenine/memory-sync-sdk'
import {afterEach, describe, expect, it, vi} from 'vitest'
import {CleanCommand} from './CleanCommand'
import {DryRunCleanCommand} from './DryRunCleanCommand'
import {InstallCommand} from './InstallCommand'

function createEmptyProjectsBySeries() {
  return {
    app: [],
    ext: [],
    arch: [],
    softwares: []
  }
}

const {
  collectDeletionTargetsMock,
  collectOutputDeclarationsMock,
  executeDeclarativeWriteOutputsMock,
  performCleanupMock,
  syncWindowsConfigIntoWslMock
} = vi.hoisted(() => ({
  collectDeletionTargetsMock: vi.fn(),
  collectOutputDeclarationsMock: vi.fn(),
  executeDeclarativeWriteOutputsMock: vi.fn(),
  performCleanupMock: vi.fn(),
  syncWindowsConfigIntoWslMock: vi.fn()
}))

vi.mock('@truenine/memory-sync-sdk', async importOriginal => {
  const actual = await importOriginal<typeof import('@truenine/memory-sync-sdk')>()

  return {
    ...actual,
    collectDeletionTargets: collectDeletionTargetsMock,
    collectOutputDeclarations: collectOutputDeclarationsMock,
    executeDeclarativeWriteOutputs: executeDeclarativeWriteOutputsMock,
    performCleanup: performCleanupMock,
    syncWindowsConfigIntoWsl: syncWindowsConfigIntoWslMock
  }
})

function createBaseContext(executionPlan: ExecutionPlan): {
  readonly ctx: CommandContext
  readonly debugSpy: ReturnType<typeof vi.spyOn>
  readonly infoSpy: ReturnType<typeof vi.spyOn>
  readonly warnSpy: ReturnType<typeof vi.spyOn>
  readonly errorSpy: ReturnType<typeof vi.spyOn>
} {
  const workspaceDir = executionPlan.workspaceDir
  const logger = createLogger('execution-routing-test', 'debug')
  const debugSpy = vi.spyOn(logger, 'debug')
  const infoSpy = vi.spyOn(logger, 'info')
  const warnSpy = vi.spyOn(logger, 'warn')
  const errorSpy = vi.spyOn(logger, 'error')

  const collectedOutputContext = {
    workspace: {
      directory: {
        pathKind: FilePathKind.Absolute,
        path: workspaceDir,
        getDirectoryName: () => path.basename(workspaceDir)
      },
      projects: []
    }
  }

  const createCleanContext = vi.fn((dryRun: boolean) => ({
    logger,
    collectedOutputContext,
    pluginOptions: mergeConfig({workspaceDir}),
    runtimeTargets: {jetbrainsCodexDirs: []},
    executionPlan,
    dryRun
  }))
  const createWriteContext = vi.fn((dryRun: boolean) => ({
    logger,
    collectedOutputContext,
    pluginOptions: mergeConfig({workspaceDir}),
    runtimeTargets: {jetbrainsCodexDirs: []},
    executionPlan,
    dryRun,
    registeredPluginNames: []
  }))

  return {
    ctx: {
      logger,
      outputPlugins: [],
      collectedOutputContext,
      userConfigOptions: mergeConfig({workspaceDir}),
      executionPlan,
      createCleanContext,
      createWriteContext
    } as unknown as CommandContext,
    debugSpy,
    infoSpy,
    warnSpy,
    errorSpy
  }
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('execution-aware command routing', () => {
  it('short-circuits install when cwd is unsupported inside workspace', async () => {
    const workspaceDir = path.resolve('/tmp/tnmsc-install-unsupported')
    const {ctx} = createBaseContext({
      scope: 'unsupported',
      cwd: path.join(workspaceDir, 'scripts'),
      workspaceDir,
      projectsBySeries: createEmptyProjectsBySeries(),
      managedProjects: []
    })

    const result = await new InstallCommand().execute(ctx)

    expect(result.success).toBe(false)
    expect(result.message).toContain('not managed by tnmsc')
    expect(collectOutputDeclarationsMock).not.toHaveBeenCalled()
    expect(performCleanupMock).not.toHaveBeenCalled()
    expect(executeDeclarativeWriteOutputsMock).not.toHaveBeenCalled()
  })

  it('logs project scope details before running clean', async () => {
    const workspaceDir = path.resolve('/tmp/tnmsc-clean-project')
    const {ctx, infoSpy} = createBaseContext({
      scope: 'project',
      cwd: path.join(workspaceDir, 'plugin-one', 'docs'),
      workspaceDir,
      projectsBySeries: {
        ...createEmptyProjectsBySeries(),
        ext: [{
          name: 'plugin-one',
          rootDir: path.join(workspaceDir, 'plugin-one'),
          series: 'ext'
        }]
      },
      matchedProject: {
        name: 'plugin-one',
        rootDir: path.join(workspaceDir, 'plugin-one'),
        series: 'ext'
      }
    })
    performCleanupMock.mockResolvedValue({
      deletedFiles: 0,
      deletedDirs: 0,
      errors: [],
      violations: [],
      conflicts: []
    })

    const result = await new CleanCommand().execute(ctx)

    expect(result.success).toBe(true)
    expect(performCleanupMock).toHaveBeenCalledTimes(1)
    expect(infoSpy.mock.calls).toEqual(expect.arrayContaining([
      ['Running against one managed project', expect.objectContaining({project: 'plugin-one', series: 'ext'})]
    ]))
  })

  it('logs external project groups before running dry-run clean', async () => {
    const workspaceDir = path.resolve('/tmp/tnmsc-dry-run-clean-external')
    const {ctx, debugSpy, warnSpy} = createBaseContext({
      scope: 'external',
      cwd: path.resolve('/tmp/outside-workspace'),
      workspaceDir,
      projectsBySeries: {
        app: [{name: 'app-one', rootDir: path.join(workspaceDir, 'app-one'), series: 'app'}],
        ext: [{name: 'plugin-one', rootDir: path.join(workspaceDir, 'plugin-one'), series: 'ext'}],
        arch: [],
        softwares: [{name: 'tool-one', rootDir: path.join(workspaceDir, 'tool-one'), series: 'softwares'}]
      }
    })
    collectDeletionTargetsMock.mockResolvedValue({
      filesToDelete: [],
      dirsToDelete: [],
      emptyDirsToDelete: [],
      violations: [],
      conflicts: [],
      excludedScanGlobs: []
    })

    const result = await new DryRunCleanCommand().execute(ctx)

    expect(result.success).toBe(true)
    expect(collectDeletionTargetsMock).toHaveBeenCalledTimes(1)
    expect(warnSpy.mock.calls).toEqual(expect.arrayContaining([
      [expect.objectContaining({code: 'EXECUTION_SCOPE_EXTERNAL', title: 'Running outside the workspace'})]
    ]))
    expect(debugSpy.mock.calls).toEqual(expect.arrayContaining([
      ['External execution includes project group', expect.objectContaining({series: 'app', projects: ['app-one']})],
      ['External execution includes project group', expect.objectContaining({series: 'ext', projects: ['plugin-one']})],
      ['External execution includes project group', expect.objectContaining({series: 'softwares', projects: ['tool-one']})]
    ]))
  })
})
