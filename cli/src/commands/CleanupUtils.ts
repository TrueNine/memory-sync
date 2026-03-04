import type {ILogger, OutputCleanContext, OutputPlugin} from '../plugins/plugin-core'
import * as path from 'node:path'
import process from 'node:process'
import {deleteDirectories as deskDeleteDirectories, deleteFiles as deskDeleteFiles} from '../plugins/desk-paths'
import {
  collectAllPluginOutputs
} from '../plugins/plugin-core'

/**
 * Result of cleanup operation
 */
export interface CleanupResult {
  readonly deletedFiles: number
  readonly deletedDirs: number
  readonly errors: readonly CleanupError[]
}

/**
 * Error during cleanup operation
 */
export interface CleanupError {
  readonly path: string
  readonly type: 'file' | 'directory'
  readonly error: unknown
}

interface DirPathLike {
  readonly path: string
  readonly pathKind?: string
  readonly basePath?: string
  readonly getAbsolutePath?: () => string
}

function normalizeForComparison(p: string): string {
  const normalized = path.normalize(path.resolve(p))
  if (process.platform === 'win32') return normalized.toLowerCase()
  return normalized
}

function resolveAbsolutePathFromDir(dir: DirPathLike | undefined): string | undefined {
  if (dir == null) return void 0

  if (typeof dir.getAbsolutePath === 'function') {
    try {
      const absolute = dir.getAbsolutePath()
      if (absolute.length > 0) return path.resolve(absolute)
    }
    catch {}
  }

  if (dir.pathKind === 'absolute') return path.resolve(dir.path)
  if (typeof dir.basePath === 'string' && dir.basePath.length > 0) return path.resolve(dir.basePath, dir.path)
  return void 0
}

function collectInputSourcePaths(cleanCtx: OutputCleanContext): Set<string> {
  const collected = cleanCtx.collectedOutputContext
  const protectedPaths = new Set<string>()

  const addResolvedPath = (rawPath: string | undefined): void => {
    if (rawPath == null || rawPath.length === 0) return
    protectedPaths.add(normalizeForComparison(rawPath))
  }

  const addPathFromDir = (dir: DirPathLike | undefined): void => {
    const resolved = resolveAbsolutePathFromDir(dir)
    if (resolved == null) return
    addResolvedPath(resolved)
  }

  addPathFromDir(collected.globalMemory?.dir as DirPathLike | undefined)

  for (const command of collected.commands ?? []) addPathFromDir(command.dir as DirPathLike | undefined)
  for (const subAgent of collected.subAgents ?? []) addPathFromDir(subAgent.dir as DirPathLike | undefined)
  for (const rule of collected.rules ?? []) addPathFromDir(rule.dir as DirPathLike | undefined)

  for (const skill of collected.skills ?? []) {
    addPathFromDir(skill.dir as DirPathLike | undefined)
    for (const childDoc of skill.childDocs ?? []) addPathFromDir(childDoc.dir as DirPathLike | undefined)
    for (const resource of skill.resources ?? []) addResolvedPath(resource.sourcePath)
  }

  for (const config of collected.vscodeConfigFiles ?? []) addPathFromDir(config.dir as DirPathLike | undefined)
  for (const config of collected.jetbrainsConfigFiles ?? []) addPathFromDir(config.dir as DirPathLike | undefined)
  for (const config of collected.editorConfigFiles ?? []) addPathFromDir(config.dir as DirPathLike | undefined)

  for (const ignoreFile of collected.aiAgentIgnoreConfigFiles ?? []) addResolvedPath(ignoreFile.sourcePath)

  return protectedPaths
}

/**
 * Collect deletion targets from enabled output plugins
 */
export async function collectDeletionTargets(
  outputPlugins: readonly OutputPlugin[],
  cleanCtx: OutputCleanContext
): Promise<{filesToDelete: string[], dirsToDelete: string[], protectedFiles: string[]}> {
  const filesToDelete = new Map<string, string>()
  const dirsToDelete = new Set<string>()
  const protectedFiles = new Map<string, string>()
  const protectedInputPaths = collectInputSourcePaths(cleanCtx)

  for (const plugin of outputPlugins) {
    const declarations = await plugin.declareOutputFiles({...cleanCtx, dryRun: true})
    for (const declaration of declarations) {
      const normalizedDeclarationPath = normalizeForComparison(declaration.path)
      if (protectedInputPaths.has(normalizedDeclarationPath)) {
        protectedFiles.set(normalizedDeclarationPath, declaration.path)
        continue
      }
      filesToDelete.set(normalizedDeclarationPath, declaration.path)
    }
  }

  return {
    filesToDelete: [...filesToDelete.values()],
    dirsToDelete: [...dirsToDelete],
    protectedFiles: [...protectedFiles.values()]
  }
}

/**
 * Delete files with error handling
 * Logs warnings for failed deletions and continues with remaining files
 * Uses deletePathSync from @truenine/desk-paths for cross-platform safe deletion
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
 * Delete directories with error handling
 * Sorts by length descending to handle nested dirs properly
 * Logs warnings for failed deletions and continues with remaining directories
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

/**
 * Perform cleanup operation for output plugins
 * This is the main reusable cleanup function that can be called from both
 * CleanCommand and ExecuteCommand (for pre-cleanup)
 *
 * @param outputPlugins - Output plugins to clean
 * @param cleanCtx - Clean context
 * @param logger - Logger instance
 * @returns Cleanup result with counts and errors
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

  const {filesToDelete, dirsToDelete, protectedFiles} = await collectDeletionTargets( // Collect deletion targets
    outputPlugins,
    cleanCtx
  )
  if (protectedFiles.length > 0) {
    logger.info('skipped protected input files during cleanup', {count: protectedFiles.length})
    for (const protectedFile of protectedFiles) logger.debug('protected file', {path: protectedFile})
  }

  const fileResult = deleteFiles(filesToDelete, logger) // Perform deletions
  const dirResult = deleteDirectories(dirsToDelete, logger)

  return {
    deletedFiles: fileResult.deleted,
    deletedDirs: dirResult.deleted,
    errors: [...fileResult.errors, ...dirResult.errors]
  }
}
