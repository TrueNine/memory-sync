import type {ILogger, OutputCleanContext, OutputCleanupDeclarations, OutputCleanupPathDeclaration, OutputPlugin} from '../plugins/plugin-core'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {deleteDirectories as deskDeleteDirectories, deleteFiles as deskDeleteFiles} from '../plugins/desk-paths'
import {
  collectAllPluginOutputs
} from '../plugins/plugin-core'
import {
  collectProjectRoots,
  collectProtectedInputSourcePaths,
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

interface CleanupTargetCollections {
  readonly filesToDelete: string[]
  readonly dirsToDelete: string[]
  readonly violations: readonly import('../ProtectedDeletionGuard').ProtectedPathViolation[]
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
  excludedScanGlobs: string[]
}> {
  const deleteFiles = new Set<string>()
  const deleteDirs = new Set<string>()
  const subtreeProtectedPaths = new Set<string>(collectProtectedInputSourcePaths(cleanCtx.collectedOutputContext))
  const excludeScanGlobSet = new Set<string>(DEFAULT_CLEANUP_SCAN_EXCLUDE_GLOBS)

  const pluginSnapshots: {
    readonly plugin: OutputPlugin
    readonly cleanup: OutputCleanupDeclarations
  }[] = []

  const addDeletePath = (rawPath: string, kind: 'file' | 'directory'): void => {
    if (kind === 'directory') deleteDirs.add(resolveAbsolutePath(rawPath))
    else deleteFiles.add(resolveAbsolutePath(rawPath))
  }

  const addProtectPath = (rawPath: string): void => {
    subtreeProtectedPaths.add(resolveAbsolutePath(rawPath))
  }

  for (const plugin of outputPlugins) {
    const declarations = await plugin.declareOutputFiles({...cleanCtx, dryRun: true})
    for (const declaration of declarations) addDeletePath(declaration.path, 'file')

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

  const resolveProtectGlob = (target: OutputCleanupPathDeclaration): void => {
    for (const matchedPath of expandCleanupGlob(target.path, cleanCtx, excludeScanGlobs)) addProtectPath(matchedPath)
  }

  for (const {cleanup} of pluginSnapshots) {
    for (const target of cleanup.protect ?? []) {
      if (target.kind === 'glob') {
        resolveProtectGlob(target)
        continue
      }
      addProtectPath(target.path)
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
    subtreeProtectedPaths: [...subtreeProtectedPaths],
    ...cleanCtx.collectedOutputContext.aindexDir != null
      ? {aindexDir: cleanCtx.collectedOutputContext.aindexDir}
      : {}
  })
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
    logger.warn('failed to delete file', {path: e.path, error: errorMessage})
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
    logger.warn('failed to delete directory', {path: e.path, error: errorMessage})
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

  const targets = await collectDeletionTargets(outputPlugins, cleanCtx)
  const cleanupTargets: CleanupTargetCollections = {
    filesToDelete: targets.filesToDelete,
    dirsToDelete: targets.dirsToDelete,
    violations: targets.violations,
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
      message: `Protected deletion guard blocked cleanup for ${cleanupTargets.violations.length} path(s)`
    }
  }

  const fileResult = deleteFiles(cleanupTargets.filesToDelete, logger)
  const dirResult = deleteDirectories(cleanupTargets.dirsToDelete, logger)

  return {
    deletedFiles: fileResult.deleted,
    deletedDirs: dirResult.deleted,
    errors: [...fileResult.errors, ...dirResult.errors],
    violations: []
  }
}
