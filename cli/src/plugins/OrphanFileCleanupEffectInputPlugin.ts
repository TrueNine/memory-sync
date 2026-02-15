import type {CollectedInputContext, InputEffectContext, InputEffectResult, InputPluginContext} from '@/types'
import {AbstractInputPlugin} from './AbstractInputPlugin'

/**
 * Result of the orphan file cleanup effect.
 */
export interface OrphanCleanupEffectResult extends InputEffectResult {
  readonly deletedFiles: string[]
  readonly deletedDirs: string[]
}

export class OrphanFileCleanupEffectInputPlugin extends AbstractInputPlugin {
  constructor() {
    super('OrphanFileCleanupEffectInputPlugin')
    this.registerEffect('orphan-file-cleanup', this.cleanupOrphanFiles.bind(this), 20)
  }

  private async cleanupOrphanFiles(ctx: InputEffectContext): Promise<OrphanCleanupEffectResult> {
    const {fs, path, shadowProjectDir, dryRun, logger} = ctx

    const distDir = path.join(shadowProjectDir, 'dist')

    const deletedFiles: string[] = []
    const deletedDirs: string[] = []
    const errors: {path: string, error: Error}[] = []

    if (!fs.existsSync(distDir)) { // Check if dist/ directory exists (Requirement 2.9)
      logger.debug({action: 'orphan-cleanup', message: 'dist/ directory does not exist, skipping', distDir})
      return {
        success: true,
        description: 'dist/ directory does not exist, nothing to clean',
        deletedFiles,
        deletedDirs
      }
    }

    const distSubDirs = ['skills', 'commands', 'agents', 'app'] // Process each subdirectory in dist/

    for (const subDir of distSubDirs) {
      const distSubDirPath = path.join(distDir, subDir)
      if (fs.existsSync(distSubDirPath)) this.cleanupDirectory(ctx, distSubDirPath, subDir, deletedFiles, deletedDirs, errors, dryRun ?? false)
    }

    const hasErrors = errors.length > 0
    if (hasErrors) logger.warn({action: 'orphan-cleanup', errors: errors.map(e => ({path: e.path, error: e.error.message}))})

    return {
      success: !hasErrors,
      description: dryRun
        ? `Would delete ${deletedFiles.length} files and ${deletedDirs.length} directories`
        : `Deleted ${deletedFiles.length} files and ${deletedDirs.length} directories`,
      deletedFiles,
      deletedDirs,
      ...hasErrors && {error: new Error(`${errors.length} errors occurred during cleanup`)}
    }
  }

  private cleanupDirectory(
    ctx: InputEffectContext,
    distDirPath: string,
    dirType: string,
    deletedFiles: string[],
    deletedDirs: string[],
    errors: {path: string, error: Error}[],
    dryRun: boolean
  ): void {
    const {fs, path, shadowProjectDir, logger} = ctx

    let entries: import('node:fs').Dirent[]
    try {
      entries = fs.readdirSync(distDirPath, {withFileTypes: true})
    }
    catch (error) {
      errors.push({path: distDirPath, error: error as Error})
      logger.warn({action: 'orphan-cleanup', message: 'Failed to read directory', path: distDirPath, error: (error as Error).message})
      return
    }

    for (const entry of entries) {
      const entryPath = path.join(distDirPath, entry.name)

      if (entry.isDirectory()) {
        this.cleanupDirectory(ctx, entryPath, dirType, deletedFiles, deletedDirs, errors, dryRun) // Recursively clean subdirectories

        this.removeEmptyDirectory(ctx, entryPath, deletedDirs, errors, dryRun) // Check if directory is now empty and remove it (Requirement 2.7)
      } else if (entry.isFile()) {
        const isOrphan = this.isOrphanFile(ctx, entryPath, dirType, shadowProjectDir)

        if (isOrphan) {
          if (dryRun) {
            logger.debug({action: 'orphan-cleanup', dryRun: true, wouldDelete: entryPath})
            deletedFiles.push(entryPath)
          } else {
            try {
              fs.unlinkSync(entryPath)
              deletedFiles.push(entryPath)
              logger.debug({action: 'orphan-cleanup', deleted: entryPath})
            }
            catch (error) {
              errors.push({path: entryPath, error: error as Error})
              logger.warn({action: 'orphan-cleanup', message: 'Failed to delete file', path: entryPath, error: (error as Error).message})
            }
          }
        }
      }
    }
  }

