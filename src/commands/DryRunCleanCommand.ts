import type { Command, CommandContext, CommandResult } from './Command'
import * as path from 'node:path'
import { checkCanClean, collectAllPluginOutputs, executeOnCleanComplete } from '@/types'

/**
 * Dry-run clean command - simulates clean operations without actual deletion
 */
export class DryRunCleanCommand implements Command {
  readonly name = 'dry-run-clean'

  async execute(ctx: CommandContext): Promise<CommandResult> {
    const { logger, outputPlugins, createCleanContext } = ctx
    logger.info('[DRY-RUN] Running clean pipeline')

    const cleanCtx = createCleanContext(true)
    const outputs = await collectAllPluginOutputs(outputPlugins, cleanCtx)

    logger.info('[DRY-RUN] Collected outputs for cleanup', {
      projectDirs: outputs.projectDirs.length,
      projectFiles: outputs.projectFiles.length,
      globalDirs: outputs.globalDirs.length,
      globalFiles: outputs.globalFiles.length,
    })

    const permissions = await checkCanClean(outputPlugins, cleanCtx)
    const { filesToDelete, dirsToDelete } = await this.collectDeletionTargets(ctx, permissions, cleanCtx)

    this.logDryRunFiles(filesToDelete, logger)
    this.logDryRunDirectories(dirsToDelete, logger)

    await executeOnCleanComplete(outputPlugins, cleanCtx)

    logger.info(`[DRY-RUN] Clean complete: ${filesToDelete.length} files, ${dirsToDelete.length} directories would be deleted`)

    return {
      success: true,
      filesAffected: filesToDelete.length,
      dirsAffected: dirsToDelete.length,
      message: 'Dry-run complete, no files were deleted',
    }
  }

  private async collectDeletionTargets(
    ctx: CommandContext,
    permissions: Map<string, { project: boolean, global: boolean }>,
    cleanCtx: ReturnType<CommandContext['createCleanContext']>,
  ): Promise<{ filesToDelete: string[], dirsToDelete: string[] }> {
    const filesToDelete: string[] = []
    const dirsToDelete: string[] = []

    for (const plugin of ctx.outputPlugins) {
      const perm = permissions.get(plugin.name)
      if (perm?.project) {
        const projectFiles = await plugin.registerProjectOutputFiles?.(cleanCtx) ?? []
        const projectDirs = await plugin.registerProjectOutputDirs?.(cleanCtx) ?? []
        filesToDelete.push(...projectFiles.map((f) => f.getAbsolutePath()))
        dirsToDelete.push(...projectDirs.map((d) => d.getAbsolutePath()))
      }
      if (perm?.global) {
        const globalFiles = await plugin.registerGlobalOutputFiles?.(cleanCtx) ?? []
        const globalDirs = await plugin.registerGlobalOutputDirs?.(cleanCtx) ?? []
        filesToDelete.push(...globalFiles.map((f) => f.getAbsolutePath()))
        dirsToDelete.push(...globalDirs.map((d) => d.getAbsolutePath()))
      }
    }

    return { filesToDelete, dirsToDelete }
  }

  private logDryRunFiles(files: string[], logger: CommandContext['logger']): void {
    for (const file of files) {
      const resolved = path.isAbsolute(file) ? file : path.resolve(file)
      logger.info(`[DRY-RUN] Would delete file: ${resolved}`)
    }
  }

  private logDryRunDirectories(dirs: string[], logger: CommandContext['logger']): void {
    const sortedDirs = [...dirs].sort((a, b) => b.length - a.length)
    for (const dir of sortedDirs) {
      const resolved = path.isAbsolute(dir) ? dir : path.resolve(dir)
      logger.info(`[DRY-RUN] Would delete directory: ${resolved}`)
    }
  }
}
