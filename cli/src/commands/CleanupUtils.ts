import type {ILogger, OutputCleanContext, OutputCleanupDeclarations, OutputCleanupPathDeclaration, OutputPlugin} from '../plugins/plugin-core'
import type {ProtectedPathRule, ProtectionMode, ProtectionRuleMatcher} from '../ProtectedDeletionGuard'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {
  buildDiagnostic,
  buildFileOperationDiagnostic,
  diagnosticLines
} from '@/diagnostics'
import {deleteDirectories as deskDeleteDirectories, deleteFiles as deskDeleteFiles} from '../plugins/desk-paths'
import {
  collectAllPluginOutputs
} from '../plugins/plugin-core'
import {
  buildComparisonKeys,
  collectProjectRoots,
  collectProtectedInputSourceRules,
  createProtectedDeletionGuard,
  logProtectedDeletionGuardError,
  partitionDeletionTargets,
  resolveAbsolutePath
} from '../ProtectedDeletionGuard'

/**
 * Result of cleanup operation
 */
export interface CleanupResult {
  readonly deletedFiles: number
  readonly deletedDirs: number
  readonly errors: readonly CleanupError[]
  readonly violations: readonly import('../ProtectedDeletionGuard').ProtectedPathViolation[]
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
  readonly violations: readonly import('../ProtectedDeletionGuard').ProtectedPathViolation[]
  readonly conflicts: readonly CleanupProtectionConflict[]
  readonly excludedScanGlobs: string[]
}

const DEFAULT_CLEANUP_SCAN_EXCLUDE_GLOBS = [
  '**/node_modules/**',
  '**/.git/**',
  '**/.turbo/**',
  '**/.pnpm-store/**',
  '**/.yarn/**',
  '**/.next/**'
] as const

function normalizeGlobPattern(pattern: string): string {
  return resolveAbsolutePath(pattern).replaceAll('\\', '/')
}

function stripTrailingSeparator(rawPath: string): string {
  const {root} = path.parse(rawPath)
  if (rawPath === root) return rawPath
  return rawPath.endsWith(path.sep) ? rawPath.slice(0, -1) : rawPath
}

function isSameOrChildPath(candidate: string, parent: string): boolean {
  const normalizedCandidate = stripTrailingSeparator(candidate)
  const normalizedParent = stripTrailingSeparator(parent)
  if (normalizedCandidate === normalizedParent) return true
  return normalizedCandidate.startsWith(`${normalizedParent}${path.sep}`)
}

function expandCleanupGlob(
  pattern: string,
  cleanCtx: OutputCleanContext,
  ignoreGlobs: readonly string[]
): readonly string[] {
  const normalizedPattern = normalizeGlobPattern(pattern)
  return cleanCtx.glob.sync(normalizedPattern, {
    onlyFiles: false,
    dot: true,
    absolute: true,
    followSymbolicLinks: false,
    ignore: [...ignoreGlobs]
  })
}

async function collectPluginCleanupDeclarations(
  plugin: OutputPlugin,
  cleanCtx: OutputCleanContext
): Promise<OutputCleanupDeclarations> {
  if (plugin.declareCleanupPaths == null) return {}
  return plugin.declareCleanupPaths({...cleanCtx, dryRun: true})
}

