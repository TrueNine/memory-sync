import type {
  ILogger,
  OutputCleanContext,
  OutputCleanupDeclarations,
  OutputCleanupPathDeclaration,
  OutputFileDeclaration,
  OutputPlugin,
  PluginOptions
} from '../../src/plugins/plugin-core'
import type {ProtectedPathRule, ProtectionMode, ProtectionRuleMatcher} from '../../src/ProtectedDeletionGuard'
import type {DeletionError} from './desk-paths'
import * as fs from 'node:fs'
import * as path from 'node:path'
import glob from 'fast-glob'
import {compactDeletionTargets} from '../../src/cleanup/delete-targets'
import {planWorkspaceEmptyDirectoryCleanup} from '../../src/cleanup/empty-directories'
import {buildDiagnostic, buildFileOperationDiagnostic, diagnosticLines} from '../../src/diagnostics'
import {collectAllPluginOutputs} from '../../src/plugins/plugin-core'
import {
  buildComparisonKeys,
  collectConfiguredAindexInputRules,
  collectProjectRoots,
  collectProtectedInputSourceRules,
  createProtectedDeletionGuard,
  logProtectedDeletionGuardError,
  partitionDeletionTargets,
  resolveAbsolutePath
} from '../../src/ProtectedDeletionGuard'
import {deleteEmptyDirectories, deleteTargets as deskDeleteTargets} from './desk-paths'

/**
 * Result of cleanup operation
 */
export interface CleanupResult {
  readonly deletedFiles: number
  readonly deletedDirs: number
  readonly errors: readonly CleanupError[]
  readonly violations: readonly import('../../src/ProtectedDeletionGuard').ProtectedPathViolation[]
  readonly conflicts: readonly CleanupProtectionConflict[]
  readonly message?: string
}

/**
 * Error during cleanup operation
 */
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

interface CleanupTargetCollections {
  readonly filesToDelete: string[]
  readonly dirsToDelete: string[]
  readonly emptyDirsToDelete: string[]
  readonly violations: readonly import('../../src/ProtectedDeletionGuard').ProtectedPathViolation[]
  readonly conflicts: readonly CleanupProtectionConflict[]
  readonly excludedScanGlobs: string[]
}

const DEFAULT_CLEANUP_SCAN_EXCLUDE_GLOBS = ['**/node_modules/**', '**/.git/**', '**/.turbo/**', '**/.pnpm-store/**', '**/.yarn/**', '**/.next/**'] as const

function normalizeGlobPattern(pattern: string): string {
  return resolveAbsolutePath(pattern).replaceAll('\\', '/')
}

function expandCleanupGlob(pattern: string, ignoreGlobs: readonly string[]): readonly string[] {
  const normalizedPattern = normalizeGlobPattern(pattern)
  return glob.sync(normalizedPattern, {
    onlyFiles: false,
    dot: true,
    absolute: true,
    followSymbolicLinks: false,
    ignore: [...ignoreGlobs]
  })
}

function shouldExcludeCleanupMatch(matchedPath: string, target: OutputCleanupPathDeclaration): boolean {
  if (target.excludeBasenames == null || target.excludeBasenames.length === 0) return false
  const basename = path.basename(matchedPath)
  return target.excludeBasenames.includes(basename)
}

async function collectPluginCleanupDeclarations(plugin: OutputPlugin, cleanCtx: OutputCleanContext): Promise<OutputCleanupDeclarations> {
  if (plugin.declareCleanupPaths == null) return {}
  return plugin.declareCleanupPaths({...cleanCtx, dryRun: true})
}

async function collectPluginCleanupSnapshot(
  plugin: OutputPlugin,
  cleanCtx: OutputCleanContext,
  predeclaredOutputs?: ReadonlyMap<OutputPlugin, readonly OutputFileDeclaration[]>
): Promise<{
  readonly plugin: OutputPlugin
  readonly outputs: Awaited<ReturnType<OutputPlugin['declareOutputFiles']>>
  readonly cleanup: OutputCleanupDeclarations
}> {
  const existingOutputDeclarations = predeclaredOutputs?.get(plugin)
  const [outputs, cleanup] = await Promise.all([
    existingOutputDeclarations != null ? Promise.resolve(existingOutputDeclarations) : plugin.declareOutputFiles({...cleanCtx, dryRun: true}),
    collectPluginCleanupDeclarations(plugin, cleanCtx)
  ])

  return {plugin, outputs, cleanup}
}

function buildCleanupProtectionConflictMessage(conflicts: readonly CleanupProtectionConflict[]): string {
  const pathList = conflicts.map(conflict => conflict.outputPath).join(', ')
  return `Cleanup protection conflict: ${conflicts.length} output path(s) are also protected: ${pathList}`
}

