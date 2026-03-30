import type {
  ILogger,
  OutputCleanContext,
  OutputCleanupDeclarations,
  OutputCleanupPathDeclaration,
  OutputFileDeclaration,
  OutputPlugin,
  PluginOptions
} from '../plugins/plugin-core'
import type {ProtectionMode, ProtectionRuleMatcher} from '../ProtectedDeletionGuard'
import {buildDiagnostic, buildFileOperationDiagnostic, diagnosticLines} from '@/diagnostics'
import {getNativeBinding} from '../core/native-binding'
import {collectAllPluginOutputs} from '../plugins/plugin-core'
import {
  collectConfiguredAindexInputRules,
  collectProjectRoots,
  collectProtectedInputSourceRules,
  logProtectedDeletionGuardError
} from '../ProtectedDeletionGuard'

let nativeCleanupBindingCheck: boolean | null = null

export interface CleanupResult {
  readonly deletedFiles: number
  readonly deletedDirs: number
  readonly errors: readonly CleanupError[]
  readonly violations: readonly import('../ProtectedDeletionGuard').ProtectedPathViolation[]
  readonly conflicts: readonly CleanupProtectionConflict[]
  readonly message?: string
}

export interface CleanupError {
  readonly path: string
  readonly type: 'file' | 'directory'
  readonly error: unknown
}

export interface CleanupProtectionConflict {
  readonly outputPath: string
  readonly outputPlugin: string
  readonly protectedPath: string
  readonly protectionMode: ProtectionMode
  readonly protectedBy: string
  readonly reason: string
}

export class CleanupProtectionConflictError extends Error {
  readonly conflicts: readonly CleanupProtectionConflict[]

  constructor(conflicts: readonly CleanupProtectionConflict[]) {
    super(buildCleanupProtectionConflictMessage(conflicts))
    this.name = 'CleanupProtectionConflictError'
    this.conflicts = conflicts
  }
}

interface NativeCleanupBinding {
  readonly planCleanup?: (snapshotJson: string) => string | Promise<string>
  readonly performCleanup?: (snapshotJson: string) => string | Promise<string>
}

type NativeProtectionMode = 'direct' | 'recursive'
type NativeProtectionRuleMatcher = 'path' | 'glob'
type NativeCleanupTargetKind = 'file' | 'directory' | 'glob'
type NativeCleanupErrorKind = 'file' | 'directory'

interface NativeCleanupTarget {
  readonly path: string
  readonly kind: NativeCleanupTargetKind
  readonly excludeBasenames?: readonly string[]
  readonly protectionMode?: NativeProtectionMode
  readonly scope?: string
  readonly label?: string
}

interface NativeCleanupDeclarations {
  readonly delete?: readonly NativeCleanupTarget[]
  readonly protect?: readonly NativeCleanupTarget[]
  readonly excludeScanGlobs?: readonly string[]
}

interface NativePluginCleanupSnapshot {
  readonly pluginName: string
  readonly outputs: readonly string[]
  readonly cleanup: NativeCleanupDeclarations
}

interface NativeProtectedRule {
  readonly path: string
  readonly protectionMode: NativeProtectionMode
  readonly reason: string
  readonly source: string
  readonly matcher?: NativeProtectionRuleMatcher | undefined
}

interface NativeCleanupSnapshot {
  readonly workspaceDir: string
  readonly aindexDir?: string
  readonly projectRoots: readonly string[]
  readonly protectedRules: readonly NativeProtectedRule[]
  readonly pluginSnapshots: readonly NativePluginCleanupSnapshot[]
}

interface NativeProtectedPathViolation {
  readonly targetPath: string
  readonly protectedPath: string
  readonly protectionMode: NativeProtectionMode
  readonly reason: string
  readonly source: string
}

interface NativeCleanupProtectionConflict {
  readonly outputPath: string
  readonly outputPlugin: string
  readonly protectedPath: string
  readonly protectionMode: NativeProtectionMode
  readonly protectedBy: string
  readonly reason: string
}

interface NativeCleanupPlan {
  readonly filesToDelete: string[]
  readonly dirsToDelete: string[]
  readonly emptyDirsToDelete: string[]
  readonly violations: readonly NativeProtectedPathViolation[]
  readonly conflicts: readonly NativeCleanupProtectionConflict[]
  readonly excludedScanGlobs: string[]
}

interface NativeCleanupError {
  readonly path: string
  readonly kind: NativeCleanupErrorKind
  readonly error: string
}

