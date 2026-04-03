import type {Command, CommandContext, CommandResult} from './Command'
import {collectOutputDeclarations, executeDeclarativeWriteOutputs, performCleanup, syncWindowsConfigIntoWsl} from '@truenine/memory-sync-sdk'
import {runExecutionPreflight} from './execution-preflight'

export class ExecuteCommand implements Command {
  readonly name = 'execute'

  async execute(ctx: CommandContext): Promise<CommandResult> {
    const preflightResult = runExecutionPreflight(ctx, this.name)
    if (preflightResult != null) return preflightResult

    const {logger, outputPlugins, createCleanContext, createWriteContext, collectedOutputContext} = ctx
    logger.info('started', {
      command: 'execute',
      pluginCount: outputPlugins.length,
      projectCount: collectedOutputContext.workspace.projects.length,
      workspaceDir: collectedOutputContext.workspace.directory.path
    })

    const writeCtx = createWriteContext(false)
    logger.info('execute phase started', {phase: 'collect-output-declarations'})
    const predeclaredOutputs = await collectOutputDeclarations(outputPlugins, writeCtx)
    const declarationCount = [...predeclaredOutputs.values()]
      .reduce((total, declarations) => total + declarations.length, 0)
    logger.info('execute phase complete', {
      phase: 'collect-output-declarations',
      pluginCount: predeclaredOutputs.size,
      declarationCount
    })

    logger.info('execute phase started', {phase: 'cleanup-before-write'})
    const cleanupResult = await performCleanup(outputPlugins, createCleanContext(false), logger, predeclaredOutputs)
    if (cleanupResult.violations.length > 0 || cleanupResult.conflicts.length > 0) {
      logger.info('execute halted', {
        phase: 'cleanup-before-write',
        conflicts: cleanupResult.conflicts.length,
        violations: cleanupResult.violations.length,
        ...cleanupResult.message != null ? {message: cleanupResult.message} : {}
      })
      return {success: false, filesAffected: 0, dirsAffected: 0, ...cleanupResult.message != null ? {message: cleanupResult.message} : {}}
    }

    logger.info('execute phase complete', {
      phase: 'cleanup-before-write',
      deletedFiles: cleanupResult.deletedFiles,
      deletedDirs: cleanupResult.deletedDirs
    })

    logger.info('execute phase started', {
      phase: 'write-output-files',
      declarationCount
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

    logger.info('execute phase complete', {
      phase: 'write-output-files',
      pluginCount: results.size,
      filesAffected: totalFiles,
      dirsAffected: totalDirs,
      writeErrors: writeErrors.length
    })

    if (writeErrors.length > 0) {
      logger.info('execute halted', {
        phase: 'write-output-files',
        writeErrors: writeErrors.length
      })
      return {success: false, filesAffected: totalFiles, dirsAffected: totalDirs, message: writeErrors.join('\n')}
    }

    logger.info('execute phase started', {phase: 'sync-wsl-mirrors'})
    const wslMirrorResult = await syncWindowsConfigIntoWsl(outputPlugins, writeCtx, void 0, predeclaredOutputs)
    if (wslMirrorResult.errors.length > 0) {
      logger.info('execute halted', {
        phase: 'sync-wsl-mirrors',
        mirroredFiles: wslMirrorResult.mirroredFiles,
        errors: wslMirrorResult.errors.length
      })
      return {success: false, filesAffected: totalFiles, dirsAffected: totalDirs, message: wslMirrorResult.errors.join('\n')}
    }

    totalFiles += wslMirrorResult.mirroredFiles
    logger.info('execute phase complete', {
      phase: 'sync-wsl-mirrors',
      mirroredFiles: wslMirrorResult.mirroredFiles,
      warnings: wslMirrorResult.warnings.length,
      errors: wslMirrorResult.errors.length
    })
    logger.info('complete', {
      command: 'execute',
      pluginCount: results.size,
      filesAffected: totalFiles,
      dirsAffected: totalDirs
    })
    return {success: true, filesAffected: totalFiles, dirsAffected: totalDirs}
  }
}
