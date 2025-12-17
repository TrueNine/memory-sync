import type { Command, CommandContext, CommandResult } from './Command'
import { checkCanWrite, executeWriteOutputs } from '@/types'

/**
 * Dry-run output command - simulates write operations without actual I/O
 */
export class DryRunOutputCommand implements Command {
  readonly name = 'dry-run-output'

  async execute(ctx: CommandContext): Promise<CommandResult> {
    const { logger, outputPlugins, createWriteContext } = ctx
    logger.info('[DRY-RUN] Running dry-run pipeline')

    const writeCtx = createWriteContext(true)
    const permissions = await checkCanWrite(outputPlugins, writeCtx)
    const allowedPlugins = outputPlugins.filter(
      (p) => Boolean(permissions.get(p.name)?.project ?? true),
    )

    const results = await executeWriteOutputs(allowedPlugins, writeCtx)

    let totalFiles = 0
    let totalDirs = 0
    for (const [pluginName, result] of results) {
      totalFiles += result.files.length
      totalDirs += result.dirs.length
      logger.info(`[DRY-RUN] ${pluginName}: ${result.files.length} files, ${result.dirs.length} dirs`)
    }

    logger.info(`[DRY-RUN] Total: ${totalFiles} files, ${totalDirs} dirs would be written`)

    return {
      success: true,
      filesAffected: totalFiles,
      dirsAffected: totalDirs,
      message: 'Dry-run complete, no files were written',
    }
  }
}
