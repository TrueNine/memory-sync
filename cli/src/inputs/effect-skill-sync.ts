import type {InputCapabilityContext, InputCollectedContext, InputEffectContext, InputEffectResult} from '../plugins/plugin-core'
import {buildFileOperationDiagnostic} from '@/diagnostics'
import {AbstractInputCapability, hasSourcePromptExtension} from '../plugins/plugin-core'

export interface SkillDistCleanupEffectResult extends InputEffectResult {
  readonly deletedFiles: string[]
  readonly deletedDirs: string[]
}

interface SkillDistCleanupPlan {
  readonly filesToDelete: string[]
  readonly dirsToDelete: string[]
  readonly errors: readonly {path: string, error: Error}[]
}

export class SkillDistCleanupEffectInputCapability extends AbstractInputCapability {
  constructor() {
    super('SkillDistCleanupEffectInputCapability')
    this.registerEffect('skill-dist-cleanup', this.cleanupDistSkillArtifacts.bind(this), 10)
  }

  private async cleanupDistSkillArtifacts(ctx: InputEffectContext): Promise<SkillDistCleanupEffectResult> {
    const {fs, logger, userConfigOptions, aindexDir, dryRun} = ctx
    const srcSkillsDir = this.resolveAindexPath(userConfigOptions.aindex.skills.src, aindexDir)
    const distSkillsDir = this.resolveAindexPath(userConfigOptions.aindex.skills.dist, aindexDir)

    if (!fs.existsSync(distSkillsDir)) {
      logger.debug({action: 'skill-dist-cleanup', message: 'dist skills directory does not exist, skipping', srcSkillsDir, distSkillsDir})
      return {
        success: true,
        description: 'dist skills directory does not exist, nothing to clean',
        deletedFiles: [],
        deletedDirs: []
      }
    }

    const plan = this.buildCleanupPlan(ctx, distSkillsDir)

    if (dryRun) {
      return {
        success: true,
        description: `Would delete ${plan.filesToDelete.length} files and ${plan.dirsToDelete.length} directories`,
        deletedFiles: [...plan.filesToDelete],
        deletedDirs: [...plan.dirsToDelete].sort((a, b) => b.length - a.length)
      }
    }

    const deletedFiles: string[] = []
    const deletedDirs: string[] = []
    const deleteErrors: {path: string, error: Error}[] = [...plan.errors]

    for (const filePath of plan.filesToDelete) {
      try {
        fs.unlinkSync(filePath)
        deletedFiles.push(filePath)
        logger.debug({action: 'skill-dist-cleanup', deleted: filePath})
      }
      catch (error) {
        deleteErrors.push({path: filePath, error: error as Error})
        logger.warn(buildFileOperationDiagnostic({
          code: 'SKILL_DIST_CLEANUP_FILE_DELETE_FAILED',
          title: 'Skill dist cleanup could not delete a file',
          operation: 'delete',
          targetKind: 'skill dist file',
          path: filePath,
          error
        }))
      }
    }

    for (const dirPath of [...plan.dirsToDelete].sort((a, b) => b.length - a.length)) {
      try {
        fs.rmdirSync(dirPath)
        deletedDirs.push(dirPath)
        logger.debug({action: 'skill-dist-cleanup', deletedDir: dirPath})
      }
      catch (error) {
        deleteErrors.push({path: dirPath, error: error as Error})
        logger.warn(buildFileOperationDiagnostic({
          code: 'SKILL_DIST_CLEANUP_DIRECTORY_DELETE_FAILED',
          title: 'Skill dist cleanup could not delete a directory',
          operation: 'delete',
          targetKind: 'skill dist directory',
          path: dirPath,
          error
        }))
      }
    }

    const hasErrors = deleteErrors.length > 0
    return {
      success: !hasErrors,
      description: `Deleted ${deletedFiles.length} files and ${deletedDirs.length} directories`,
      deletedFiles,
      deletedDirs,
      ...hasErrors && {error: new Error(`${deleteErrors.length} errors occurred during cleanup`)}
    }
  }

  private buildCleanupPlan(ctx: InputEffectContext, distSkillsDir: string): SkillDistCleanupPlan {
    const filesToDelete: string[] = []
    const dirsToDelete: string[] = []
    const errors: {path: string, error: Error}[] = []

    this.collectCleanupPlan(ctx, distSkillsDir, filesToDelete, dirsToDelete, errors)

    return {filesToDelete, dirsToDelete, errors}
  }

  private collectCleanupPlan(
    ctx: InputEffectContext,
    currentDir: string,
    filesToDelete: string[],
    dirsToDelete: string[],
    errors: {path: string, error: Error}[]
  ): boolean {
    const {fs, path, logger} = ctx

    let entries: import('node:fs').Dirent[]
    try {
      entries = fs.readdirSync(currentDir, {withFileTypes: true})
    }
    catch (error) {
      errors.push({path: currentDir, error: error as Error})
      logger.warn(buildFileOperationDiagnostic({
        code: 'SKILL_DIST_CLEANUP_DIRECTORY_READ_FAILED',
        title: 'Skill dist cleanup could not read a directory',
        operation: 'read',
        targetKind: 'skill dist directory',
        path: currentDir,
        error
      }))
      return false
    }

    let hasRetainedEntries = false

    for (const entry of entries) {
      const entryPath = path.join(currentDir, entry.name)

      if (entry.isDirectory()) {
        const childWillBeEmpty = this.collectCleanupPlan(ctx, entryPath, filesToDelete, dirsToDelete, errors)
        if (childWillBeEmpty) dirsToDelete.push(entryPath)
        else hasRetainedEntries = true
        continue
      }

      if (!entry.isFile()) {
        hasRetainedEntries = true
        continue
      }

      if (this.shouldRetainCompiledSkillFile(entry.name)) {
        hasRetainedEntries = true
        continue
      }

      filesToDelete.push(entryPath)
    }

    return !hasRetainedEntries
  }

  private shouldRetainCompiledSkillFile(fileName: string): boolean {
    return fileName.endsWith('.mdx') && !hasSourcePromptExtension(fileName)
  }

  collect(_ctx: InputCapabilityContext): Partial<InputCollectedContext> {
    return {}
  }
}

export type SkillSyncEffectResult = SkillDistCleanupEffectResult

export class SkillNonSrcFileSyncEffectInputCapability extends SkillDistCleanupEffectInputCapability {}
