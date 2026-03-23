import type {Command, CommandContext, CommandResult} from './Command'
import {syncWindowsConfigIntoWsl} from '@/wsl-mirror-sync'
import {
  collectOutputDeclarations,
  executeDeclarativeWriteOutputs
} from '../plugins/plugin-core'

/**
 * Dry-run output command - simulates write operations without actual I/O
 */
export class DryRunOutputCommand implements Command {
  readonly name = 'dry-run-output'

  async execute(ctx: CommandContext): Promise<CommandResult> {
    const {logger, outputPlugins, createWriteContext} = ctx
    logger.info('started', {command: 'dry-run-output', dryRun: true})

    const writeCtx = createWriteContext(true)
    const predeclaredOutputs = await collectOutputDeclarations(outputPlugins, writeCtx)
    const results = await executeDeclarativeWriteOutputs(outputPlugins, writeCtx, predeclaredOutputs)

    let totalFiles = 0
    let totalDirs = 0
    for (const [pluginName, result] of results) {
      totalFiles += result.files.length
      totalDirs += result.dirs.length
      logger.info('plugin result', {plugin: pluginName, files: result.files.length, dirs: result.dirs.length, dryRun: true})
    }

    const wslMirrorResult = await syncWindowsConfigIntoWsl(outputPlugins, writeCtx, void 0, predeclaredOutputs)
    if (wslMirrorResult.errors.length > 0) {
      return {
        success: false,
        filesAffected: totalFiles,
        dirsAffected: totalDirs,
        message: wslMirrorResult.errors.join('\n')
      }
    }

    totalFiles += wslMirrorResult.mirroredFiles

    logger.info('complete', {command: 'dry-run-output', totalFiles, totalDirs, dryRun: true})

    return {
      success: true,
      filesAffected: totalFiles,
      dirsAffected: totalDirs,
      message: 'Dry-run complete, no files were written'
    }
  }
}
