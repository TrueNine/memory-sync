import type { Command, CommandContext, CommandResult } from './Command'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { checkCanClean, collectAllPluginOutputs, executeOnCleanComplete } from '@/types'

/**
 * Clean command - deletes registered output files and directories
 */
export class CleanCommand implements Command {
  readonly name = 'clean'

  async execute(ctx: CommandContext): Promise<CommandResult> {
    const { logger, outputPlugins, createCleanContext } = ctx
    logger.info('Running clean pipeline')

    const cleanCtx = createCleanContext(false)
    const outputs = await collectAllPluginOutputs(outputPlugins, cleanCtx)

    logger.info('Collected outputs for cleanup', {
      projectDirs: outputs.projectDirs.length,
      projectFiles: outputs.projectFiles.length,
      globalDirs: outputs.globalDirs.length,
      globalFiles: outputs.globalFiles.length,
    })

    const permissions = await checkCanClean(outputPlugins, cleanCtx)
    const { filesToDelete, dirsToDelete } = await this.collectDeletionTargets(ctx, permissions, cleanCtx)

    const deletedFiles = this.deleteFiles(filesToDelete, logger)
    const deletedDirs = this.deleteDirectories(dirsToDelete, logger)

    await executeOnCleanComplete(outputPlugins, cleanCtx)

    logger.info(`Clean complete: ${deletedFiles} files, ${deletedDirs} directories`)

    return {
      success: true,
      filesAffected: deletedFiles,
      dirsAffected: deletedDirs,
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

  private deleteFiles(files: string[], logger: CommandContext['logger']): number {
    let deleted = 0
    for (const file of files) {
      const resolved = path.isAbsolute(file) ? file : path.resolve(file)
      try {
        if (fs.existsSync(resolved)) {
          fs.unlinkSync(resolved)
          logger.info(`Deleted file: ${resolved}`)
          deleted++
        }
      } catch (e) {
        logger.warn(`Failed to delete file: ${resolved}`, { error: e })
      }
    }
    return deleted
  }

  private deleteDirectories(dirs: string[], logger: CommandContext['logger']): number {
    let deleted = 0
    // Sort by length descending to handle nested dirs
    const sortedDirs = [...dirs].sort((a, b) => b.length - a.length)
    for (const dir of sortedDirs) {
      const resolved = path.isAbsolute(dir) ? dir : path.resolve(dir)
      try {
        if (fs.existsSync(resolved)) {
          fs.rmSync(resolved, { recursive: true, force: true })
          logger.info(`Deleted directory: ${resolved}`)
          deleted++
        }
      } catch (e) {
        logger.warn(`Failed to delete directory: ${resolved}`, { error: e })
      }
    }
    return deleted
  }
}
