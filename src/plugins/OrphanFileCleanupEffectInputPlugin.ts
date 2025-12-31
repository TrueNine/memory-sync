import type { InputEffectContext, InputEffectResult } from './AbstractInputPlugin'

import type { CollectedInputContext, InputPluginContext } from '@/types'
import { AbstractInputPlugin } from './AbstractInputPlugin'

/**
 * Result of the orphan file cleanup effect.
 */
export interface OrphanCleanupEffectResult extends InputEffectResult {
  readonly deletedFiles: string[]
  readonly deletedDirs: string[]
}

/**
 * Effect Input Plugin that removes orphaned files in dist/ that have no corresponding source.
 *
 * This plugin compares files in dist/ against corresponding files in src/ and app/,
 * removing any files that don't have a valid source file according to the mapping rules.
 *
 * Mapping Rules:
 * - dist/skills/{name}.md → src/skills/{name}/SKILL.src.md OR src/skills/{name}.src.md
 * - dist/commands/{name}.md → src/commands/{name}.src.md
 * - dist/agents/{name}.md → src/agents/{name}.src.md
 * - dist/app/{name}.md → app/{name}.src.md
 * - dist/{type}/{path} (non-.md) → src/{type}/{path} or app/{path} (direct mapping)
 *
 * Features:
 * - Scans dist/skills/, dist/commands/, dist/agents/, dist/app/ directories
 * - Applies mapping rules to find expected source files
 * - Deletes orphaned files that have no corresponding source
 * - Removes empty directories bottom-up after cleanup
 * - Supports dry-run mode for previewing operations
 *
 * @example
 * ```
 * dist/skills/old-skill.md  (no src/skills/old-skill/SKILL.src.md) → deleted
 * dist/commands/removed.md  (no src/commands/removed.src.md) → deleted
 * dist/skills/valid.md      (has src/skills/valid/SKILL.src.md) → kept
 * ```
 */
export class OrphanFileCleanupEffectInputPlugin extends AbstractInputPlugin {
  constructor() {
    super('OrphanFileCleanupEffectInputPlugin')
    this.registerEffect('orphan-file-cleanup', this.cleanupOrphanFiles.bind(this), 20)
  }

  /**
   * Effect handler that removes orphaned files in dist/.
   */
  private async cleanupOrphanFiles(ctx: InputEffectContext): Promise<OrphanCleanupEffectResult> {
    const { fs, path, shadowProjectDir, dryRun, logger } = ctx

    const distDir = path.join(shadowProjectDir, 'dist')

    const deletedFiles: string[] = []
    const deletedDirs: string[] = []
    const errors: Array<{ path: string, error: Error }> = []

    // Check if dist/ directory exists (Requirement 2.9)
    if (!fs.existsSync(distDir)) {
      logger.debug({ action: 'orphan-cleanup', message: 'dist/ directory does not exist, skipping', distDir })
      return {
        success: true,
        description: 'dist/ directory does not exist, nothing to clean',
        deletedFiles,
        deletedDirs,
      }
    }

    // Process each subdirectory in dist/
    const distSubDirs = ['skills', 'commands', 'agents', 'app']

    for (const subDir of distSubDirs) {
      const distSubDirPath = path.join(distDir, subDir)
      if (fs.existsSync(distSubDirPath)) {
        this.cleanupDirectory(
          ctx,
          distSubDirPath,
          subDir,
          deletedFiles,
          deletedDirs,
          errors,
          dryRun ?? false,
        )
      }
    }

    const hasErrors = errors.length > 0
    if (hasErrors) {
      logger.warn({ action: 'orphan-cleanup', errors: errors.map((e) => ({ path: e.path, error: e.error.message })) })
    }

    return {
      success: !hasErrors,
      description: dryRun
        ? `Would delete ${deletedFiles.length} files and ${deletedDirs.length} directories`
        : `Deleted ${deletedFiles.length} files and ${deletedDirs.length} directories`,
      deletedFiles,
      deletedDirs,
      ...(hasErrors && { error: new Error(`${errors.length} errors occurred during cleanup`) }),
    }
  }

  /**
   * Clean up orphaned files in a specific dist subdirectory.
   */
  private cleanupDirectory(
    ctx: InputEffectContext,
    distDirPath: string,
    dirType: string,
    deletedFiles: string[],
    deletedDirs: string[],
    errors: Array<{ path: string, error: Error }>,
    dryRun: boolean,
  ): void {
    const { fs, path, shadowProjectDir, logger } = ctx

    let entries: import('node:fs').Dirent[]
    try {
      entries = fs.readdirSync(distDirPath, { withFileTypes: true })
    } catch (error) {
      errors.push({ path: distDirPath, error: error as Error })
      logger.warn({ action: 'orphan-cleanup', message: 'Failed to read directory', path: distDirPath, error: (error as Error).message })
      return
    }

    for (const entry of entries) {
      const entryPath = path.join(distDirPath, entry.name)

      if (entry.isDirectory()) {
        // Recursively clean subdirectories
        this.cleanupDirectory(ctx, entryPath, dirType, deletedFiles, deletedDirs, errors, dryRun)

        // Check if directory is now empty and remove it (Requirement 2.7)
        this.removeEmptyDirectory(ctx, entryPath, deletedDirs, errors, dryRun)
      } else if (entry.isFile()) {
        const isOrphan = this.isOrphanFile(ctx, entryPath, dirType, shadowProjectDir)

        if (isOrphan) {
          if (dryRun) {
            logger.debug({ action: 'orphan-cleanup', dryRun: true, wouldDelete: entryPath })
            deletedFiles.push(entryPath)
          } else {
            try {
              fs.unlinkSync(entryPath)
              deletedFiles.push(entryPath)
              logger.debug({ action: 'orphan-cleanup', deleted: entryPath })
            } catch (error) {
              errors.push({ path: entryPath, error: error as Error })
              logger.warn({ action: 'orphan-cleanup', message: 'Failed to delete file', path: entryPath, error: (error as Error).message })
            }
          }
        }
      }
    }
  }

