import type {Command, CommandContext, CommandResult} from './Command'
import * as path from 'node:path'
import {collectDeletionTargets, logProtectedDeletionGuardError} from '@truenine/memory-sync-sdk'
import {runExecutionPreflight} from './execution-preflight'

export class DryRunCleanCommand implements Command {
  readonly name = 'dry-run-clean'

  async execute(ctx: CommandContext): Promise<CommandResult> {
    const preflightResult = runExecutionPreflight(ctx, this.name)
    if (preflightResult != null) return preflightResult

    const {logger, outputPlugins, createCleanContext} = ctx
    logger.info('Running cleanup preview', {
      plugins: outputPlugins.length
    })
    const cleanCtx = createCleanContext(true)

    const {filesToDelete, dirsToDelete, emptyDirsToDelete, violations, excludedScanGlobs} = await collectDeletionTargets(outputPlugins, cleanCtx)
    const totalDirsToDelete = [...dirsToDelete, ...emptyDirsToDelete]

    if (violations.length > 0) {
      logProtectedDeletionGuardError(logger, 'dry-run-cleanup', violations)
      return {
        success: false,
        filesAffected: 0,
        dirsAffected: 0,
        message: `Protected deletion guard blocked cleanup for ${violations.length} path(s)`
      }
    }

    for (const file of filesToDelete) logger.info('Would remove file', {path: path.isAbsolute(file) ? file : path.resolve(file)})
    for (const dir of [...totalDirsToDelete].sort((a, b) => b.length - a.length))
    { logger.info('Would remove directory', {path: path.isAbsolute(dir) ? dir : path.resolve(dir)}) }

    logger.info('Cleanup preview complete', {
      files: filesToDelete.length,
      directories: totalDirsToDelete.length,
      excludedGlobs: excludedScanGlobs.length
    })

    return {
      success: true,
      filesAffected: filesToDelete.length,
      dirsAffected: totalDirsToDelete.length,
      message: 'Dry-run complete, no files were deleted'
    }
  }
}
