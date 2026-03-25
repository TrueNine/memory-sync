import type {InputCapabilityContext, InputCollectedContext, InputEffectContext, InputEffectResult} from '../plugins/plugin-core'
import {buildFileOperationDiagnostic} from '@/diagnostics'
import {AbstractInputCapability, hasSourcePromptExtension} from '../plugins/plugin-core'
import {compactDeletionTargets} from '../cleanup/delete-targets'
import {deleteTargets} from '../core/desk-paths'

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
    const compactedPlan = compactDeletionTargets(plan.filesToDelete, plan.dirsToDelete)

    if (dryRun) {
      return {
        success: true,
        description: `Would delete ${compactedPlan.files.length} files and ${compactedPlan.dirs.length} directories`,
        deletedFiles: [...compactedPlan.files],
        deletedDirs: [...compactedPlan.dirs]
      }
    }

    const deleteErrors: {path: string, error: Error}[] = [...plan.errors]
    logger.debug('skill dist cleanup delete execution started', {
      filesToDelete: compactedPlan.files.length,
      dirsToDelete: compactedPlan.dirs.length
    })

    const result = await deleteTargets({
      files: compactedPlan.files,
      dirs: compactedPlan.dirs
    })

    for (const fileError of result.fileErrors) {
      const normalizedError = fileError.error instanceof Error ? fileError.error : new Error(String(fileError.error))
      deleteErrors.push({path: fileError.path, error: normalizedError})
      logger.warn(buildFileOperationDiagnostic({
        code: 'SKILL_DIST_CLEANUP_FILE_DELETE_FAILED',
        title: 'Skill dist cleanup could not delete a file',
        operation: 'delete',
        targetKind: 'skill dist file',
        path: fileError.path,
        error: normalizedError
      }))
    }

    for (const dirError of result.dirErrors) {
      const normalizedError = dirError.error instanceof Error ? dirError.error : new Error(String(dirError.error))
      deleteErrors.push({path: dirError.path, error: normalizedError})
      logger.warn(buildFileOperationDiagnostic({
        code: 'SKILL_DIST_CLEANUP_DIRECTORY_DELETE_FAILED',
        title: 'Skill dist cleanup could not delete a directory',
        operation: 'delete',
        targetKind: 'skill dist directory',
        path: dirError.path,
        error: normalizedError
      }))
    }

    logger.debug('skill dist cleanup delete execution complete', {
      deletedFiles: result.deletedFiles.length,
      deletedDirs: result.deletedDirs.length,
      errors: deleteErrors.length
    })

    const hasErrors = deleteErrors.length > 0
    return {
      success: !hasErrors,
      description: `Deleted ${result.deletedFiles.length} files and ${result.deletedDirs.length} directories`,
      deletedFiles: [...result.deletedFiles],
      deletedDirs: [...result.deletedDirs],
      ...hasErrors && {error: new Error(`${deleteErrors.length} errors occurred during cleanup`)}
    }
  }

  private buildCleanupPlan(ctx: InputEffectContext, distSkillsDir: string): SkillDistCleanupPlan {
    const filesToDelete: string[] = []
    const dirsToDelete: string[] = []
    const errors: {path: string, error: Error}[] = []

    const rootWillBeEmpty = this.collectCleanupPlan(ctx, distSkillsDir, filesToDelete, dirsToDelete, errors)
    if (rootWillBeEmpty) dirsToDelete.push(distSkillsDir)

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

  collect(ctx: InputCapabilityContext): Partial<InputCollectedContext> {
    void ctx
    return {}
  }
}

export type SkillSyncEffectResult = SkillDistCleanupEffectResult

export class SkillNonSrcFileSyncEffectInputCapability extends SkillDistCleanupEffectInputCapability {}
