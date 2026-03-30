import type {Command, CommandContext, CommandResult} from './Command'
import * as path from 'node:path'
import {collectAllPluginOutputs} from '../plugins/plugin-core'
import {logProtectedDeletionGuardError} from '../ProtectedDeletionGuard'
import {collectDeletionTargets} from './CleanupUtils'

/**
 * Dry-run clean command - simulates clean operations without actual deletion
 */
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

    this.logDryRunFiles(filesToDelete, logger)
    this.logDryRunDirectories(totalDirsToDelete, logger)

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

  private logDryRunFiles(files: string[], logger: CommandContext['logger']): void {
    for (const file of files) {
      const resolved = path.isAbsolute(file) ? file : path.resolve(file)
      logger.info('would delete file', {path: resolved, dryRun: true})
    }
  }

  private logDryRunDirectories(dirs: string[], logger: CommandContext['logger']): void {
    const sortedDirs = [...dirs].sort((a, b) => b.length - a.length)
    for (const dir of sortedDirs) {
      const resolved = path.isAbsolute(dir) ? dir : path.resolve(dir)
      logger.info('would delete directory', {path: resolved, dryRun: true})
    }
  }
}
