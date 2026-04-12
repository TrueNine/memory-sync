import type {
  AdaptorOptions,
  OutputCleanContext,
  OutputWriteContext
} from '../adaptors/adaptor-core'
import type {DefineConfigOptions} from '../config'
import type {MergedConfigResult} from '../ConfigLoader'
import type {ExecutionPlanProjectSummary} from '../execution-plan'
import type {
  ListPromptsOptions,
  PromptCatalogItem,
  PromptDetails,
  PromptServiceOptions,
  UpsertPromptSourceInput,
  WritePromptArtifactsInput
} from '../prompts'
import type {RuntimeCommand} from '../runtime-command'
import type {
  LoggerDiagnosticRecord,
  LogLevel
} from '@/libraries/logger'
import {clearBufferedDiagnostics, createLogger, drainBufferedDiagnostics, setGlobalLogLevel} from '@/libraries/logger'
import {collectOutputDeclarations, executeDeclarativeWriteOutputs} from '../adaptors/adaptor-core/plugin'
import {defineConfig} from '../config'
import {getConfigLoader} from '../ConfigLoader'
import {
  buildDiagnostic,
  buildUnhandledExceptionDiagnostic,
  diagnosticLines,
  partitionBufferedDiagnostics
} from '../diagnostics'
import {discoverOutputRuntimeTargets} from '../pipeline/OutputRuntimeTargets'
import {
  getPrompt,
  listPrompts,
  upsertPromptSource,
  writePromptArtifacts
} from '../prompts'
import {logProtectedDeletionGuardError} from '../ProtectedDeletionGuard'
import {
  collectDeletionTargets,
  performCleanup
} from '../runtime/cleanup'
import {syncWindowsConfigIntoWsl} from '../wsl-mirror-sync'
import {createDefaultOutputAdaptors, describeDefaultOutputAdaptors} from './default-output-plugins'

export type PublicLoggerDiagnosticRecord = Omit<LoggerDiagnosticRecord, 'level'>

export interface MemorySyncCommandOptions {
  readonly cwd?: string
  readonly loadUserConfig?: boolean
  readonly logLevel?: LogLevel
  readonly pluginOptions?: Partial<AdaptorOptions>
}

export type MemorySyncPromptServiceOptions = PromptServiceOptions

export interface MemorySyncCommandResult {
  readonly success: boolean
  readonly filesAffected: number
  readonly dirsAffected: number
  readonly message?: string
  readonly warnings: readonly PublicLoggerDiagnosticRecord[]
  readonly errors: readonly PublicLoggerDiagnosticRecord[]
}

export interface MemorySyncAdaptorInfo {
  readonly name: string
  readonly kind: 'Output'
  readonly description: string
  readonly dependencies: readonly string[]
}

export interface MemorySyncSdkBinding {
  readonly loadConfig: (cwd?: string) => Promise<MergedConfigResult>
  readonly install: (options?: MemorySyncCommandOptions) => Promise<MemorySyncCommandResult>
  readonly dryRun: (options?: MemorySyncCommandOptions) => Promise<MemorySyncCommandResult>
  readonly clean: (
    options?: MemorySyncCommandOptions & {readonly dryRun?: boolean}
  ) => Promise<MemorySyncCommandResult>
  readonly listAdaptors: () => Promise<readonly MemorySyncAdaptorInfo[]>
  readonly listPrompts: (options?: ListPromptsOptions) => Promise<readonly PromptCatalogItem[]>
  readonly getPrompt: (promptId: string, options?: MemorySyncPromptServiceOptions) => Promise<PromptDetails>
  readonly upsertPromptSource: (input: UpsertPromptSourceInput) => Promise<PromptDetails>
  readonly writePromptArtifacts: (input: WritePromptArtifactsInput) => Promise<PromptDetails>
}

interface RuntimeExecutionContext {
  readonly logger: ReturnType<typeof createLogger>
  readonly outputPlugins: ReturnType<typeof createDefaultOutputAdaptors>
  readonly userConfigOptions: Awaited<ReturnType<typeof defineConfig>>['userConfigOptions']
  readonly collectedOutputContext: Awaited<ReturnType<typeof defineConfig>>['context']
  readonly executionPlan: Awaited<ReturnType<typeof defineConfig>>['executionPlan']
  readonly runtimeTargets: ReturnType<typeof discoverOutputRuntimeTargets>
}

