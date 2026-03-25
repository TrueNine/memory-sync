import type {InputCapabilityContext, InputCollectedContext, InputEffectContext, InputEffectResult} from '../plugins/plugin-core'
import {buildFileOperationDiagnostic} from '@/diagnostics'
import {compactDeletionTargets} from '../cleanup/delete-targets'
import {deleteTargets} from '../core/desk-paths'
import {AbstractInputCapability, SourcePromptFileExtensions} from '../plugins/plugin-core'
import {
  collectConfiguredAindexInputRules,
  createProtectedDeletionGuard,
  partitionDeletionTargets,
  ProtectedDeletionGuardError
} from '../ProtectedDeletionGuard'

export interface OrphanCleanupEffectResult extends InputEffectResult {
  readonly deletedFiles: string[]
  readonly deletedDirs: string[]
}

const OrphanCleanupDistSubDirs = ['skills', 'commands', 'agents', 'app'] as const

type OrphanCleanupSubDir = (typeof OrphanCleanupDistSubDirs)[number]

type OrphanCleanupSourcePaths = Readonly<Record<OrphanCleanupSubDir, string>>

interface OrphanCleanupPlan {
  readonly filesToDelete: string[]
  readonly dirsToDelete: string[]
  readonly errors: readonly {path: string, error: Error}[]
}

export class OrphanFileCleanupEffectInputCapability extends AbstractInputCapability {
  constructor() {
    super('OrphanFileCleanupEffectInputCapability')
    this.registerEffect('orphan-file-cleanup', this.cleanupOrphanFiles.bind(this), 20)
  }

  protected buildProtectedDeletionGuard(ctx: InputEffectContext): ReturnType<typeof createProtectedDeletionGuard> {
    return createProtectedDeletionGuard({
      workspaceDir: ctx.workspaceDir,
      aindexDir: ctx.aindexDir,
      rules: [
        ...collectConfiguredAindexInputRules(ctx.userConfigOptions, ctx.aindexDir, {
          workspaceDir: ctx.workspaceDir
        }),
        ...(ctx.userConfigOptions.cleanupProtection?.rules ?? []).map(rule => ({
          path: rule.path,
          protectionMode: rule.protectionMode,
          reason: rule.reason ?? 'configured cleanup protection rule',
          source: 'configured-cleanup-protection',
          matcher: rule.matcher ?? 'path'
        }))
      ]
    })
  }

  protected buildDeletionPlan(
    ctx: InputEffectContext,
    distDir: string,
    srcPaths: OrphanCleanupSourcePaths
  ): OrphanCleanupPlan {
    const filesToDelete: string[] = []
    const dirsToDelete: string[] = []
    const errors: {path: string, error: Error}[] = []

    for (const subDir of OrphanCleanupDistSubDirs) {
      const distSubDirPath = ctx.path.join(distDir, subDir)
      if (!ctx.fs.existsSync(distSubDirPath)) continue
      if (!ctx.fs.statSync(distSubDirPath).isDirectory()) continue
      const subDirWillBeEmpty = this.collectDirectoryPlan(ctx, distSubDirPath, subDir, srcPaths[subDir], filesToDelete, dirsToDelete, errors)
      if (subDirWillBeEmpty) dirsToDelete.push(distSubDirPath)
    }

    return {filesToDelete, dirsToDelete, errors}
  }

