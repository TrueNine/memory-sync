import type {Command, CommandContext, CommandResult} from './Command'
import {checkCanWrite, executeWriteOutputs} from '@/types'
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

    // Step 1: Pre-cleanup (non-dry-run only)
    const cleanCtx = createCleanContext(false)
    const cleanupResult = await performCleanup(outputPlugins, cleanCtx, logger, {
      // Skip onCleanComplete hooks during pre-cleanup
      // They will be handled by the write phase
      executeHooks: false,
    })
    logger.info('cleanup complete', {
      deletedFiles: cleanupResult.deletedFiles,
      deletedDirs: cleanupResult.deletedDirs,
    })

    // Step 2: Write outputs
    const writeCtx = createWriteContext(false)
    const permissions = await checkCanWrite(outputPlugins, writeCtx)
    const allowedPlugins = outputPlugins.filter(
      p => permissions.get(p.name)?.project ?? true,
    )

    const results = await executeWriteOutputs(allowedPlugins, writeCtx)

    let totalFiles = 0
    let totalDirs = 0
    for (const result of results.values()) {
      totalFiles += result.files.length
      totalDirs += result.dirs.length
    }

    logger.info('complete', {command: 'execute', pluginCount: results.size})

    return {
      success: true,
      filesAffected: totalFiles,
      dirsAffected: totalDirs,
    }
  }
}