interface NativeCleanupResult {
  readonly deletedFiles: number
  readonly deletedDirs: number
  readonly errors: readonly NativeCleanupError[]
  readonly violations: readonly NativeProtectedPathViolation[]
  readonly conflicts: readonly NativeCleanupProtectionConflict[]
  readonly filesToDelete: string[]
  readonly dirsToDelete: string[]
  readonly emptyDirsToDelete: string[]
  readonly excludedScanGlobs: string[]
}

export function hasNativeCleanupBinding(): boolean {
  if (nativeCleanupBindingCheck !== null) {
    return nativeCleanupBindingCheck
  }
  const nativeBinding = getNativeBinding<NativeCleanupBinding>()
  nativeCleanupBindingCheck = nativeBinding?.planCleanup != null && nativeBinding.performCleanup != null
  return nativeCleanupBindingCheck
}

function requireNativeCleanupBinding(): NativeCleanupBinding {
  const nativeBinding = getNativeBinding<NativeCleanupBinding>()
  if (nativeBinding == null) {
    throw new Error('Native cleanup binding is required. Build or install the Rust NAPI package before running tnmsc.')
  }
  return nativeBinding
}

function mapProtectionMode(mode: ProtectionMode): NativeProtectionMode {
  return mode
}

function mapProtectionRuleMatcher(matcher: ProtectionRuleMatcher | undefined): NativeProtectionRuleMatcher | undefined {
  return matcher
}

function mapCleanupTarget(target: OutputCleanupPathDeclaration): NativeCleanupTarget {
  return {
    path: target.path,
    kind: target.kind,
    ...target.excludeBasenames != null && target.excludeBasenames.length > 0 ? {excludeBasenames: [...target.excludeBasenames]} : {},
    ...target.protectionMode != null ? {protectionMode: mapProtectionMode(target.protectionMode)} : {},
    ...target.scope != null ? {scope: target.scope} : {},
    ...target.label != null ? {label: target.label} : {}
  }
}

async function collectPluginCleanupDeclarations(plugin: OutputPlugin, cleanCtx: OutputCleanContext): Promise<OutputCleanupDeclarations> {
  if (plugin.declareCleanupPaths == null) return {}
  return plugin.declareCleanupPaths({...cleanCtx, dryRun: true})
}

async function collectPluginCleanupSnapshot(
  plugin: OutputPlugin,
  cleanCtx: OutputCleanContext,
  predeclaredOutputs?: ReadonlyMap<OutputPlugin, readonly OutputFileDeclaration[]>
): Promise<NativePluginCleanupSnapshot> {
  const existingOutputDeclarations = predeclaredOutputs?.get(plugin)
  const [outputs, cleanup] = await Promise.all([
    existingOutputDeclarations != null ? Promise.resolve(existingOutputDeclarations) : plugin.declareOutputFiles({...cleanCtx, dryRun: true}),
    collectPluginCleanupDeclarations(plugin, cleanCtx)
  ])

  return {
    pluginName: plugin.name,
    outputs: outputs.map(output => output.path),
    cleanup: {
      ...cleanup.delete != null && cleanup.delete.length > 0 ? {delete: cleanup.delete.map(mapCleanupTarget)} : {},
      ...cleanup.protect != null && cleanup.protect.length > 0 ? {protect: cleanup.protect.map(mapCleanupTarget)} : {},
      ...cleanup.excludeScanGlobs != null && cleanup.excludeScanGlobs.length > 0 ? {excludeScanGlobs: [...cleanup.excludeScanGlobs]} : {}
    }
  }
}

function collectConfiguredCleanupProtectionRules(cleanCtx: OutputCleanContext): NativeProtectedRule[] {
  return (cleanCtx.pluginOptions?.cleanupProtection?.rules ?? []).map(rule => ({
    path: rule.path,
    protectionMode: mapProtectionMode(rule.protectionMode),
    reason: rule.reason ?? 'configured cleanup protection rule',
    source: 'configured-cleanup-protection',
    matcher: mapProtectionRuleMatcher(rule.matcher ?? 'path')
  }))
}

function buildCleanupProtectionConflictMessage(conflicts: readonly NativeCleanupProtectionConflict[]): string {
  const pathList = conflicts.map(conflict => conflict.outputPath).join(', ')
  return `Cleanup protection conflict: ${conflicts.length} output path(s) are also protected: ${pathList}`
}

