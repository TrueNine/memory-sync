import type {Command, CommandContext, CommandResult} from './Command'
import {performCleanup} from '@truenine/memory-sync-sdk'

export class CleanCommand implements Command {
  readonly name = 'clean'

  async execute(ctx: CommandContext): Promise<CommandResult> {
    const {logger, outputPlugins, createCleanContext} = ctx
    logger.info('running clean pipeline', {command: 'clean'})
    const result = await performCleanup(outputPlugins, createCleanContext(false), logger)
    if (result.violations.length > 0 || result.conflicts.length > 0) {
      return {success: false, filesAffected: 0, dirsAffected: 0, ...result.message != null ? {message: result.message} : {}}
    }
    logger.info('clean complete', {deletedFiles: result.deletedFiles, deletedDirs: result.deletedDirs})
    return {success: true, filesAffected: result.deletedFiles, dirsAffected: result.deletedDirs}
  }
}