const SERIES_ORDER = ['app', 'ext', 'arch', 'softwares'] as const

function buildCommandResult(
  input: Omit<MemorySyncCommandResult, 'warnings' | 'errors'>
): MemorySyncCommandResult {
  const {warnings, errors} = partitionBufferedDiagnostics(drainBufferedDiagnostics())
  return {
    ...input,
    warnings,
    errors
  }
}

function buildUnsupportedMessage(ctx: RuntimeExecutionContext): string {
  return [
    `Unsupported execution directory "${ctx.executionPlan.cwd}".`,
    `The directory is inside workspace "${ctx.executionPlan.workspaceDir}" but is not managed by tnmsc.`,
    'Run tnmsc from the workspace root, from a managed project directory, or from outside the workspace.'
  ].join(' ')
}

function logExternalProjectGroups(ctx: RuntimeExecutionContext): void {
  for (const series of SERIES_ORDER) {
    const projects = ctx.executionPlan.projectsBySeries[series]
    if (projects.length === 0) continue
    ctx.logger.debug('External execution includes project group', {
      series,
      count: projects.length,
      projects: projects.map(project => project.name)
    })
  }
}

function logProjectSummary(
  ctx: RuntimeExecutionContext,
  commandName: string,
  project: ExecutionPlanProjectSummary
): void {
  ctx.logger.info('Running against one managed project', {
    command: commandName,
    project: project.name,
    ...project.series != null ? {series: project.series} : {},
    workspace: ctx.executionPlan.workspaceDir
  })
}

function logInstallCompletion(
  logger: RuntimeExecutionContext['logger'],
  summary: {
    readonly deletedFiles: number
    readonly deletedDirs: number
    readonly writtenFiles: number
    readonly writtenDirs: number
  }
): void {
  const totalFiles = summary.deletedFiles + summary.writtenFiles
  const totalDirs = summary.deletedDirs + summary.writtenDirs

  if (totalFiles === 0 && totalDirs === 0) {
    logger.info('Sync complete\n\nNo changes were needed.')
    return
  }

  logger.info('Sync complete', {
    files: totalFiles,
    directories: totalDirs
  })
}

function logDryRunCompletion(
  logger: RuntimeExecutionContext['logger'],
  filesAffected: number,
  dirsAffected: number
): void {
  if (filesAffected === 0 && dirsAffected === 0) {
    logger.info('Dry run complete\n\nNo changes would be made.')
    return
  }

  logger.info('Dry run complete', {
    files: filesAffected,
    directories: dirsAffected
  })
}

function logCleanCompletion(
  logger: RuntimeExecutionContext['logger'],
  filesAffected: number,
  dirsAffected: number
): void {
  if (filesAffected === 0 && dirsAffected === 0) {
    logger.info('Cleanup complete\n\nNothing needed to be removed.')
    return
  }

  logger.info('Cleanup complete', {
    files: filesAffected,
    directories: dirsAffected
  })
}