function detectCleanupProtectionConflicts(
  outputPathOwners: ReadonlyMap<string, readonly string[]>,
  guard: ReturnType<typeof createProtectedDeletionGuard>
): CleanupProtectionConflict[] {
  const conflicts: CleanupProtectionConflict[] = []

  for (const [outputPath, outputPlugins] of outputPathOwners.entries()) {
    const outputKeys = new Set(buildComparisonKeys(outputPath))

    for (const rule of guard.compiledRules) {
      const isExactMatch = rule.comparisonKeys.some(ruleKey => outputKeys.has(ruleKey))
      if (!isExactMatch) continue

      for (const outputPlugin of outputPlugins) {
        conflicts.push({
          outputPath,
          outputPlugin,
          protectedPath: rule.path,
          protectionMode: rule.protectionMode,
          protectedBy: rule.source,
          reason: rule.reason
        })
      }
    }
  }

  return conflicts.sort((a, b) => {
    const pathDiff = a.outputPath.localeCompare(b.outputPath)
    if (pathDiff !== 0) return pathDiff
    return a.protectedPath.localeCompare(b.protectedPath)
  })
}

function logCleanupProtectionConflicts(logger: ILogger, conflicts: readonly CleanupProtectionConflict[]): void {
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
        conflicts: conflicts.map(conflict => ({
          outputPath: conflict.outputPath,
          outputPlugin: conflict.outputPlugin,
          protectedPath: conflict.protectedPath,
          protectionMode: conflict.protectionMode,
          protectedBy: conflict.protectedBy,
          reason: conflict.reason
        }))
      }
    })
  )
}

/**
 * Collect deletion targets from enabled output plugins.
 */
