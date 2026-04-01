import type {Command, CommandContext, CommandResult} from './Command'
import * as path from 'node:path'
import {collectAllPluginOutputs, collectDeletionTargets, logProtectedDeletionGuardError} from '@truenine/memory-sync-sdk'

export class DryRunCleanCommand implements Command {
  readonly name = 'dry-run-clean'

  async execute(ctx: CommandContext): Promise<CommandResult> {
    const {logger, outputPlugins, createCleanContext} = ctx
    logger.info('running clean pipeline', {command: 'dry-run-clean', dryRun: true})
    const cleanCtx = createCleanContext(true)
    const outputs = await collectAllPluginOutputs(outputPlugins, cleanCtx)
    logger.info('collected outputs for cleanup', {
      dryRun: true,
      projectDirs: outputs.projectDirs.length,
      projectFiles: outputs.projectFiles.length,
      globalDirs: outputs.globalDirs.length,
      globalFiles: outputs.globalFiles.length
    })

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

    for (const file of filesToDelete) logger.info('would delete file', {path: path.isAbsolute(file) ? file : path.resolve(file), dryRun: true})
    for (const dir of [...totalDirsToDelete].sort((a, b) => b.length - a.length))
    { logger.info('would delete directory', {path: path.isAbsolute(dir) ? dir : path.resolve(dir), dryRun: true}) }

    logger.info('clean complete', {
      dryRun: true,
      filesAffected: filesToDelete.length,
      dirsAffected: totalDirsToDelete.length,
      violations: 0,
      excludedScanGlobs
    })

    return {
      success: true,
      filesAffected: filesToDelete.length,
      dirsAffected: totalDirsToDelete.length,
      message: 'Dry-run complete, no files were deleted'
    }
  }
}