function runExecutionPreflight(
  ctx: RuntimeExecutionContext,
  commandName: string
): MemorySyncCommandResult | undefined {
  switch (ctx.executionPlan.scope) {
    case 'workspace':
      ctx.logger.warn(buildDiagnostic({
        code: 'EXECUTION_SCOPE_WORKSPACE',
        title: 'Running from the workspace root',
        rootCause: diagnosticLines(`tnmsc will only sync workspace-level outputs in "${ctx.executionPlan.workspaceDir}".`),
        exactFix: diagnosticLines('Run tnmsc inside a managed project to sync one project, or outside the workspace to sync everything.')
      }))
      return void 0
    case 'project':
      logProjectSummary(ctx, commandName, ctx.executionPlan.matchedProject)
      return void 0
    case 'external':
      ctx.logger.warn(buildDiagnostic({
        code: 'EXECUTION_SCOPE_EXTERNAL',
        title: 'Running outside the workspace',
        rootCause: diagnosticLines(`tnmsc will sync "${ctx.executionPlan.workspaceDir}" and every managed project from the current directory.`),
        exactFix: diagnosticLines(`Run tnmsc in "${ctx.executionPlan.workspaceDir}" for workspace-only sync, or inside a managed project for project-only sync.`)
      }))
      logExternalProjectGroups(ctx)
      return void 0
    case 'unsupported': {
      const message = buildUnsupportedMessage(ctx)
      ctx.logger.error(buildDiagnostic({
        code: 'EXECUTION_SCOPE_UNSUPPORTED',
        title: 'This directory is not a managed tnmsc target',
        rootCause: diagnosticLines(
          `tnmsc cannot map "${ctx.executionPlan.cwd}" to the workspace root or any managed project.`,
          `Workspace: ${ctx.executionPlan.workspaceDir}`
        ),
        exactFix: diagnosticLines(
          'Run tnmsc from the workspace root, from a managed project directory, or from outside the workspace.'
        ),
        details: {
          command: commandName,
          scope: 'unsupported',
          cwd: ctx.executionPlan.cwd,
          workspaceDir: ctx.executionPlan.workspaceDir,
          managedProjectCount: ctx.executionPlan.managedProjects.length
        }
      }))
      return buildCommandResult({
        success: false,
        filesAffected: 0,
        dirsAffected: 0,
        message
      })
    }
  }
}

async function createRuntimeExecutionContext(
  runtimeCommand: RuntimeCommand,
  options: MemorySyncCommandOptions = {}
): Promise<RuntimeExecutionContext> {
  if (options.logLevel != null) setGlobalLogLevel(options.logLevel)
  const outputPlugins = createDefaultOutputAdaptors()
  const pipelineConfig = await defineConfig({
    executionCwd: options.cwd,
    runtimeCommand,
    outputPlugins,
    loadUserConfig: options.loadUserConfig,
    ...options.pluginOptions == null
      ? options.logLevel == null
        ? {}
        : {pluginOptions: {logLevel: options.logLevel} as AdaptorOptions}
      : options.logLevel != null
        ? {pluginOptions: {...options.pluginOptions, logLevel: options.logLevel} as AdaptorOptions}
        : {pluginOptions: options.pluginOptions as AdaptorOptions}
  } as DefineConfigOptions)
  const logger = createLogger('memory-sync-sdk', pipelineConfig.userConfigOptions.logLevel)

  return {
    logger,
    outputPlugins,
    userConfigOptions: pipelineConfig.userConfigOptions,
    collectedOutputContext: pipelineConfig.context,
    executionPlan: pipelineConfig.executionPlan,
    runtimeTargets: discoverOutputRuntimeTargets(logger)
  }
}

function createCleanContext(
  ctx: RuntimeExecutionContext,
  dryRun: boolean
): OutputCleanContext {
  return {
    logger: ctx.logger,
    collectedOutputContext: ctx.collectedOutputContext,
    pluginOptions: ctx.userConfigOptions,
    runtimeTargets: ctx.runtimeTargets,
    executionPlan: ctx.executionPlan,
    dryRun
  }
}

function createWriteContext(
  ctx: RuntimeExecutionContext,
  dryRun: boolean
): OutputWriteContext {
  return {
    logger: ctx.logger,
    collectedOutputContext: ctx.collectedOutputContext,
    pluginOptions: ctx.userConfigOptions,
    runtimeTargets: ctx.runtimeTargets,
    executionPlan: ctx.executionPlan,
    dryRun,
    registeredAdaptorNames: ctx.outputPlugins.map(plugin => plugin.name)
  }
}

