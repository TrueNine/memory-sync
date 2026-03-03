import type {CollectedInputContext, InputEffectContext, InputEffectResult, InputPluginContext} from '../plugins/plugin-shared'
import {AbstractInputPlugin} from '@truenine/plugin-input-shared'

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
    const {fs, path, aindexDir, dryRun, logger, userConfigOptions} = ctx

    const distDir = path.join(aindexDir, 'dist')

    const deletedFiles: string[] = []
    const deletedDirs: string[] = []
    const errors: {path: string, error: Error}[] = []

    if (!fs.existsSync(distDir)) {
      logger.debug({action: 'orphan-cleanup', message: 'dist/ directory does not exist, skipping', distDir})
      return {
        success: true,
        description: 'dist/ directory does not exist, nothing to clean',
        deletedFiles,
        deletedDirs
      }
    }

    const aindexConfig = userConfigOptions.aindex
    const srcPaths: Record<string, string> = {
      skills: aindexConfig?.skills?.src ?? 'skills',
      commands: aindexConfig?.commands?.src ?? 'commands',
      agents: aindexConfig?.subAgents?.src ?? 'subagents',
      app: aindexConfig?.app?.src ?? 'app'
    }

    const distSubDirs = ['skills', 'commands', 'agents', 'app']

    for (const subDir of distSubDirs) {
      const distSubDirPath = path.join(distDir, subDir)
      if (fs.existsSync(distSubDirPath)) this.cleanupDirectory(ctx, distSubDirPath, subDir, srcPaths[subDir]!, deletedFiles, deletedDirs, errors, dryRun ?? false)
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
    srcPath: string,
    deletedFiles: string[],
    deletedDirs: string[],
    errors: {path: string, error: Error}[],
    dryRun: boolean
  ): void {
    const {fs, path, aindexDir, logger} = ctx

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
        this.cleanupDirectory(ctx, entryPath, dirType, srcPath, deletedFiles, deletedDirs, errors, dryRun)
        this.removeEmptyDirectory(ctx, entryPath, deletedDirs, errors, dryRun)
      } else if (entry.isFile()) {
        const isOrphan = this.isOrphanFile(ctx, entryPath, dirType, srcPath, aindexDir)

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
    srcPath: string,
    aindexDir: string
  ): boolean {
    const {fs, path} = ctx

    const fileName = path.basename(distFilePath)
    const isMdxFile = fileName.endsWith('.mdx')

    const distTypeDir = path.join(aindexDir, 'dist', dirType)
    const relativeFromType = path.relative(distTypeDir, distFilePath)
    const relativeDir = path.dirname(relativeFromType)
    const baseName = fileName.replace(/\.mdx$/, '')

    if (isMdxFile) {
      const possibleSrcPaths = this.getPossibleSourcePaths(path, aindexDir, dirType, srcPath, baseName, relativeDir)
      return !possibleSrcPaths.some(srcPath => fs.existsSync(srcPath))
    }
    const possibleSrcPaths: string[] = []
    possibleSrcPaths.push(path.join(aindexDir, srcPath, relativeFromType))
    return !possibleSrcPaths.some(srcPath => fs.existsSync(srcPath))
  }

  private getPossibleSourcePaths(
    nodePath: typeof import('node:path'),
    aindexDir: string,
    dirType: string,
    srcPath: string,
    baseName: string,
    relativeDir: string
  ): string[] {
    switch (dirType) {
      case 'skills': {
        const skillParts = relativeDir === '.' ? [baseName] : relativeDir.split(nodePath.sep)
        const skillName = skillParts[0] ?? baseName
        const remainingPath = relativeDir === '.' ? '' : relativeDir.slice(skillName.length + 1)

        if (remainingPath !== '') return [nodePath.join(aindexDir, srcPath, skillName, remainingPath, `${baseName}.cn.mdx`)]
        return [
          nodePath.join(aindexDir, srcPath, skillName, 'SKILL.cn.mdx'),
          nodePath.join(aindexDir, srcPath, skillName, 'skill.cn.mdx')
        ]
      }
      case 'commands':
        return relativeDir === '.'
          ? [nodePath.join(aindexDir, srcPath, `${baseName}.cn.mdx`)]
          : [nodePath.join(aindexDir, srcPath, relativeDir, `${baseName}.cn.mdx`)]
      case 'agents':
        return relativeDir === '.'
          ? [nodePath.join(aindexDir, srcPath, `${baseName}.cn.mdx`)]
          : [nodePath.join(aindexDir, srcPath, relativeDir, `${baseName}.cn.mdx`)]
      case 'app':
        return relativeDir === '.'
          ? [nodePath.join(aindexDir, srcPath, `${baseName}.cn.mdx`)]
          : [nodePath.join(aindexDir, srcPath, relativeDir, `${baseName}.cn.mdx`)]
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
      errors.push({path: dirPath, error: error as Error})
      logger.warn({action: 'orphan-cleanup', message: 'Failed to check/remove directory', path: dirPath, error: (error as Error).message})
    }
  }

  collect(_ctx: InputPluginContext): Partial<CollectedInputContext> {
    return {}
  }
}