  private async cleanupOrphanFiles(ctx: InputEffectContext): Promise<OrphanCleanupEffectResult> {
    const {fs, path, aindexDir, logger, userConfigOptions, dryRun} = ctx
    const distDir = path.join(aindexDir, 'dist')

    if (!fs.existsSync(distDir)) {
      logger.debug({action: 'orphan-cleanup', message: 'dist/ directory does not exist, skipping', distDir})
      return {
        success: true,
        description: 'dist/ directory does not exist, nothing to clean',
        deletedFiles: [],
        deletedDirs: []
      }
    }

    const aindexConfig = userConfigOptions.aindex
    const srcPaths: OrphanCleanupSourcePaths = {
      skills: aindexConfig?.skills?.src ?? 'skills',
      commands: aindexConfig?.commands?.src ?? 'commands',
      agents: aindexConfig?.subAgents?.src ?? 'subagents',
      app: aindexConfig?.app?.src ?? 'app'
    }

    const plan = this.buildDeletionPlan(ctx, distDir, srcPaths)

    const guard = this.buildProtectedDeletionGuard(ctx)
    const filePartition = partitionDeletionTargets(plan.filesToDelete, guard)
    const dirPartition = partitionDeletionTargets(plan.dirsToDelete, guard)
    const compactedPlan = compactDeletionTargets(filePartition.safePaths, dirPartition.safePaths)
    const violations = [...filePartition.violations, ...dirPartition.violations].sort((a, b) => a.targetPath.localeCompare(b.targetPath))

    if (violations.length > 0) {
      return {
        success: false,
        description: `Protected deletion guard blocked orphan cleanup for ${violations.length} path(s)`,
        deletedFiles: [],
        deletedDirs: [],
        error: new ProtectedDeletionGuardError('orphan-file-cleanup', violations)
      }
    }

    if (dryRun) {
      return {
        success: true,
        description: `Would delete ${compactedPlan.files.length} files and ${compactedPlan.dirs.length} directories`,
        deletedFiles: [...compactedPlan.files],
        deletedDirs: [...compactedPlan.dirs]
      }
    }

    const deleteErrors: {path: string, error: Error}[] = [...plan.errors]
    logger.debug('orphan cleanup delete execution started', {
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
        code: 'ORPHAN_CLEANUP_FILE_DELETE_FAILED',
        title: 'Orphan cleanup could not delete a file',
        operation: 'delete',
        targetKind: 'orphan file',
        path: fileError.path,
        error: normalizedError
      }))
    }

    for (const dirError of result.dirErrors) {
      const normalizedError = dirError.error instanceof Error ? dirError.error : new Error(String(dirError.error))
      deleteErrors.push({path: dirError.path, error: normalizedError})
      logger.warn(buildFileOperationDiagnostic({
        code: 'ORPHAN_CLEANUP_DIRECTORY_DELETE_FAILED',
        title: 'Orphan cleanup could not delete a directory',
        operation: 'delete',
        targetKind: 'orphan directory',
        path: dirError.path,
        error: normalizedError
      }))
    }

    logger.debug('orphan cleanup delete execution complete', {
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

  protected collectDirectoryPlan(
    ctx: InputEffectContext,
    distDirPath: string,
    dirType: string,
    srcPath: string,
    filesToDelete: string[],
    dirsToDelete: string[],
    errors: {path: string, error: Error}[]
  ): boolean {
    const {fs, path, aindexDir, logger} = ctx

    let entries: import('node:fs').Dirent[]
    try {
      entries = fs.readdirSync(distDirPath, {withFileTypes: true})
    }
    catch (error) {
      errors.push({path: distDirPath, error: error as Error})
      logger.warn(buildFileOperationDiagnostic({
        code: 'ORPHAN_CLEANUP_DIRECTORY_READ_FAILED',
        title: 'Orphan cleanup could not read a directory',
        operation: 'read',
        targetKind: 'dist cleanup directory',
        path: distDirPath,
        error
      }))
      return false
    }

    let hasRetainedEntries = false

    for (const entry of entries) {
      const entryPath = path.join(distDirPath, entry.name)

      if (entry.isDirectory()) {
        const childWillBeEmpty = this.collectDirectoryPlan(ctx, entryPath, dirType, srcPath, filesToDelete, dirsToDelete, errors)
        if (childWillBeEmpty) dirsToDelete.push(entryPath)
        else hasRetainedEntries = true
        continue
      }

      if (!entry.isFile()) {
        hasRetainedEntries = true
        continue
      }

      const isOrphan = this.isOrphanFile(ctx, entryPath, dirType, srcPath, aindexDir)
      if (isOrphan) filesToDelete.push(entryPath)
      else hasRetainedEntries = true
    }

    return !hasRetainedEntries
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

    if (!isMdxFile) return !fs.existsSync(path.join(aindexDir, srcPath, relativeFromType))

    const possibleSrcPaths = this.getPossibleSourcePaths(path, aindexDir, dirType, srcPath, baseName, relativeDir)
    return !possibleSrcPaths.some(candidatePath => fs.existsSync(candidatePath))
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

        if (remainingPath !== '') {
          return SourcePromptFileExtensions.map(extension => nodePath.join(aindexDir, srcPath, skillName, remainingPath, `${baseName}${extension}`))
        }

        return [
          ...SourcePromptFileExtensions.map(extension => nodePath.join(aindexDir, srcPath, skillName, `SKILL${extension}`)),
          ...SourcePromptFileExtensions.map(extension => nodePath.join(aindexDir, srcPath, skillName, `skill${extension}`))
        ]
      }
      case 'commands':
      case 'agents':
      case 'app':
        return relativeDir === '.'
          ? SourcePromptFileExtensions.map(extension => nodePath.join(aindexDir, srcPath, `${baseName}${extension}`))
          : SourcePromptFileExtensions.map(extension => nodePath.join(aindexDir, srcPath, relativeDir, `${baseName}${extension}`))
      default: return []
    }
  }

  collect(ctx: InputCapabilityContext): Partial<InputCollectedContext> {
    void ctx
    return {}
  }
}
