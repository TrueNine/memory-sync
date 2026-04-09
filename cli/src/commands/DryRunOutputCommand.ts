import type {Command, CommandContext, CommandResult} from './Command'
import {collectOutputDeclarations, executeDeclarativeWriteOutputs, syncWindowsConfigIntoWsl} from '@truenine/memory-sync-sdk'
import {runExecutionPreflight} from './execution-preflight'

export class DryRunOutputCommand implements Command {
  readonly name = 'dry-run-output'

  async execute(ctx: CommandContext): Promise<CommandResult> {
    const preflightResult = runExecutionPreflight(ctx, this.name)
    if (preflightResult != null) return preflightResult

    const {logger, outputPlugins, createWriteContext, collectedOutputContext} = ctx
    logger.info('Running dry run', {
      plugins: outputPlugins.length,
      projects: collectedOutputContext.workspace.projects.length,
      workspace: collectedOutputContext.workspace.directory.path
    })
    const writeCtx = createWriteContext(true)
    const predeclaredOutputs = await collectOutputDeclarations(outputPlugins, writeCtx)
    const results = await executeDeclarativeWriteOutputs(outputPlugins, writeCtx, predeclaredOutputs)

    let totalFiles = 0
    let totalDirs = 0
    for (const result of results.values()) {
      totalFiles += result.files.length
      totalDirs += result.dirs.length
    }

    const wslMirrorResult = await syncWindowsConfigIntoWsl(outputPlugins, writeCtx, void 0, predeclaredOutputs)
    if (wslMirrorResult.errors.length > 0) {
      return {success: false, filesAffected: totalFiles, dirsAffected: totalDirs, message: wslMirrorResult.errors.join('\n')}
    }

    totalFiles += wslMirrorResult.mirroredFiles
    if (wslMirrorResult.mirroredFiles > 0 || wslMirrorResult.warnings.length > 0) {
      logger.info('Prepared WSL mirror preview', {
        files: wslMirrorResult.mirroredFiles,
        warnings: wslMirrorResult.warnings.length
      })
    }
    logger.info('Dry run complete', {
      files: totalFiles,
      directories: totalDirs
    })
    return {success: true, filesAffected: totalFiles, dirsAffected: totalDirs, message: 'Dry-run complete, no files were written'}
  }
}
