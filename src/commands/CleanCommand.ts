import type { Command, CommandContext, CommandResult } from './Command'
import { performCleanup } from './CleanupUtils'

/**
 * Clean command - deletes registered output files and directories
 */
export class CleanCommand implements Command {
  readonly name = 'clean'

  async execute(ctx: CommandContext): Promise<CommandResult> {
    const { logger, outputPlugins, createCleanContext } = ctx
    logger.info('Running clean pipeline')

    const cleanCtx = createCleanContext(false)
    const result = await performCleanup(outputPlugins, cleanCtx, logger)

    logger.info(`Clean complete: ${result.deletedFiles} files, ${result.deletedDirs} directories`)

    return {
      success: true,
      filesAffected: result.deletedFiles,
      dirsAffected: result.deletedDirs,
    }
  }
}