function logCleanupProtectionConflicts(logger: ILogger, conflicts: readonly NativeCleanupProtectionConflict[]): void {
  const firstConflict = conflicts[0]

  logger.error(
    buildDiagnostic({
      code: 'CLEANUP_PROTECTION_CONFLICT_DETECTED',
      title: 'Cleanup output paths conflict with protected inputs',
      rootCause: diagnosticLines(
        `tnmsc found ${conflicts.length} output path(s) that also match protected cleanup rules.`,
        firstConflict == null
          ? 'No conflict details were captured.'
          : `Example conflict: "${firstConflict.outputPath}" is protected by "${firstConflict.protectedPath}".`
      ),
      exactFix: diagnosticLines('Separate generated output paths from protected source or reserved workspace paths before running cleanup again.'),
      possibleFixes: [
        diagnosticLines('Update cleanup protect declarations so they do not overlap generated outputs.'),
        diagnosticLines('Move the conflicting output target to a generated-only directory.')
      ],
      details: {
        count: conflicts.length,
        conflicts
      }
    })
  )
}

function logCleanupPlanDiagnostics(
  logger: ILogger,
  plan: Pick<
    NativeCleanupPlan | NativeCleanupResult,
    'filesToDelete' | 'dirsToDelete' | 'emptyDirsToDelete' | 'violations' | 'conflicts' | 'excludedScanGlobs'
  >
): void {
  logger.debug('cleanup plan built', {
    filesToDelete: plan.filesToDelete.length,
    dirsToDelete: plan.dirsToDelete.length + plan.emptyDirsToDelete.length,
    emptyDirsToDelete: plan.emptyDirsToDelete.length,
    violations: plan.violations.length,
    conflicts: plan.conflicts.length,
    excludedScanGlobs: plan.excludedScanGlobs
  })
}

function logNativeCleanupErrors(
  logger: ILogger,
  errors: readonly NativeCleanupError[]
): readonly {path: string, type: 'file' | 'directory', error: string}[] {
  return errors.map(currentError => {
    const type = currentError.kind === 'directory' ? 'directory' : 'file'
    logger.warn(
      buildFileOperationDiagnostic({
        code: type === 'file' ? 'CLEANUP_FILE_DELETE_FAILED' : 'CLEANUP_DIRECTORY_DELETE_FAILED',
        title: type === 'file' ? 'Cleanup could not delete a file' : 'Cleanup could not delete a directory',
        operation: 'delete',
        targetKind: type,
        path: currentError.path,
        error: currentError.error,
        details: {
          phase: 'cleanup'
        }
      })
    )

    return {path: currentError.path, type, error: currentError.error}
  })
}

async function buildCleanupSnapshot(
  outputPlugins: readonly OutputPlugin[],
  cleanCtx: OutputCleanContext,
  predeclaredOutputs?: ReadonlyMap<OutputPlugin, readonly OutputFileDeclaration[]>
): Promise<NativeCleanupSnapshot> {
  const pluginSnapshots = await Promise.all(outputPlugins.map(async plugin => collectPluginCleanupSnapshot(plugin, cleanCtx, predeclaredOutputs)))

  const protectedRules: NativeProtectedRule[] = []
  for (const rule of collectProtectedInputSourceRules(cleanCtx.collectedOutputContext)) {
    protectedRules.push({
      path: rule.path,
      protectionMode: mapProtectionMode(rule.protectionMode),
      reason: rule.reason,
      source: rule.source,
      ...rule.matcher != null ? {matcher: mapProtectionRuleMatcher(rule.matcher)} : {}
    })
  }

  if (cleanCtx.collectedOutputContext.aindexDir != null && cleanCtx.pluginOptions != null) {
    for (const rule of collectConfiguredAindexInputRules(cleanCtx.pluginOptions as Required<PluginOptions>, cleanCtx.collectedOutputContext.aindexDir, {
      workspaceDir: cleanCtx.collectedOutputContext.workspace.directory.path
    })) {
      protectedRules.push({
        path: rule.path,
        protectionMode: mapProtectionMode(rule.protectionMode),
        reason: rule.reason,
        source: rule.source,
        ...rule.matcher != null ? {matcher: mapProtectionRuleMatcher(rule.matcher)} : {}
      })
    }
  }

  protectedRules.push(...collectConfiguredCleanupProtectionRules(cleanCtx))

  return {
    workspaceDir: cleanCtx.collectedOutputContext.workspace.directory.path,
    ...cleanCtx.collectedOutputContext.aindexDir != null ? {aindexDir: cleanCtx.collectedOutputContext.aindexDir} : {},
    projectRoots: collectProjectRoots(cleanCtx.collectedOutputContext),
    protectedRules,
    pluginSnapshots
  }
}