  /**
   * Check if a file in dist/ is an orphan (no corresponding source file).
   */
  private isOrphanFile(
    ctx: InputEffectContext,
    distFilePath: string,
    dirType: string,
    shadowProjectDir: string,
  ): boolean {
    const { fs, path } = ctx

    const fileName = path.basename(distFilePath)
    const isMdFile = fileName.endsWith('.md')

    // Get relative path from dist/{dirType}/ to the file
    const distTypeDir = path.join(shadowProjectDir, 'dist', dirType)
    const relativeFromType = path.relative(distTypeDir, distFilePath)
    const relativeDir = path.dirname(relativeFromType)
    const baseName = fileName.replace(/\.md$/, '')

    if (isMdFile) {
      // Apply mapping rules for .md files (Requirements 2.2, 2.3, 2.4, 2.5)
      const possibleSrcPaths = this.getPossibleSourcePaths(path, shadowProjectDir, dirType, baseName, relativeDir)

      return !possibleSrcPaths.some((srcPath) => fs.existsSync(srcPath))
    } else {
      // For non-.md files, check direct mapping (Requirement 2.6)
      // Build possible source paths based on directory type
      const possibleSrcPaths: string[] = []

      if (dirType === 'app') {
        // dist/app/{path} → app/{path}
        possibleSrcPaths.push(path.join(shadowProjectDir, 'app', relativeFromType))
      } else {
        // dist/{type}/{path} → src/{type}/{path}
        possibleSrcPaths.push(path.join(shadowProjectDir, 'src', dirType, relativeFromType))
      }

      return !possibleSrcPaths.some((srcPath) => fs.existsSync(srcPath))
    }
  }

  /**
   * Get possible source paths for a .md file in dist/.
   */
  private getPossibleSourcePaths(
    nodePath: typeof import('node:path'),
    shadowProjectDir: string,
    dirType: string,
    baseName: string,
    relativeDir: string,
  ): string[] {
    switch (dirType) {
      case 'skills':
        // dist/skills/{name}.md → src/skills/{name}/SKILL.cn.mdx OR src/skills/{name}.cn.mdx
        // dist/skills/{name}/{sub}.md → src/skills/{name}/{sub}.cn.mdx
        if (relativeDir === '.') {
          // Top-level skill file
          return [
            nodePath.join(shadowProjectDir, 'src', 'skills', baseName, 'SKILL.cn.mdx'),
            nodePath.join(shadowProjectDir, 'src', 'skills', `${baseName}.cn.mdx`),
          ]
        } else {
          // Nested skill file (e.g., dist/skills/api-convention/timestamp.md)
          return [
            nodePath.join(shadowProjectDir, 'src', 'skills', relativeDir, `${baseName}.cn.mdx`),
          ]
        }
      case 'commands':
        // dist/commands/{name}.md → src/commands/{name}.cn.mdx
        // dist/commands/{sub}/{name}.md → src/commands/{sub}/{name}.cn.mdx
        if (relativeDir === '.') {
          return [
            nodePath.join(shadowProjectDir, 'src', 'commands', `${baseName}.cn.mdx`),
          ]
        } else {
          return [
            nodePath.join(shadowProjectDir, 'src', 'commands', relativeDir, `${baseName}.cn.mdx`),
          ]
        }
      case 'agents':
        // dist/agents/{name}.md → src/agents/{name}.cn.mdx
        // dist/agents/{sub}/{name}.md → src/agents/{sub}/{name}.cn.mdx
        if (relativeDir === '.') {
          return [
            nodePath.join(shadowProjectDir, 'src', 'agents', `${baseName}.cn.mdx`),
          ]
        } else {
          return [
            nodePath.join(shadowProjectDir, 'src', 'agents', relativeDir, `${baseName}.cn.mdx`),
          ]
        }
      case 'app':
        // dist/app/{project}/{name}.md → app/{project}/{name}.cn.mdx
        if (relativeDir === '.') {
          return [
            nodePath.join(shadowProjectDir, 'app', `${baseName}.cn.mdx`),
          ]
        } else {
          return [
            nodePath.join(shadowProjectDir, 'app', relativeDir, `${baseName}.cn.mdx`),
          ]
        }
      default:
        return []
    }
  }

  /**
   * Remove a directory if it's empty.
   */
  private removeEmptyDirectory(
    ctx: InputEffectContext,
    dirPath: string,
    deletedDirs: string[],
    errors: Array<{ path: string, error: Error }>,
    dryRun: boolean,
  ): void {
    const { fs, logger } = ctx

    try {
      const entries = fs.readdirSync(dirPath)
      if (entries.length === 0) {
        if (dryRun) {
          logger.debug({ action: 'orphan-cleanup', dryRun: true, wouldDeleteDir: dirPath })
          deletedDirs.push(dirPath)
        } else {
          fs.rmdirSync(dirPath)
          deletedDirs.push(dirPath)
          logger.debug({ action: 'orphan-cleanup', deletedDir: dirPath })
        }
      }
    } catch (error) {
      // Directory might not exist or have permission issues
      errors.push({ path: dirPath, error: error as Error })
      logger.warn({ action: 'orphan-cleanup', message: 'Failed to check/remove directory', path: dirPath, error: (error as Error).message })
    }
  }

  /**
   * Collect method returns empty - this plugin only performs effects.
   */
  collect(_ctx: InputPluginContext): Partial<CollectedInputContext> {
    return {}
  }
}
