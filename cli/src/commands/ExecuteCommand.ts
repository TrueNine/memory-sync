import type {Command, CommandContext, CommandResult} from './Command'
import {collectOutputDeclarations, executeDeclarativeWriteOutputs, performCleanup, syncWindowsConfigIntoWsl} from '@truenine/memory-sync-sdk'

export class ExecuteCommand implements Command {
  readonly name = 'execute'

  async execute(ctx: CommandContext): Promise<CommandResult> {
    const {logger, outputPlugins, createCleanContext, createWriteContext} = ctx
    logger.info('started', {command: 'execute'})

    const writeCtx = createWriteContext(false)
    const predeclaredOutputs = await collectOutputDeclarations(outputPlugins, writeCtx)
    const cleanupResult = await performCleanup(outputPlugins, createCleanContext(false), logger, predeclaredOutputs)
    if (cleanupResult.violations.length > 0 || cleanupResult.conflicts.length > 0) {
      return {success: false, filesAffected: 0, dirsAffected: 0, ...cleanupResult.message != null ? {message: cleanupResult.message} : {}}
    }

    logger.info('cleanup complete', {deletedFiles: cleanupResult.deletedFiles, deletedDirs: cleanupResult.deletedDirs})
    const results = await executeDeclarativeWriteOutputs(outputPlugins, writeCtx, predeclaredOutputs)

    let totalFiles = 0
    let totalDirs = 0
    const writeErrors: string[] = []
    for (const result of results.values()) {
      totalFiles += result.files.length
      totalDirs += result.dirs.length
      for (const fileResult of result.files) {
        if (!fileResult.success) writeErrors.push(fileResult.error?.message ?? `Failed to write ${fileResult.path}`)
      }
    }

    if (writeErrors.length > 0) {
      return {success: false, filesAffected: totalFiles, dirsAffected: totalDirs, message: writeErrors.join('\n')}
    }

    const wslMirrorResult = await syncWindowsConfigIntoWsl(outputPlugins, writeCtx, void 0, predeclaredOutputs)
    if (wslMirrorResult.errors.length > 0) {
      return {success: false, filesAffected: totalFiles, dirsAffected: totalDirs, message: wslMirrorResult.errors.join('\n')}
    }

    totalFiles += wslMirrorResult.mirroredFiles
    logger.info('complete', {command: 'execute', pluginCount: results.size})
    return {success: true, filesAffected: totalFiles, dirsAffected: totalDirs}
  }
}