async function collectCleanupTargets(
  outputPlugins: readonly OutputPlugin[],
  cleanCtx: OutputCleanContext,
  predeclaredOutputs?: ReadonlyMap<OutputPlugin, readonly OutputFileDeclaration[]>
): Promise<CleanupTargetCollections> {
  const deleteFiles = new Set<string>()
  const deleteDirs = new Set<string>()
  const protectedRules = new Map<string, ProtectedPathRule>()
  const excludeScanGlobSet = new Set<string>(DEFAULT_CLEANUP_SCAN_EXCLUDE_GLOBS)
  const outputPathOwners = new Map<string, string[]>()

  const pluginSnapshots = await Promise.all(outputPlugins.map(async plugin => collectPluginCleanupSnapshot(plugin, cleanCtx, predeclaredOutputs)))

  const addDeletePath = (rawPath: string, kind: 'file' | 'directory'): void => {
    if (kind === 'directory') deleteDirs.add(resolveAbsolutePath(rawPath))
    else deleteFiles.add(resolveAbsolutePath(rawPath))
  }

  const addProtectRule = (rawPath: string, protectionMode: ProtectionMode, reason: string, source: string, matcher: ProtectionRuleMatcher = 'path'): void => {
    const resolvedPath = resolveAbsolutePath(rawPath)
    protectedRules.set(`${matcher}:${protectionMode}:${resolvedPath}`, {
      path: resolvedPath,
      protectionMode,
      reason,
      source,
      matcher
    })
  }

  const defaultProtectionModeForTarget = (target: OutputCleanupPathDeclaration): ProtectionMode => {
    if (target.protectionMode != null) return target.protectionMode
    return target.kind === 'file' ? 'direct' : 'recursive'
  }

  for (const rule of collectProtectedInputSourceRules(cleanCtx.collectedOutputContext)) {
    addProtectRule(rule.path, rule.protectionMode, rule.reason, rule.source)
  }
  if (cleanCtx.collectedOutputContext.aindexDir != null && cleanCtx.pluginOptions != null) {
    for (const rule of collectConfiguredAindexInputRules(cleanCtx.pluginOptions as Required<PluginOptions>, cleanCtx.collectedOutputContext.aindexDir, {
      workspaceDir: cleanCtx.collectedOutputContext.workspace.directory.path
    })) {
      addProtectRule(rule.path, rule.protectionMode, rule.reason, rule.source, rule.matcher)
    }
  }

  for (const rule of cleanCtx.pluginOptions?.cleanupProtection?.rules ?? []) {
    addProtectRule(
      rule.path,
      rule.protectionMode,
      rule.reason ?? 'configured cleanup protection rule',
      'configured-cleanup-protection',
      rule.matcher ?? 'path'
    )
  }

  for (const snapshot of pluginSnapshots) {
    for (const declaration of snapshot.outputs) {
      const resolvedOutputPath = resolveAbsolutePath(declaration.path)
      addDeletePath(resolvedOutputPath, 'file')
      const existingOwners = outputPathOwners.get(resolvedOutputPath)
      if (existingOwners == null) outputPathOwners.set(resolvedOutputPath, [snapshot.plugin.name])
      else if (!existingOwners.includes(snapshot.plugin.name)) existingOwners.push(snapshot.plugin.name)
    }
    for (const ignoreGlob of snapshot.cleanup.excludeScanGlobs ?? []) excludeScanGlobSet.add(normalizeGlobPattern(ignoreGlob))
  }

  const excludeScanGlobs = [...excludeScanGlobSet]

  const resolveDeleteGlob = (target: OutputCleanupPathDeclaration): void => {
    for (const matchedPath of expandCleanupGlob(target.path, excludeScanGlobs)) {
      if (shouldExcludeCleanupMatch(matchedPath, target)) continue

      try {
        const stat = fs.lstatSync(matchedPath)
        if (stat.isDirectory()) addDeletePath(matchedPath, 'directory')
        else addDeletePath(matchedPath, 'file')
      } catch {}
    }
  }

  const resolveProtectGlob = (target: OutputCleanupPathDeclaration, pluginName: string): void => {
    const protectionMode = defaultProtectionModeForTarget(target)
    const reason = target.label != null ? `plugin cleanup protect declaration (${target.label})` : 'plugin cleanup protect declaration'

    for (const matchedPath of expandCleanupGlob(target.path, excludeScanGlobs)) {
      addProtectRule(matchedPath, protectionMode, reason, `plugin-cleanup-protect:${pluginName}`)
    }
  }

  for (const {plugin, cleanup} of pluginSnapshots) {
    for (const target of cleanup.protect ?? []) {
      if (target.kind === 'glob') {
        resolveProtectGlob(target, plugin.name)
        continue
      }
      addProtectRule(
        target.path,
        defaultProtectionModeForTarget(target),
        target.label != null ? `plugin cleanup protect declaration (${target.label})` : 'plugin cleanup protect declaration',
        `plugin-cleanup-protect:${plugin.name}`
      )
    }

    for (const target of cleanup.delete ?? []) {
      if (target.kind === 'glob') {
        resolveDeleteGlob(target)
        continue
      }
      if (target.kind === 'directory') addDeletePath(target.path, 'directory')
      else addDeletePath(target.path, 'file')
    }
  }

  const guard = createProtectedDeletionGuard({
    workspaceDir: cleanCtx.collectedOutputContext.workspace.directory.path,
    projectRoots: collectProjectRoots(cleanCtx.collectedOutputContext),
    rules: [...protectedRules.values()],
    ...cleanCtx.collectedOutputContext.aindexDir != null ? {aindexDir: cleanCtx.collectedOutputContext.aindexDir} : {}
  })
  const conflicts = detectCleanupProtectionConflicts(outputPathOwners, guard)
  if (conflicts.length > 0) throw new CleanupProtectionConflictError(conflicts)
  const filePartition = partitionDeletionTargets([...deleteFiles], guard)
  const dirPartition = partitionDeletionTargets([...deleteDirs], guard)

  const compactedTargets = compactDeletionTargets(filePartition.safePaths, dirPartition.safePaths)
  const emptyDirectoryPlan = planWorkspaceEmptyDirectoryCleanup({
    fs,
    path,
    workspaceDir: cleanCtx.collectedOutputContext.workspace.directory.path,
    filesToDelete: compactedTargets.files,
    dirsToDelete: compactedTargets.dirs
  })

  return {
    filesToDelete: compactedTargets.files,
    dirsToDelete: compactedTargets.dirs,
    emptyDirsToDelete: emptyDirectoryPlan.emptyDirsToDelete,
    violations: [...filePartition.violations, ...dirPartition.violations].sort((a, b) => a.targetPath.localeCompare(b.targetPath)),
    conflicts: [],
    excludedScanGlobs: [...excludeScanGlobSet].sort((a, b) => a.localeCompare(b))
  }
}

export async function collectDeletionTargets(
  outputPlugins: readonly OutputPlugin[],
  cleanCtx: OutputCleanContext,
  predeclaredOutputs?: ReadonlyMap<OutputPlugin, readonly OutputFileDeclaration[]>
): Promise<{
  filesToDelete: string[]
  dirsToDelete: string[]
  emptyDirsToDelete: string[]
  violations: import('../../src/ProtectedDeletionGuard').ProtectedPathViolation[]
  conflicts: CleanupProtectionConflict[]
  excludedScanGlobs: string[]
}> {
  const targets = await collectCleanupTargets(outputPlugins, cleanCtx, predeclaredOutputs)
  return {
    filesToDelete: targets.filesToDelete,
    dirsToDelete: targets.dirsToDelete.sort((a, b) => a.localeCompare(b)),
    emptyDirsToDelete: targets.emptyDirsToDelete.sort((a, b) => a.localeCompare(b)),
    violations: [...targets.violations],
    conflicts: [...targets.conflicts],
    excludedScanGlobs: [...targets.excludedScanGlobs]
  }
}

