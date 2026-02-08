import type { ILogger } from '@/log'
import type { OutputCleanContext, OutputPlugin } from '@/types'
import { checkCanClean, collectAllPluginOutputs, executeOnCleanComplete } from '@/types/PluginTypes'
import { deleteDirectories as deskDeleteDirectories, deleteFiles as deskDeleteFiles } from '@truenine/desk-paths'
import * as path from 'node:path'

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

/**
 * Options for cleanup operation
 */
export interface CleanupOptions {
  readonly executeHooks?: boolean
}

/**
 * Collect deletion targets from enabled output plugins
 */
export async function collectDeletionTargets(
  outputPlugins: readonly OutputPlugin[],
  permissions: Map<string, {project: boolean, global: boolean}>,
  cleanCtx: OutputCleanContext
): Promise<{filesToDelete: string[], dirsToDelete: string[]}> {
  const filesToDelete: string[] = []
  const dirsToDelete: string[] = []

  for (const plugin of outputPlugins) {
    const perm = permissions.get(plugin.name)
    if (perm?.project) {
      const projectFiles = await plugin.registerProjectOutputFiles?.(cleanCtx) ?? []
      const projectDirs = await plugin.registerProjectOutputDirs?.(cleanCtx) ?? []
      filesToDelete.push(...projectFiles.map(f => f.getAbsolutePath()))
      dirsToDelete.push(...projectDirs.map(d => d.getAbsolutePath()))
    }
    if (perm?.global) {
      const globalFiles = await plugin.registerGlobalOutputFiles?.(cleanCtx) ?? []
      const globalDirs = await plugin.registerGlobalOutputDirs?.(cleanCtx) ?? []
      filesToDelete.push(...globalFiles.map(f => f.getAbsolutePath()))
      dirsToDelete.push(...globalDirs.map(d => d.getAbsolutePath()))
    }
  }

  return {filesToDelete, dirsToDelete}
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
 * @param options - Cleanup options
 * @returns Cleanup result with counts and errors
 */
export async function performCleanup(
  outputPlugins: readonly OutputPlugin[],
  cleanCtx: OutputCleanContext,
  logger: ILogger,
  options?: CleanupOptions
): Promise<CleanupResult> {
  const {executeHooks = true} = options ?? {}

  const outputs = await collectAllPluginOutputs(outputPlugins, cleanCtx) // Collect outputs for logging
  logger.debug('Collected outputs for cleanup', {
    projectDirs: outputs.projectDirs.length,
    projectFiles: outputs.projectFiles.length,
    globalDirs: outputs.globalDirs.length,
    globalFiles: outputs.globalFiles.length
  })

  const permissions = await checkCanClean(outputPlugins, cleanCtx) // Check permissions

  const {filesToDelete, dirsToDelete} = await collectDeletionTargets( // Collect deletion targets
    outputPlugins,
    permissions,
    cleanCtx
  )

  const fileResult = deleteFiles(filesToDelete, logger) // Perform deletions
  const dirResult = deleteDirectories(dirsToDelete, logger)

  if (executeHooks) await executeOnCleanComplete(outputPlugins, cleanCtx) // Execute hooks if requested

  return {
    deletedFiles: fileResult.deleted,
    deletedDirs: dirResult.deleted,
    errors: [...fileResult.errors, ...dirResult.errors]
  }
}