function compactDeletionTargets(
  filesByKey: Map<string, string>,
  dirsByKey: Map<string, string>
): {files: string[], dirs: string[]} {
  const compactedDirs = new Map<string, string>()
  const sortedDirEntries = [...dirsByKey.entries()].sort((a, b) => a[0].length - b[0].length)

  for (const [dirKey, dirPath] of sortedDirEntries) {
    let coveredByParent = false
    for (const existingParentKey of compactedDirs.keys()) {
      if (isSameOrChildPath(dirKey, existingParentKey)) {
        coveredByParent = true
        break
      }
    }
    if (!coveredByParent) compactedDirs.set(dirKey, dirPath)
  }

  const compactedFiles: string[] = []
  for (const [fileKey, filePath] of filesByKey) {
    let coveredByDir = false
    for (const dirKey of compactedDirs.keys()) {
      if (isSameOrChildPath(fileKey, dirKey)) {
        coveredByDir = true
        break
      }
    }
    if (!coveredByDir) compactedFiles.push(filePath)
  }

  compactedFiles.sort((a, b) => a.localeCompare(b))
  const compactedDirPaths = [...compactedDirs.values()].sort((a, b) => a.localeCompare(b))
  return {files: compactedFiles, dirs: compactedDirPaths}
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

function logCleanupProtectionConflicts(
  logger: ILogger,
  conflicts: readonly CleanupProtectionConflict[]
): void {
  const firstConflict = conflicts[0]

  logger.error(buildDiagnostic({
    code: 'CLEANUP_PROTECTION_CONFLICT_DETECTED',
    title: 'Cleanup output paths conflict with protected inputs',
    rootCause: diagnosticLines(
      `tnmsc found ${conflicts.length} output path(s) that also match protected cleanup rules.`,
      firstConflict == null
        ? 'No conflict details were captured.'
        : `Example conflict: "${firstConflict.outputPath}" is protected by "${firstConflict.protectedPath}".`
    ),
    exactFix: diagnosticLines(
      'Separate generated output paths from protected source or reserved workspace paths before running cleanup again.'
    ),
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
  }))
}

/**
 * Collect deletion targets from enabled output plugins.
 */
export async function collectDeletionTargets(
  outputPlugins: readonly OutputPlugin[],
  cleanCtx: OutputCleanContext
): Promise<{
  filesToDelete: string[]
  dirsToDelete: string[]
  violations: import('../ProtectedDeletionGuard').ProtectedPathViolation[]
  conflicts: CleanupProtectionConflict[]
  excludedScanGlobs: string[]
}> {
  const deleteFiles = new Set<string>()
  const deleteDirs = new Set<string>()
  const protectedRules = new Map<string, ProtectedPathRule>()
  const excludeScanGlobSet = new Set<string>(DEFAULT_CLEANUP_SCAN_EXCLUDE_GLOBS)
  const outputPathOwners = new Map<string, string[]>()

  const pluginSnapshots: {
    readonly plugin: OutputPlugin
    readonly cleanup: OutputCleanupDeclarations
  }[] = []

  const addDeletePath = (rawPath: string, kind: 'file' | 'directory'): void => {
    if (kind === 'directory') deleteDirs.add(resolveAbsolutePath(rawPath))
    else deleteFiles.add(resolveAbsolutePath(rawPath))
  }

  const addProtectRule = (
    rawPath: string,
    protectionMode: ProtectionMode,
    reason: string,
    source: string,
    matcher: ProtectionRuleMatcher = 'path'
  ): void => {
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

  for (const rule of collectProtectedInputSourceRules(cleanCtx.collectedOutputContext)) addProtectRule(rule.path, rule.protectionMode, rule.reason, rule.source)

  for (const rule of cleanCtx.pluginOptions?.cleanupProtection?.rules ?? []) {
    addProtectRule(
      rule.path,
      rule.protectionMode,
      rule.reason ?? 'configured cleanup protection rule',
      'configured-cleanup-protection',
      rule.matcher ?? 'path'
    )
  }

  for (const plugin of outputPlugins) {
    const declarations = await plugin.declareOutputFiles({...cleanCtx, dryRun: true})
    for (const declaration of declarations) {
      const resolvedOutputPath = resolveAbsolutePath(declaration.path)
      addDeletePath(resolvedOutputPath, 'file')
      const existingOwners = outputPathOwners.get(resolvedOutputPath)
      if (existingOwners == null) outputPathOwners.set(resolvedOutputPath, [plugin.name])
      else if (!existingOwners.includes(plugin.name)) existingOwners.push(plugin.name)
    }

    const cleanupDeclarations = await collectPluginCleanupDeclarations(plugin, cleanCtx)
    for (const ignoreGlob of cleanupDeclarations.excludeScanGlobs ?? []) excludeScanGlobSet.add(normalizeGlobPattern(ignoreGlob))
    pluginSnapshots.push({plugin, cleanup: cleanupDeclarations})
  }

  const excludeScanGlobs = [...excludeScanGlobSet]

  const resolveDeleteGlob = (target: OutputCleanupPathDeclaration): void => {
    for (const matchedPath of expandCleanupGlob(target.path, cleanCtx, excludeScanGlobs)) {
      try {
        const stat = fs.lstatSync(matchedPath)
        if (stat.isDirectory()) addDeletePath(matchedPath, 'directory')
        else addDeletePath(matchedPath, 'file')
      }
      catch {}
    }
  }

  const resolveProtectGlob = (target: OutputCleanupPathDeclaration, pluginName: string): void => {
    const protectionMode = defaultProtectionModeForTarget(target)
    const reason = target.label != null
      ? `plugin cleanup protect declaration (${target.label})`
      : 'plugin cleanup protect declaration'

    for (const matchedPath of expandCleanupGlob(target.path, cleanCtx, excludeScanGlobs)) {
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
    ...cleanCtx.collectedOutputContext.aindexDir != null
      ? {aindexDir: cleanCtx.collectedOutputContext.aindexDir}
      : {}
  })
  const conflicts = detectCleanupProtectionConflicts(outputPathOwners, guard)
  if (conflicts.length > 0) throw new CleanupProtectionConflictError(conflicts)
  const filePartition = partitionDeletionTargets([...deleteFiles], guard)
  const dirPartition = partitionDeletionTargets([...deleteDirs], guard)

  const compactedTargets = compactDeletionTargets(
    new Map(filePartition.safePaths.map(filePath => [filePath, filePath])),
    new Map(dirPartition.safePaths.map(dirPath => [dirPath, dirPath]))
  )

  return {
    filesToDelete: compactedTargets.files,
    dirsToDelete: compactedTargets.dirs,
    violations: [...filePartition.violations, ...dirPartition.violations].sort((a, b) => a.targetPath.localeCompare(b.targetPath)),
    conflicts: [],
    excludedScanGlobs: [...excludeScanGlobSet].sort((a, b) => a.localeCompare(b))
  }
}

/**
 * Delete files with error handling.
 * Logs warnings for failed deletions and continues with remaining files.
 * Uses deletePathSync from @truenine/desk-paths for cross-platform safe deletion.
 */
export function deleteFiles(files: string[], logger: ILogger): {deleted: number, errors: CleanupError[]} {
  const resolved = files.map(f => path.isAbsolute(f) ? f : path.resolve(f))
  const result = deskDeleteFiles(resolved)

  for (const f of resolved) {
    if (!result.errors.some(e => e.path === f)) logger.debug({action: 'delete', type: 'file', path: f})
  }
  const errors: CleanupError[] = result.errors.map(e => {
    const errorMessage = e.error instanceof Error ? e.error.message : String(e.error)
    logger.warn(buildFileOperationDiagnostic({
      code: 'CLEANUP_FILE_DELETE_FAILED',
      title: 'Cleanup could not delete a file',
      operation: 'delete',
      targetKind: 'file',
      path: e.path,
      error: errorMessage,
      details: {
        phase: 'cleanup'
      }
    }))
    return {path: e.path, type: 'file' as const, error: e.error}
  })

  return {deleted: result.deleted, errors}
}

/**
 * Delete directories with error handling.
 * Sorts by length descending to handle nested dirs properly.
 * Logs warnings for failed deletions and continues with remaining directories.
 */
export function deleteDirectories(dirs: string[], logger: ILogger): {deleted: number, errors: CleanupError[]} {
  const resolved = dirs.map(d => path.isAbsolute(d) ? d : path.resolve(d))
  const result = deskDeleteDirectories(resolved)

  for (const d of resolved) {
    if (!result.errors.some(e => e.path === d)) logger.debug({action: 'delete', type: 'directory', path: d})
  }
  const errors: CleanupError[] = result.errors.map(e => {
    const errorMessage = e.error instanceof Error ? e.error.message : String(e.error)
    logger.warn(buildFileOperationDiagnostic({
      code: 'CLEANUP_DIRECTORY_DELETE_FAILED',
      title: 'Cleanup could not delete a directory',
      operation: 'delete',
      targetKind: 'directory',
      path: e.path,
      error: errorMessage,
      details: {
        phase: 'cleanup'
      }
    }))
    return {path: e.path, type: 'directory' as const, error: e.error}
  })

  return {deleted: result.deleted, errors}
}

function logCleanupPlanDiagnostics(
  logger: ILogger,
  targets: CleanupTargetCollections
): void {
  logger.debug('cleanup plan built', {
    filesToDelete: targets.filesToDelete.length,
    dirsToDelete: targets.dirsToDelete.length,
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
  logger: ILogger
): Promise<CleanupResult> {
  const outputs = await collectAllPluginOutputs(outputPlugins, cleanCtx) // Collect outputs for logging
  logger.debug('Collected outputs for cleanup', {
    projectDirs: outputs.projectDirs.length,
    projectFiles: outputs.projectFiles.length,
    workspaceDirs: outputs.workspaceDirs.length,
    workspaceFiles: outputs.workspaceFiles.length,
    globalDirs: outputs.globalDirs.length,
    globalFiles: outputs.globalFiles.length
  })

  let targets: Awaited<ReturnType<typeof collectDeletionTargets>>
  try {
    targets = await collectDeletionTargets(outputPlugins, cleanCtx)
  }
  catch (error) {
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

  const fileResult = deleteFiles(cleanupTargets.filesToDelete, logger)
  const dirResult = deleteDirectories(cleanupTargets.dirsToDelete, logger)

  return {
    deletedFiles: fileResult.deleted,
    deletedDirs: dirResult.deleted,
    errors: [...fileResult.errors, ...dirResult.errors],
    violations: [],
    conflicts: []
  }
}