function buildCleanupErrors(logger: ILogger, errors: readonly DeletionError[], type: 'file' | 'directory'): CleanupError[] {
  return errors.map(currentError => {
    const errorMessage = currentError.error instanceof Error ? currentError.error.message : String(currentError.error)
    logger.warn(
      buildFileOperationDiagnostic({
        code: type === 'file' ? 'CLEANUP_FILE_DELETE_FAILED' : 'CLEANUP_DIRECTORY_DELETE_FAILED',
        title: type === 'file' ? 'Cleanup could not delete a file' : 'Cleanup could not delete a directory',
        operation: 'delete',
        targetKind: type,
        path: currentError.path,
        error: errorMessage,
        details: {
          phase: 'cleanup'
        }
      })
    )

    return {path: currentError.path, type, error: currentError.error}
  })
}

async function executeCleanupTargets(
  targets: CleanupTargetCollections,
  logger: ILogger
): Promise<{deletedFiles: number, deletedDirs: number, errors: CleanupError[]}> {
  logger.debug('cleanup delete execution started', {
    filesToDelete: targets.filesToDelete.length,
    dirsToDelete: targets.dirsToDelete.length + targets.emptyDirsToDelete.length,
    emptyDirsToDelete: targets.emptyDirsToDelete.length
  })

  const result = await deskDeleteTargets({
    files: targets.filesToDelete,
    dirs: targets.dirsToDelete
  })
  const emptyDirResult = await deleteEmptyDirectories(targets.emptyDirsToDelete)

  const fileErrors = buildCleanupErrors(logger, result.fileErrors, 'file')
  const dirErrors = buildCleanupErrors(logger, [...result.dirErrors, ...emptyDirResult.errors], 'directory')
  const allErrors = [...fileErrors, ...dirErrors]

  logger.debug('cleanup delete execution complete', {
    deletedFiles: result.deletedFiles.length,
    deletedDirs: result.deletedDirs.length + emptyDirResult.deletedPaths.length,
    errors: allErrors.length
  })

  return {
    deletedFiles: result.deletedFiles.length,
    deletedDirs: result.deletedDirs.length + emptyDirResult.deletedPaths.length,
    errors: allErrors
  }
}

function logCleanupPlanDiagnostics(logger: ILogger, targets: CleanupTargetCollections): void {
  logger.debug('cleanup plan built', {
    filesToDelete: targets.filesToDelete.length,
    dirsToDelete: targets.dirsToDelete.length + targets.emptyDirsToDelete.length,
    emptyDirsToDelete: targets.emptyDirsToDelete.length,
    violations: targets.violations.length,
    conflicts: targets.conflicts.length,
    excludedScanGlobs: targets.excludedScanGlobs
  })
}

/**
 * Perform cleanup operation for output plugins.
 * This is the main reusable cleanup function that can be called from both
 * CleanCommand and ExecuteCommand (for pre-cleanup).
 */
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

  let targets: CleanupTargetCollections
  try {
    targets = await collectCleanupTargets(outputPlugins, cleanCtx, predeclaredOutputs)
  } catch (error) {
    if (error instanceof CleanupProtectionConflictError) {
      logCleanupProtectionConflicts(logger, error.conflicts)
      return {
        deletedFiles: 0,
        deletedDirs: 0,
        errors: [],
        violations: [],
        conflicts: error.conflicts,
        message: error.message
      }
    }
    throw error
  }
  const cleanupTargets: CleanupTargetCollections = {
    filesToDelete: targets.filesToDelete,
    dirsToDelete: targets.dirsToDelete,
    emptyDirsToDelete: targets.emptyDirsToDelete,
    violations: targets.violations,
    conflicts: targets.conflicts,
    excludedScanGlobs: targets.excludedScanGlobs
  }
  logCleanupPlanDiagnostics(logger, cleanupTargets)

  if (cleanupTargets.violations.length > 0) {
    logProtectedDeletionGuardError(logger, 'cleanup', cleanupTargets.violations)
    return {
      deletedFiles: 0,
      deletedDirs: 0,
      errors: [],
      violations: cleanupTargets.violations,
      conflicts: [],
      message: `Protected deletion guard blocked cleanup for ${cleanupTargets.violations.length} path(s)`
    }
  }

  const executionResult = await executeCleanupTargets(cleanupTargets, logger)

  return {
    deletedFiles: executionResult.deletedFiles,
    deletedDirs: executionResult.deletedDirs,
    errors: executionResult.errors,
    violations: [],
    conflicts: []
  }
}
