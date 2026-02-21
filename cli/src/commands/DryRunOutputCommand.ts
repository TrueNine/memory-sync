import type {Command, CommandContext, CommandResult} from './Command'
import {checkCanWrite, executeWriteOutputs} from '@truenine/plugin-shared'

/**
 * Dry-run output command - simulates write operations without actual I/O
 */
export class DryRunOutputCommand implements Command {
  readonly name = 'dry-run-output'

  async execute(ctx: CommandContext): Promise<CommandResult> {
    const {logger, outputPlugins, createWriteContext} = ctx
    logger.info('started', {command: 'dry-run-output', dryRun: true})

    const writeCtx = createWriteContext(true)
    const permissions = await checkCanWrite(outputPlugins, writeCtx)
    const allowedPlugins = outputPlugins.filter(
      p => Boolean(permissions.get(p.name)?.project ?? true)
    )

    const results = await executeWriteOutputs(allowedPlugins, writeCtx)

    let totalFiles = 0
    let totalDirs = 0
    for (const [pluginName, result] of results) {
      totalFiles += result.files.length
      totalDirs += result.dirs.length
      logger.info('plugin result', {plugin: pluginName, files: result.files.length, dirs: result.dirs.length, dryRun: true})
    }

    logger.info('complete', {command: 'dry-run-output', totalFiles, totalDirs, dryRun: true})

    return {
      success: true,
      filesAffected: totalFiles,
      dirsAffected: totalDirs,
      message: 'Dry-run complete, no files were written'
    }
  }
}
