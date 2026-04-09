import type {Command, CommandContext, CommandResult} from './Command'
import {collectOutputDeclarations, executeDeclarativeWriteOutputs, performCleanup, syncWindowsConfigIntoWsl} from '@truenine/memory-sync-sdk'
import {runExecutionPreflight} from './execution-preflight'

export class InstallCommand implements Command {
  readonly name = 'install'

  async execute(ctx: CommandContext): Promise<CommandResult> {
    const preflightResult = runExecutionPreflight(ctx, this.name)
    if (preflightResult != null) return preflightResult

    const {logger, outputPlugins, createCleanContext, createWriteContext, collectedOutputContext} = ctx
    logger.info('Running sync', {
      plugins: outputPlugins.length,
      projects: collectedOutputContext.workspace.projects.length,
      workspace: collectedOutputContext.workspace.directory.path
    })

    const writeCtx = createWriteContext(false)
    const predeclaredOutputs = await collectOutputDeclarations(outputPlugins, writeCtx)
    const declarationCount = [...predeclaredOutputs.values()]
      .reduce((total, declarations) => total + declarations.length, 0)
    logger.info('Prepared output plan', {
      plugins: predeclaredOutputs.size,
      declarations: declarationCount
    })

    const cleanupResult = await performCleanup(outputPlugins, createCleanContext(false), logger, predeclaredOutputs)
    if (cleanupResult.violations.length > 0 || cleanupResult.conflicts.length > 0) {
      return {success: false, filesAffected: 0, dirsAffected: 0, ...cleanupResult.message != null ? {message: cleanupResult.message} : {}}
    }

    logger.info('Removed stale generated files', {
      files: cleanupResult.deletedFiles,
      directories: cleanupResult.deletedDirs
    })

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

    logger.info('Wrote output files', {
      plugins: results.size,
      files: totalFiles,
      directories: totalDirs
    })

    if (writeErrors.length > 0) {
      return {success: false, filesAffected: totalFiles, dirsAffected: totalDirs, message: writeErrors.join('\n')}
    }

    const wslMirrorResult = await syncWindowsConfigIntoWsl(outputPlugins, writeCtx, void 0, predeclaredOutputs)
    if (wslMirrorResult.errors.length > 0) {
      return {success: false, filesAffected: totalFiles, dirsAffected: totalDirs, message: wslMirrorResult.errors.join('\n')}
    }

    totalFiles += wslMirrorResult.mirroredFiles
    if (wslMirrorResult.mirroredFiles > 0 || wslMirrorResult.warnings.length > 0) {
      logger.info('Synced WSL mirrors', {
        files: wslMirrorResult.mirroredFiles,
        warnings: wslMirrorResult.warnings.length
      })
    }
    logger.info('Sync complete', {
      files: totalFiles,
      directories: totalDirs
    })
    return {success: true, filesAffected: totalFiles, dirsAffected: totalDirs}
  }
}
