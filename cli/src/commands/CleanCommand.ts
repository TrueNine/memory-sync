import type {Command, CommandContext, CommandResult} from './Command'
import {performCleanup} from '@truenine/memory-sync-sdk'

export class CleanCommand implements Command {
  readonly name = 'clean'

  async execute(ctx: CommandContext): Promise<CommandResult> {
    const {logger, outputPlugins, createCleanContext, collectedOutputContext} = ctx
    logger.info('started', {
      command: 'clean',
      pluginCount: outputPlugins.length,
      projectCount: collectedOutputContext.workspace.projects.length,
      workspaceDir: collectedOutputContext.workspace.directory.path
    })
    logger.info('clean phase started', {phase: 'cleanup'})
    const result = await performCleanup(outputPlugins, createCleanContext(false), logger)
    if (result.violations.length > 0 || result.conflicts.length > 0) {
      logger.info('clean halted', {
        phase: 'cleanup',
        conflicts: result.conflicts.length,
        violations: result.violations.length,
        ...result.message != null ? {message: result.message} : {}
      })
      return {success: false, filesAffected: 0, dirsAffected: 0, ...result.message != null ? {message: result.message} : {}}
    }
    logger.info('clean phase complete', {
      phase: 'cleanup',
      deletedFiles: result.deletedFiles,
      deletedDirs: result.deletedDirs,
      errors: result.errors.length
    })
    logger.info('complete', {
      command: 'clean',
      filesAffected: result.deletedFiles,
      dirsAffected: result.deletedDirs
    })
    return {success: true, filesAffected: result.deletedFiles, dirsAffected: result.deletedDirs}
  }
}
