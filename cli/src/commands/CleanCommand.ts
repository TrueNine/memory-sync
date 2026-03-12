import type {Command, CommandContext, CommandResult} from './Command'
import {performCleanup} from './CleanupUtils'

/**
 * Clean command - deletes registered output files and directories
 */
export class CleanCommand implements Command {
  readonly name = 'clean'

  async execute(ctx: CommandContext): Promise<CommandResult> {
    const {logger, outputPlugins, createCleanContext} = ctx
    logger.info('running clean pipeline', {command: 'clean'})

    const cleanCtx = createCleanContext(false)
    const result = await performCleanup(outputPlugins, cleanCtx, logger)

    if (result.violations.length > 0) {
      return {
        success: false,
        filesAffected: 0,
        dirsAffected: 0,
        ...result.message != null ? {message: result.message} : {}
      }
    }

    logger.info('clean complete', {deletedFiles: result.deletedFiles, deletedDirs: result.deletedDirs})

    return {
      success: true,
      filesAffected: result.deletedFiles,
      dirsAffected: result.deletedDirs
    }
  }
}
