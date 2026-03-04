import type {Command, CommandContext, CommandResult} from './Command'
import * as path from 'node:path'
import {collectAllPluginOutputs} from '../plugins/plugin-core'
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
      workspaceDirs: outputs.workspaceDirs.length,
      workspaceFiles: outputs.workspaceFiles.length,
      globalDirs: outputs.globalDirs.length,
      globalFiles: outputs.globalFiles.length
    })

    const {filesToDelete, dirsToDelete, protectedFiles} = await collectDeletionTargets(outputPlugins, cleanCtx)

    this.logProtectedFiles(protectedFiles, logger)
    this.logDryRunFiles(filesToDelete, logger)
    this.logDryRunDirectories(dirsToDelete, logger)

    logger.info('clean complete', {
      dryRun: true,
      filesAffected: filesToDelete.length,
      dirsAffected: dirsToDelete.length,
      protectedFiles: protectedFiles.length
    })

    return {
      success: true,
      filesAffected: filesToDelete.length,
      dirsAffected: dirsToDelete.length,
      message: 'Dry-run complete, no files were deleted'
    }
  }

  private logProtectedFiles(files: string[], logger: CommandContext['logger']): void {
    for (const file of files) {
      const resolved = path.isAbsolute(file) ? file : path.resolve(file)
      logger.info('protected file (input/output path overlap)', {path: resolved, dryRun: true, protected: true})
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
