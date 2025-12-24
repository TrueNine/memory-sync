import type { Logger } from '@/log'
import type { OutputCleanContext, OutputPlugin } from '@/types'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { checkCanClean, collectAllPluginOutputs, executeOnCleanComplete } from '@/types/PluginTypes'

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
  /**
   * Whether to execute onCleanComplete hooks after cleanup
   * @default true
   */
  readonly executeHooks?: boolean
}

/**
 * Collect deletion targets from enabled output plugins
 */
export async function collectDeletionTargets(
  outputPlugins: readonly OutputPlugin[],
  permissions: Map<string, { project: boolean, global: boolean }>,
  cleanCtx: OutputCleanContext,
): Promise<{ filesToDelete: string[], dirsToDelete: string[] }> {
  const filesToDelete: string[] = []
  const dirsToDelete: string[] = []

  for (const plugin of outputPlugins) {
    const perm = permissions.get(plugin.name)
    if (perm?.project) {
      const projectFiles = await plugin.registerProjectOutputFiles?.(cleanCtx) ?? []
      const projectDirs = await plugin.registerProjectOutputDirs?.(cleanCtx) ?? []
      filesToDelete.push(...projectFiles.map((f) => f.getAbsolutePath()))
      dirsToDelete.push(...projectDirs.map((d) => d.getAbsolutePath()))
    }
    if (perm?.global) {
      const globalFiles = await plugin.registerGlobalOutputFiles?.(cleanCtx) ?? []
      const globalDirs = await plugin.registerGlobalOutputDirs?.(cleanCtx) ?? []
      filesToDelete.push(...globalFiles.map((f) => f.getAbsolutePath()))
      dirsToDelete.push(...globalDirs.map((d) => d.getAbsolutePath()))
    }
  }

  return { filesToDelete, dirsToDelete }
}

/**
 * Delete files with error handling
 * Logs warnings for failed deletions and continues with remaining files
 */
export function deleteFiles(files: string[], logger: Logger): { deleted: number, errors: CleanupError[] } {
  let deleted = 0
  const errors: CleanupError[] = []

  for (const file of files) {
    const resolved = path.isAbsolute(file) ? file : path.resolve(file)
    try {
      if (fs.existsSync(resolved)) {
        fs.unlinkSync(resolved)
        logger.debug({ action: 'delete', type: 'file', path: resolved })
        deleted++
      }
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e)
      logger.warn('failed to delete file', { path: resolved, error: errorMessage })
      errors.push({ path: resolved, type: 'file', error: e })
    }
  }

  return { deleted, errors }
}

/**
 * Delete directories with error handling
 * Sorts by length descending to handle nested dirs properly
 * Logs warnings for failed deletions and continues with remaining directories
 */
export function deleteDirectories(dirs: string[], logger: Logger): { deleted: number, errors: CleanupError[] } {
  let deleted = 0
  const errors: CleanupError[] = []

  // Sort by length descending to handle nested dirs
  const sortedDirs = [...dirs].sort((a, b) => b.length - a.length)

  for (const dir of sortedDirs) {
    const resolved = path.isAbsolute(dir) ? dir : path.resolve(dir)
    try {
      if (fs.existsSync(resolved)) {
        fs.rmSync(resolved, { recursive: true, force: true })
        logger.debug({ action: 'delete', type: 'directory', path: resolved })
        deleted++
      }
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e)
      logger.warn('failed to delete directory', { path: resolved, error: errorMessage })
      errors.push({ path: resolved, type: 'directory', error: e })
    }
  }

  return { deleted, errors }
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
  logger: Logger,
  options?: CleanupOptions,
): Promise<CleanupResult> {
  const { executeHooks = true } = options ?? {}

  // Collect outputs for logging
  const outputs = await collectAllPluginOutputs(outputPlugins, cleanCtx)
  logger.debug('Collected outputs for cleanup', {
    projectDirs: outputs.projectDirs.length,
    projectFiles: outputs.projectFiles.length,
    globalDirs: outputs.globalDirs.length,
    globalFiles: outputs.globalFiles.length,
  })

  // Check permissions
  const permissions = await checkCanClean(outputPlugins, cleanCtx)

  // Collect deletion targets
  const { filesToDelete, dirsToDelete } = await collectDeletionTargets(
    outputPlugins,
    permissions,
    cleanCtx,
  )

  // Perform deletions
  const fileResult = deleteFiles(filesToDelete, logger)
  const dirResult = deleteDirectories(dirsToDelete, logger)

  // Execute hooks if requested
  if (executeHooks) {
    await executeOnCleanComplete(outputPlugins, cleanCtx)
  }

  return {
    deletedFiles: fileResult.deleted,
    deletedDirs: dirResult.deleted,
    errors: [...fileResult.errors, ...dirResult.errors],
  }
}
