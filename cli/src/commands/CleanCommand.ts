import type {Command, CommandContext, CommandResult} from './Command'
import {performCleanup} from '@truenine/memory-sync-sdk'
import {runExecutionPreflight} from './execution-preflight'

export class CleanCommand implements Command {
  readonly name = 'clean'

  async execute(ctx: CommandContext): Promise<CommandResult> {
    const preflightResult = runExecutionPreflight(ctx, this.name)
    if (preflightResult != null) return preflightResult

    const {logger, outputPlugins, createCleanContext, collectedOutputContext} = ctx
    logger.info('Running cleanup', {
      plugins: outputPlugins.length,
      projects: collectedOutputContext.workspace.projects.length,
      workspace: collectedOutputContext.workspace.directory.path
    })
    const result = await performCleanup(outputPlugins, createCleanContext(false), logger)
    if (result.violations.length > 0 || result.conflicts.length > 0) {
      return {success: false, filesAffected: 0, dirsAffected: 0, ...result.message != null ? {message: result.message} : {}}
    }
    logger.info('Cleanup complete', {
      files: result.deletedFiles,
      directories: result.deletedDirs
    })
    return {success: true, filesAffected: result.deletedFiles, dirsAffected: result.deletedDirs}
  }
}