  private isOrphanFile(
    ctx: InputEffectContext,
    distFilePath: string,
    dirType: string,
    shadowProjectDir: string
  ): boolean {
    const {fs, path} = ctx

    const fileName = path.basename(distFilePath)
    const isMdxFile = fileName.endsWith('.mdx')

    const distTypeDir = path.join(shadowProjectDir, 'dist', dirType) // Get relative path from dist/{dirType}/ to the file
    const relativeFromType = path.relative(distTypeDir, distFilePath)
    const relativeDir = path.dirname(relativeFromType)
    const baseName = fileName.replace(/\.mdx$/, '')

    if (isMdxFile) {
      const possibleSrcPaths = this.getPossibleSourcePaths(path, shadowProjectDir, dirType, baseName, relativeDir) // Apply mapping rules for .mdx files (Requirements 2.2, 2.3, 2.4, 2.5)

      return !possibleSrcPaths.some(srcPath => fs.existsSync(srcPath))
    }
    const possibleSrcPaths: string[] = [] // Build possible source paths based on directory type // For non-.mdx files, check direct mapping (Requirement 2.6)

    if (dirType === 'app') {
      possibleSrcPaths.push(path.join(shadowProjectDir, 'app', relativeFromType)) // dist/app/{path} → app/{path}
    } else {
      possibleSrcPaths.push(path.join(shadowProjectDir, 'src', dirType, relativeFromType)) // dist/{type}/{path} → src/{type}/{path}
    }

    return !possibleSrcPaths.some(srcPath => fs.existsSync(srcPath))
  }

  private getPossibleSourcePaths(
    nodePath: typeof import('node:path'),
    shadowProjectDir: string,
    dirType: string,
    baseName: string,
    relativeDir: string
  ): string[] {
    switch (dirType) {
      case 'skills':
        return relativeDir === '.' // dist/skills/{name}/{sub}.md → src/skills/{name}/{sub}.cn.mdx // dist/skills/{name}.md → src/skills/{name}/SKILL.cn.mdx OR src/skills/{name}.cn.mdx
          ? [ // Top-level skill file
              nodePath.join(shadowProjectDir, 'src', 'skills', baseName, 'SKILL.cn.mdx'),
              nodePath.join(shadowProjectDir, 'src', 'skills', `${baseName}.cn.mdx`)
            ]
          : [ // Nested skill file (e.g., dist/skills/api-convention/timestamp.md)
              nodePath.join(shadowProjectDir, 'src', 'skills', relativeDir, `${baseName}.cn.mdx`)
            ]
      case 'commands':
        return relativeDir === '.' // dist/commands/{sub}/{name}.md → src/commands/{sub}/{name}.cn.mdx // dist/commands/{name}.md → src/commands/{name}.cn.mdx
          ? [
              nodePath.join(shadowProjectDir, 'src', 'commands', `${baseName}.cn.mdx`)
            ]
          : [
              nodePath.join(shadowProjectDir, 'src', 'commands', relativeDir, `${baseName}.cn.mdx`)
            ]
      case 'agents':
        return relativeDir === '.' // dist/agents/{sub}/{name}.md → src/agents/{sub}/{name}.cn.mdx // dist/agents/{name}.md → src/agents/{name}.cn.mdx
          ? [
              nodePath.join(shadowProjectDir, 'src', 'agents', `${baseName}.cn.mdx`)
            ]
          : [
              nodePath.join(shadowProjectDir, 'src', 'agents', relativeDir, `${baseName}.cn.mdx`)
            ]
      case 'app':
        return relativeDir === '.' // dist/app/{project}/{name}.md → app/{project}/{name}.cn.mdx
          ? [
              nodePath.join(shadowProjectDir, 'app', `${baseName}.cn.mdx`)
            ]
          : [
              nodePath.join(shadowProjectDir, 'app', relativeDir, `${baseName}.cn.mdx`)
            ]
      default: return []
    }
  }

  private removeEmptyDirectory(
    ctx: InputEffectContext,
    dirPath: string,
    deletedDirs: string[],
    errors: {path: string, error: Error}[],
    dryRun: boolean
  ): void {
    const {fs, logger} = ctx

    try {
      const entries = fs.readdirSync(dirPath)
      if (entries.length === 0) {
        if (dryRun) {
          logger.debug({action: 'orphan-cleanup', dryRun: true, wouldDeleteDir: dirPath})
          deletedDirs.push(dirPath)
        } else {
          fs.rmdirSync(dirPath)
          deletedDirs.push(dirPath)
          logger.debug({action: 'orphan-cleanup', deletedDir: dirPath})
        }
      }
    }
    catch (error) {
      errors.push({path: dirPath, error: error as Error}) // Directory might not exist or have permission issues
      logger.warn({action: 'orphan-cleanup', message: 'Failed to check/remove directory', path: dirPath, error: (error as Error).message})
    }
  }

  collect(_ctx: InputPluginContext): Partial<CollectedInputContext> {
    return {}
  }
}