async function runInstall(options: MemorySyncCommandOptions = {}): Promise<MemorySyncCommandResult> {
  clearBufferedDiagnostics()
  const ctx = await createRuntimeExecutionContext('install', options)
  const preflightResult = runExecutionPreflight(ctx, 'install')
  if (preflightResult != null) return preflightResult

  const writeCtx = createWriteContext(ctx, false)
  const predeclaredOutputs = await collectOutputDeclarations(ctx.outputPlugins, writeCtx)
  const declarationCount = [...predeclaredOutputs.values()].reduce((total, declarations) => total + declarations.length, 0)
  ctx.logger.debug('Prepared output plan', {
    adaptors: predeclaredOutputs.size,
    declarations: declarationCount
  })

  const cleanupResult = await performCleanup(
    ctx.outputPlugins,
    createCleanContext(ctx, false),
    ctx.logger,
    predeclaredOutputs
  )

  if (cleanupResult.violations.length > 0 || cleanupResult.conflicts.length > 0) {
    return buildCommandResult({
      success: false,
      filesAffected: 0,
      dirsAffected: 0,
      ...cleanupResult.message != null ? {message: cleanupResult.message} : {}
    })
  }

  if (cleanupResult.deletedFiles > 0 || cleanupResult.deletedDirs > 0) {
    ctx.logger.info('Removed stale outputs', {
      files: cleanupResult.deletedFiles,
      directories: cleanupResult.deletedDirs
    })
  }

  const writeResults = await executeDeclarativeWriteOutputs(
    ctx.outputPlugins,
    writeCtx,
    predeclaredOutputs
  )

  let totalFiles = 0
  let totalDirs = 0
  const writeErrors: string[] = []
  for (const result of writeResults.values()) {
    totalFiles += result.files.length
    totalDirs += result.dirs.length
    for (const fileResult of result.files) {
      if (!fileResult.success) writeErrors.push(fileResult.error?.message ?? `Failed to write ${fileResult.path}`)
    }
  }

  if (totalFiles > 0 || totalDirs > 0) {
    ctx.logger.info('Wrote outputs', {
      files: totalFiles,
      directories: totalDirs
    })
  }

  if (writeErrors.length > 0) {
    return buildCommandResult({
      success: false,
      filesAffected: totalFiles,
      dirsAffected: totalDirs,
      message: writeErrors.join('\n')
    })
  }

  const wslMirrorResult = await syncWindowsConfigIntoWsl(
    ctx.outputPlugins,
    writeCtx,
    void 0,
    predeclaredOutputs
  )
  if (wslMirrorResult.errors.length > 0) {
    return buildCommandResult({
      success: false,
      filesAffected: totalFiles,
      dirsAffected: totalDirs,
      message: wslMirrorResult.errors.join('\n')
    })
  }

  totalFiles += wslMirrorResult.mirroredFiles
  if (wslMirrorResult.mirroredFiles > 0 || wslMirrorResult.warnings.length > 0) {
    ctx.logger.info('Synced WSL mirrors', {
      files: wslMirrorResult.mirroredFiles,
      warnings: wslMirrorResult.warnings.length
    })
  }

  logInstallCompletion(ctx.logger, {
    deletedFiles: cleanupResult.deletedFiles,
    deletedDirs: cleanupResult.deletedDirs,
    writtenFiles: totalFiles,
    writtenDirs: totalDirs
  })

  return buildCommandResult({
    success: true,
    filesAffected: totalFiles,
    dirsAffected: totalDirs
  })
}

async function runDryRun(options: MemorySyncCommandOptions = {}): Promise<MemorySyncCommandResult> {
  clearBufferedDiagnostics()
  const ctx = await createRuntimeExecutionContext('dry-run', options)
  const preflightResult = runExecutionPreflight(ctx, 'dry-run')
  if (preflightResult != null) return preflightResult

  const writeCtx = createWriteContext(ctx, true)
  const predeclaredOutputs = await collectOutputDeclarations(ctx.outputPlugins, writeCtx)
  const results = await executeDeclarativeWriteOutputs(ctx.outputPlugins, writeCtx, predeclaredOutputs)

  let totalFiles = 0
  let totalDirs = 0
  for (const result of results.values()) {
    totalFiles += result.files.length
    totalDirs += result.dirs.length
  }

  const wslMirrorResult = await syncWindowsConfigIntoWsl(
    ctx.outputPlugins,
    writeCtx,
    void 0,
    predeclaredOutputs
  )
  if (wslMirrorResult.errors.length > 0) {
    return buildCommandResult({
      success: false,
      filesAffected: totalFiles,
      dirsAffected: totalDirs,
      message: wslMirrorResult.errors.join('\n')
    })
  }

  totalFiles += wslMirrorResult.mirroredFiles
  if (wslMirrorResult.mirroredFiles > 0 || wslMirrorResult.warnings.length > 0) {
    ctx.logger.info('Prepared WSL mirror preview', {
      files: wslMirrorResult.mirroredFiles,
      warnings: wslMirrorResult.warnings.length
    })
  }

  logDryRunCompletion(ctx.logger, totalFiles, totalDirs)

  return buildCommandResult({
    success: true,
    filesAffected: totalFiles,
    dirsAffected: totalDirs,
    message: 'Dry-run complete, no files were written'
  })
}