function parseNativeJson<T>(json: string): T {
  return JSON.parse(json) as T
}

export async function planCleanupWithNative(snapshot: NativeCleanupSnapshot): Promise<NativeCleanupPlan> {
  const nativeBinding = requireNativeCleanupBinding()
  if (nativeBinding?.planCleanup == null) throw new Error('Native cleanup planning is unavailable')
  const result = await Promise.resolve(nativeBinding.planCleanup(JSON.stringify(snapshot)))
  return parseNativeJson<NativeCleanupPlan>(result)
}

export async function performCleanupWithNative(snapshot: NativeCleanupSnapshot): Promise<NativeCleanupResult> {
  const nativeBinding = requireNativeCleanupBinding()
  if (nativeBinding?.performCleanup == null) throw new Error('Native cleanup execution is unavailable')
  const result = await Promise.resolve(nativeBinding.performCleanup(JSON.stringify(snapshot)))
  return parseNativeJson<NativeCleanupResult>(result)
}

export async function collectDeletionTargets(
  outputPlugins: readonly OutputPlugin[],
  cleanCtx: OutputCleanContext,
  predeclaredOutputs?: ReadonlyMap<OutputPlugin, readonly OutputFileDeclaration[]>
): Promise<{
  filesToDelete: string[]
  dirsToDelete: string[]
  emptyDirsToDelete: string[]
  violations: import('../ProtectedDeletionGuard').ProtectedPathViolation[]
  conflicts: CleanupProtectionConflict[]
  excludedScanGlobs: string[]
}> {
  const snapshot = await buildCleanupSnapshot(outputPlugins, cleanCtx, predeclaredOutputs)
  const plan = await planCleanupWithNative(snapshot)

  if (plan.conflicts.length > 0) {
    throw new CleanupProtectionConflictError(plan.conflicts)
  }

  return {
    filesToDelete: plan.filesToDelete,
    dirsToDelete: plan.dirsToDelete.sort((a, b) => a.localeCompare(b)),
    emptyDirsToDelete: plan.emptyDirsToDelete.sort((a, b) => a.localeCompare(b)),
    violations: [...plan.violations],
    conflicts: [],
    excludedScanGlobs: plan.excludedScanGlobs
  }
}

export async function performCleanup(
  outputPlugins: readonly OutputPlugin[],
  cleanCtx: OutputCleanContext,
  logger: ILogger,
  predeclaredOutputs?: ReadonlyMap<OutputPlugin, readonly OutputFileDeclaration[]>
): Promise<CleanupResult> {
  if (predeclaredOutputs != null) {
    const outputs = await collectAllPluginOutputs(outputPlugins, cleanCtx, predeclaredOutputs)
    logger.debug('Collected outputs for cleanup', {
      projectDirs: outputs.projectDirs.length,
      projectFiles: outputs.projectFiles.length,
      globalDirs: outputs.globalDirs.length,
      globalFiles: outputs.globalFiles.length
    })
  }

  const snapshot = await buildCleanupSnapshot(outputPlugins, cleanCtx, predeclaredOutputs)
  const result = await performCleanupWithNative(snapshot)

  logCleanupPlanDiagnostics(logger, result)

  if (result.conflicts.length > 0) {
    logCleanupProtectionConflicts(logger, result.conflicts)
    return {
      deletedFiles: 0,
      deletedDirs: 0,
      errors: [],
      violations: [],
      conflicts: result.conflicts,
      message: buildCleanupProtectionConflictMessage(result.conflicts)
    }
  }

  if (result.violations.length > 0) {
    logProtectedDeletionGuardError(logger, 'cleanup', result.violations)
    return {
      deletedFiles: 0,
      deletedDirs: 0,
      errors: [],
      violations: result.violations,
      conflicts: [],
      message: `Protected deletion guard blocked cleanup for ${result.violations.length} path(s)`
    }
  }

  logger.debug('cleanup delete execution started', {
    filesToDelete: result.filesToDelete.length,
    dirsToDelete: result.dirsToDelete.length + result.emptyDirsToDelete.length,
    emptyDirsToDelete: result.emptyDirsToDelete.length
  })
  const loggedErrors = logNativeCleanupErrors(logger, result.errors)
  logger.debug('cleanup delete execution complete', {
    deletedFiles: result.deletedFiles,
    deletedDirs: result.deletedDirs,
    errors: loggedErrors.length
  })

  return {
    deletedFiles: result.deletedFiles,
    deletedDirs: result.deletedDirs,
    errors: loggedErrors,
    violations: [],
    conflicts: []
  }
}
