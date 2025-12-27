import type { Buffer } from 'node:buffer'
import type { InputEffectContext, InputEffectResult } from './AbstractInputPlugin'

import type { CollectedInputContext, InputPluginContext } from '@/types'
import { createHash } from 'node:crypto'
import { AbstractInputPlugin } from './AbstractInputPlugin'

/**
 * Result of the skill non-.src.md file sync effect.
 */
export interface SkillSyncEffectResult extends InputEffectResult {
  readonly copiedFiles: string[]
  readonly skippedFiles: string[]
  readonly createdDirs: string[]
}

/**
 * Effect Input Plugin that syncs non-.src.md files from src/skills/ to dist/skills/.
 *
 * This plugin copies supporting files (scripts, examples, configs, etc.) from skill source
 * directories to their corresponding distribution directories, preserving relative paths.
 *
 * Features:
 * - Recursively scans src/skills/{skill_name}/ subdirectories
 * - Filters out .src.md files (only syncs non-.src.md files)
 * - Creates target directories as needed
 * - Skips files with identical content (compares hash)
 * - Supports dry-run mode for previewing operations
 *
 * @example
 * ```
 * src/skills/my-skill/
 *   ├── SKILL.src.md      (ignored - .src.md file)
 *   ├── example.ts        (copied to dist/skills/my-skill/example.ts)
 *   └── scripts/
 *       └── helper.sh     (copied to dist/skills/my-skill/scripts/helper.sh)
 * ```
 */
export class SkillNonSrcFileSyncEffectInputPlugin extends AbstractInputPlugin {
  constructor() {
    super('SkillNonSrcFileSyncEffectInputPlugin')
    this.registerEffect('skill-non-src-file-sync', this.syncNonSrcFiles.bind(this), 10)
  }

  /**
   * Effect handler that syncs non-.src.md files from src/skills/ to dist/skills/.
   */
  private async syncNonSrcFiles(ctx: InputEffectContext): Promise<SkillSyncEffectResult> {
    const { fs, path, shadowProjectDir, dryRun, logger } = ctx

    const srcSkillsDir = path.join(shadowProjectDir, 'src', 'skills')
    const distSkillsDir = path.join(shadowProjectDir, 'dist', 'skills')

    const copiedFiles: string[] = []
    const skippedFiles: string[] = []
    const createdDirs: string[] = []
    const errors: Array<{ path: string, error: Error }> = []

    // Check if src/skills/ directory exists (Requirement 1.6)
    if (!fs.existsSync(srcSkillsDir)) {
      logger.debug({ action: 'skill-sync', message: 'src/skills/ directory does not exist, skipping', srcSkillsDir })
      return {
        success: true,
        description: 'src/skills/ directory does not exist, nothing to sync',
        copiedFiles,
        skippedFiles,
        createdDirs,
      }
    }

    // Recursively scan and sync files
    this.syncDirectoryRecursive(
      ctx,
      srcSkillsDir,
      distSkillsDir,
      '',
      copiedFiles,
      skippedFiles,
      createdDirs,
      errors,
      dryRun ?? false,
    )

    const hasErrors = errors.length > 0
    if (hasErrors) {
      logger.warn({ action: 'skill-sync', errors: errors.map((e) => ({ path: e.path, error: e.error.message })) })
    }

    return {
      success: !hasErrors,
      description: dryRun
        ? `Would copy ${copiedFiles.length} files, skip ${skippedFiles.length} files`
        : `Copied ${copiedFiles.length} files, skipped ${skippedFiles.length} files`,
      copiedFiles,
      skippedFiles,
      createdDirs,
      ...(hasErrors && { error: new Error(`${errors.length} errors occurred during sync`) }),
      modifiedFiles: copiedFiles,
    }
  }