async function runClean(
  options: MemorySyncCommandOptions & {readonly dryRun?: boolean} = {}
): Promise<MemorySyncCommandResult> {
  clearBufferedDiagnostics()
  const commandName = options.dryRun === true ? 'dry-run-clean' : 'clean'
  const ctx = await createRuntimeExecutionContext('clean', options)
  const preflightResult = runExecutionPreflight(ctx, commandName)
  if (preflightResult != null) return preflightResult

  if (options.dryRun === true) {
    const cleanCtx = createCleanContext(ctx, true)
    const {
      filesToDelete,
      dirsToDelete,
      emptyDirsToDelete,
      violations,
      excludedScanGlobs
    } = await collectDeletionTargets(ctx.outputPlugins, cleanCtx)
    const totalDirsToDelete = [...dirsToDelete, ...emptyDirsToDelete]

    if (violations.length > 0) {
      logProtectedDeletionGuardError(ctx.logger, 'dry-run-cleanup', violations)
      return buildCommandResult({
        success: false,
        filesAffected: 0,
        dirsAffected: 0,
        message: `Protected deletion guard blocked cleanup for ${violations.length} path(s)`
      })
    }

    ctx.logger.debug('Cleanup preview prepared', {
      files: filesToDelete.length,
      directories: totalDirsToDelete.length,
      excludedGlobs: excludedScanGlobs.length
    })
    logDryRunCompletion(ctx.logger, filesToDelete.length, totalDirsToDelete.length)

    return buildCommandResult({
      success: true,
      filesAffected: filesToDelete.length,
      dirsAffected: totalDirsToDelete.length,
      message: 'Dry-run complete, no files were deleted'
    })
  }

  const result = await performCleanup(
    ctx.outputPlugins,
    createCleanContext(ctx, false),
    ctx.logger
  )
  if (result.violations.length > 0 || result.conflicts.length > 0) {
    return buildCommandResult({
      success: false,
      filesAffected: 0,
      dirsAffected: 0,
      ...result.message != null ? {message: result.message} : {}
    })
  }

  logCleanCompletion(ctx.logger, result.deletedFiles, result.deletedDirs)

  return buildCommandResult({
    success: true,
    filesAffected: result.deletedFiles,
    dirsAffected: result.deletedDirs
  })
}

async function loadConfig(cwd?: string): Promise<MergedConfigResult> {
  return getConfigLoader().load(cwd)
}

async function listAdaptors(): Promise<readonly MemorySyncAdaptorInfo[]> {
  return describeDefaultOutputAdaptors()
}

async function getPromptOrThrow(
  promptId: string,
  options?: MemorySyncPromptServiceOptions
): Promise<PromptDetails> {
  const result = await getPrompt(promptId, options)
  if (result == null) throw new Error(`Prompt not found: ${promptId}`)
  return result
}

export function createTsFallbackMemorySyncBinding(): MemorySyncSdkBinding {
  return {
    loadConfig,
    install: runInstall,
    dryRun: runDryRun,
    clean: runClean,
    listAdaptors,
    listPrompts,
    getPrompt: getPromptOrThrow,
    upsertPromptSource,
    writePromptArtifacts
  }
}

export async function callWithUnhandledDiagnostic<T>(
  context: string,
  operation: () => Promise<T>
): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    const logger = createLogger(context, 'error')
    logger.error(buildUnhandledExceptionDiagnostic(context, error))
    throw error
  }
}
