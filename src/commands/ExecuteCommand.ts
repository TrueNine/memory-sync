import type { Command, CommandContext, CommandResult } from './Command'
import { checkCanWrite, executeWriteOutputs } from '@/types'

/**
 * Execute command - performs actual write operations
 */
export class ExecuteCommand implements Command {
  readonly name = 'execute'

  async execute(ctx: CommandContext): Promise<CommandResult> {
    const { logger, outputPlugins, createWriteContext } = ctx
    logger.info('Running execute pipeline')

    const writeCtx = createWriteContext(false)
    const permissions = await checkCanWrite(outputPlugins, writeCtx)
    const allowedPlugins = outputPlugins.filter(
      (p) => permissions.get(p.name)?.project ?? true,
    )

    const results = await executeWriteOutputs(allowedPlugins, writeCtx)

    let totalFiles = 0
    let totalDirs = 0
    for (const result of results.values()) {
      totalFiles += result.files.length
      totalDirs += result.dirs.length
    }

    logger.info('Execute pipeline complete', { pluginCount: results.size })

    return {
      success: true,
      filesAffected: totalFiles,
      dirsAffected: totalDirs,
    }
  }
}
