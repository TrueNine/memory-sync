import type {Command, CommandContext, CommandResult} from './Command'
import {
  executeDeclarativeWriteOutputs
} from '../plugins/plugin-core'
import {performCleanup} from './CleanupUtils'

/**
 * Execute command - performs actual write operations
 * Includes pre-cleanup to remove stale files before writing new outputs
 */
export class ExecuteCommand implements Command {
  readonly name = 'execute'

  async execute(ctx: CommandContext): Promise<CommandResult> {
    const {logger, outputPlugins, createCleanContext, createWriteContext} = ctx
    logger.info('started', {command: 'execute'})

    const cleanCtx = createCleanContext(false) // Step 1: Pre-cleanup (non-dry-run only)
    const cleanupResult = await performCleanup(outputPlugins, cleanCtx, logger)

    if (cleanupResult.violations.length > 0 || cleanupResult.conflicts.length > 0) {
      return {
        success: false,
        filesAffected: 0,
        dirsAffected: 0,
        ...cleanupResult.message != null ? {message: cleanupResult.message} : {}
      }
    }

    logger.info('cleanup complete', {deletedFiles: cleanupResult.deletedFiles, deletedDirs: cleanupResult.deletedDirs})

    const writeCtx = createWriteContext(false) // Step 2: Write outputs
    const results = await executeDeclarativeWriteOutputs(outputPlugins, writeCtx)

    let totalFiles = 0
    let totalDirs = 0
    const writeErrors: string[] = []
    for (const result of results.values()) {
      totalFiles += result.files.length
      totalDirs += result.dirs.length
      for (const fileResult of result.files) {
        if (!fileResult.success) writeErrors.push(fileResult.error?.message ?? `Failed to write ${fileResult.path}`)
      }
    }

    if (writeErrors.length > 0) {
      return {
        success: false,
        filesAffected: totalFiles,
        dirsAffected: totalDirs,
        message: writeErrors.join('\n')
      }
    }

    logger.info('complete', {command: 'execute', pluginCount: results.size})

    return {
      success: true,
      filesAffected: totalFiles,
      dirsAffected: totalDirs
    }
  }
}