  /**
   * Recursively sync non-.src.md files from source to destination directory.
   */
  private syncDirectoryRecursive(
    ctx: InputEffectContext,
    srcDir: string,
    distDir: string,
    relativePath: string,
    copiedFiles: string[],
    skippedFiles: string[],
    createdDirs: string[],
    errors: Array<{ path: string, error: Error }>,
    dryRun: boolean,
  ): void {
    const { fs, path, logger } = ctx

    const currentSrcDir = relativePath ? path.join(srcDir, relativePath) : srcDir

    // Check if source directory exists
    if (!fs.existsSync(currentSrcDir)) {
      return
    }

    let entries: import('node:fs').Dirent[]
    try {
      entries = fs.readdirSync(currentSrcDir, { withFileTypes: true })
    } catch (error) {
      errors.push({ path: currentSrcDir, error: error as Error })
      logger.warn({ action: 'skill-sync', message: 'Failed to read directory', path: currentSrcDir, error: (error as Error).message })
      return
    }

    for (const entry of entries) {
      const entryRelativePath = relativePath ? path.join(relativePath, entry.name) : entry.name
      const srcPath = path.join(srcDir, entryRelativePath)
      const distPath = path.join(distDir, entryRelativePath)

      if (entry.isDirectory()) {
        // Recursively process subdirectories
        this.syncDirectoryRecursive(
          ctx,
          srcDir,
          distDir,
          entryRelativePath,
          copiedFiles,
          skippedFiles,
          createdDirs,
          errors,
          dryRun,
        )
      } else if (entry.isFile()) {
        // Skip .src.md files (Requirement 1.2)
        if (entry.name.endsWith('.src.md')) {
          continue
        }

        // Check if target directory needs to be created (Requirement 1.3)
        const targetDir = path.dirname(distPath)
        if (!fs.existsSync(targetDir)) {
          if (dryRun) {
            logger.debug({ action: 'skill-sync', dryRun: true, wouldCreateDir: targetDir })
            createdDirs.push(targetDir)
          } else {
            try {
              fs.mkdirSync(targetDir, { recursive: true })
              createdDirs.push(targetDir)
              logger.debug({ action: 'skill-sync', createdDir: targetDir })
            } catch (error) {
              errors.push({ path: targetDir, error: error as Error })
              logger.warn({ action: 'skill-sync', message: 'Failed to create directory', path: targetDir, error: (error as Error).message })
              continue
            }
          }
        }

        // Check if file already exists with identical content (Requirement 1.4)
        if (fs.existsSync(distPath)) {
          try {
            const srcContent = fs.readFileSync(srcPath)
            const distContent = fs.readFileSync(distPath)

            const srcHash = this.computeHash(srcContent)
            const distHash = this.computeHash(distContent)

            if (srcHash === distHash) {
              skippedFiles.push(distPath)
              logger.debug({ action: 'skill-sync', skipped: distPath, reason: 'identical content' })
              continue
            }
          } catch (error) {
            // If we can't read the file, proceed with copy
            logger.debug({ action: 'skill-sync', message: 'Could not compare files, will copy', path: distPath, error: (error as Error).message })
          }
        }

        // Copy file (Requirement 1.2, 1.5)
        if (dryRun) {
          logger.debug({ action: 'skill-sync', dryRun: true, wouldCopy: { from: srcPath, to: distPath } })
          copiedFiles.push(distPath)
        } else {
          try {
            fs.copyFileSync(srcPath, distPath)
            copiedFiles.push(distPath)
            logger.debug({ action: 'skill-sync', copied: { from: srcPath, to: distPath } })
          } catch (error) {
            errors.push({ path: distPath, error: error as Error })
            logger.warn({ action: 'skill-sync', message: 'Failed to copy file', from: srcPath, to: distPath, error: (error as Error).message })
          }
        }
      }
    }
  }

  /**
   * Compute SHA-256 hash of file content for comparison.
   */
  private computeHash(content: Buffer): string {
    return createHash('sha256').update(content).digest('hex')
  }

  /**
   * Collect method returns empty - this plugin only performs effects.
   */
  collect(_ctx: InputPluginContext): Partial<CollectedInputContext> {
    return {}
  }
}
