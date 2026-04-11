import type {Buffer} from 'node:buffer'

export interface DeletionError {
  readonly path: string
  readonly error: unknown
}

export interface DeletionResult {
  readonly deleted: number
  readonly deletedPaths: readonly string[]
  readonly errors: readonly DeletionError[]
}

export interface DeleteTargetsResult {
  readonly deletedFiles: readonly string[]
  readonly deletedDirs: readonly string[]
  readonly fileErrors: readonly DeletionError[]
  readonly dirErrors: readonly DeletionError[]
}

export interface CompactedDeletionTargets {
  readonly files: string[]
  readonly dirs: string[]
}

export interface WorkspaceEmptyDirectoryPlan {
  readonly emptyDirsToDelete: string[]
}

export interface NativeDeskPathsBinding {
  readonly getPlatformFixedDir?: () => string
  readonly ensureDir?: (dir: string) => void
  readonly existsSync?: (targetPath: string) => boolean
  readonly deletePathSync?: (targetPath: string) => void
  readonly writeFileSync?: (filePath: string, data: string | Buffer, encoding?: BufferEncoding) => void
  readonly readFileSync?: (filePath: string, encoding?: BufferEncoding) => string
  readonly deleteFiles?: (files: readonly string[]) => DeletionResult | Promise<DeletionResult>
  readonly deleteDirectories?: (dirs: readonly string[]) => DeletionResult | Promise<DeletionResult>
  readonly deleteEmptyDirectories?: (dirs: readonly string[]) => DeletionResult | Promise<DeletionResult>
  readonly deleteTargets?: (targets: {
    readonly files?: readonly string[]
    readonly dirs?: readonly string[]
  }) => DeleteTargetsResult | Promise<DeleteTargetsResult>
  readonly compactDeletionTargets?: (files: readonly string[], dirs: readonly string[]) => CompactedDeletionTargets | Promise<CompactedDeletionTargets>
  readonly planWorkspaceEmptyDirectoryCleanup?: (
    workspaceDir: string,
    files: readonly string[],
    dirs: readonly string[]
  ) => WorkspaceEmptyDirectoryPlan | Promise<WorkspaceEmptyDirectoryPlan>
  readonly isDirectoryStructureMismatchError?: (error: string) => boolean
  readonly findBlockingNonDirectoryPath?: (expectedDirPath: string) => string | undefined
  readonly resolveBlockingFilePath?: (path: string, targetKind: string, error: string) => string | undefined
  readonly removeBlockingFile?: (blockingPath: string) => boolean
}
