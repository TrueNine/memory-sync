import type {Buffer} from 'node:buffer'

import type {InputCollectedContext, InputEffectContext, InputEffectResult, InputPluginContext} from '../plugins/plugin-core'
import {createHash} from 'node:crypto'
import {AbstractInputPlugin} from '../plugins/plugin-core'

export interface SkillSyncEffectResult extends InputEffectResult {
  readonly copiedFiles: string[]
  readonly skippedFiles: string[]
  readonly createdDirs: string[]
}

export class SkillNonSrcFileSyncEffectInputPlugin extends AbstractInputPlugin {
  constructor() {
    super('SkillNonSrcFileSyncEffectInputPlugin')
    this.registerEffect('skill-non-src-file-sync', this.syncNonSrcFiles.bind(this), 10)
  }

  private async syncNonSrcFiles(ctx: InputEffectContext): Promise<SkillSyncEffectResult> {
    const {fs, path, aindexDir, dryRun, logger} = ctx

    const srcSkillsDir = path.join(aindexDir, 'src', 'skills')
    const distSkillsDir = path.join(aindexDir, 'dist', 'skills')

    const copiedFiles: string[] = []
    const skippedFiles: string[] = []
    const createdDirs: string[] = []
    const errors: {path: string, error: Error}[] = []

    if (!fs.existsSync(srcSkillsDir)) {
      logger.debug({action: 'skill-sync', message: 'src/skills/ directory does not exist, skipping', srcSkillsDir})
      return {
        success: true,
        description: 'src/skills/ directory does not exist, nothing to sync',
        copiedFiles,
        skippedFiles,
        createdDirs
      }
    }

    this.syncDirectoryRecursive(
      ctx,
      srcSkillsDir,
      distSkillsDir,
      '',
      copiedFiles,
      skippedFiles,
      createdDirs,
      errors,
      dryRun ?? false
    )

    const hasErrors = errors.length > 0
    if (hasErrors) logger.warn({action: 'skill-sync', errors: errors.map(e => ({path: e.path, error: e.error.message}))})

    return {
      success: !hasErrors,
      description: dryRun
        ? `Would copy ${copiedFiles.length} files, skip ${skippedFiles.length} files`
        : `Copied ${copiedFiles.length} files, skipped ${skippedFiles.length} files`,
      copiedFiles,
      skippedFiles,
      createdDirs,
      ...hasErrors && {error: new Error(`${errors.length} errors occurred during sync`)},
      modifiedFiles: copiedFiles
    }
  }

  private syncDirectoryRecursive(
    ctx: InputEffectContext,
    srcDir: string,
    distDir: string,
    relativePath: string,
    copiedFiles: string[],
    skippedFiles: string[],
    createdDirs: string[],
    errors: {path: string, error: Error}[],
    dryRun: boolean
  ): void {
    const {fs, path, logger} = ctx

    const currentSrcDir = relativePath ? path.join(srcDir, relativePath) : srcDir

    if (!fs.existsSync(currentSrcDir)) return

    let entries: import('node:fs').Dirent[]
    try {
      entries = fs.readdirSync(currentSrcDir, {withFileTypes: true})
    }
    catch (error) {
      errors.push({path: currentSrcDir, error: error as Error})
      logger.warn({action: 'skill-sync', message: 'Failed to read directory', path: currentSrcDir, error: (error as Error).message})
      return
    }

    for (const entry of entries) {
      const entryRelativePath = relativePath ? path.join(relativePath, entry.name) : entry.name
      const srcPath = path.join(srcDir, entryRelativePath)
      const distPath = path.join(distDir, entryRelativePath)

      if (entry.isDirectory()) {
        this.syncDirectoryRecursive(
          ctx,
          srcDir,
          distDir,
          entryRelativePath,
          copiedFiles,
          skippedFiles,
          createdDirs,
          errors,
          dryRun
        )
      } else if (entry.isFile()) {
        if (entry.name.endsWith('.cn.mdx')) continue

        const targetDir = path.dirname(distPath)
        if (!fs.existsSync(targetDir)) {
          if (dryRun) {
            logger.debug({action: 'skill-sync', dryRun: true, wouldCreateDir: targetDir})
            createdDirs.push(targetDir)
          } else {
            try {
              fs.mkdirSync(targetDir, {recursive: true})
              createdDirs.push(targetDir)
              logger.debug({action: 'skill-sync', createdDir: targetDir})
            }
            catch (error) {
              errors.push({path: targetDir, error: error as Error})
              logger.warn({action: 'skill-sync', message: 'Failed to create directory', path: targetDir, error: (error as Error).message})
              continue
            }
          }
        }

        if (fs.existsSync(distPath)) {
          try {
            const srcContent = fs.readFileSync(srcPath)
            const distContent = fs.readFileSync(distPath)

            const srcHash = this.computeHash(srcContent)
            const distHash = this.computeHash(distContent)

            if (srcHash === distHash) {
              skippedFiles.push(distPath)
              logger.debug({action: 'skill-sync', skipped: distPath, reason: 'identical content'})
              continue
            }
          }
          catch (error) {
            logger.debug({action: 'skill-sync', message: 'Could not compare files, will copy', path: distPath, error: (error as Error).message})
          }
        }

        if (dryRun) {
          logger.debug({action: 'skill-sync', dryRun: true, wouldCopy: {from: srcPath, to: distPath}})
          copiedFiles.push(distPath)
        } else {
          try {
            fs.copyFileSync(srcPath, distPath)
            copiedFiles.push(distPath)
            logger.debug({action: 'skill-sync', copied: {from: srcPath, to: distPath}})
          }
          catch (error) {
            errors.push({path: distPath, error: error as Error})
            logger.warn({action: 'skill-sync', message: 'Failed to copy file', from: srcPath, to: distPath, error: (error as Error).message})
          }
        }
      }
    }
  }

  private computeHash(content: Buffer): string {
    return createHash('sha256').update(content).digest('hex')
  }

  collect(_ctx: InputPluginContext): Partial<InputCollectedContext> {
    return {}
  }
}
