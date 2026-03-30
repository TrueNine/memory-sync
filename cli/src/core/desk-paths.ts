import type {Buffer} from 'node:buffer'
import {buildFileOperationDiagnostic} from '@/diagnostics'
import {getNativeBinding} from './native-binding'

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

export interface WriteLogger {
  readonly trace: (data: object) => void
  readonly error: (diagnostic: object) => void
}

export interface SafeWriteOptions {
  readonly fullPath: string
  readonly content: string | Buffer
  readonly type: string
  readonly relativePath: string
  readonly dryRun: boolean
  readonly logger: WriteLogger
}

export interface SafeWriteResult {
  readonly path: string
  readonly success: boolean
  readonly skipped?: boolean
  readonly error?: Error
}

interface NativeDeskPathsBinding {
  readonly getPlatformFixedDir?: () => string
  readonly ensureDir?: (dir: string) => void
  readonly existsSync?: (targetPath: string) => boolean
  readonly deletePathSync?: (targetPath: string) => void
  readonly writeFileSync?: (filePath: string, data: string | Buffer, encoding?: BufferEncoding) => void
  readonly readFileSync?: (filePath: string, encoding?: BufferEncoding) => string
  readonly deleteFiles?: (files: readonly string[]) => DeletionResult | Promise<DeletionResult>
  readonly deleteDirectories?: (dirs: readonly string[]) => DeletionResult | Promise<DeletionResult>
  readonly deleteEmptyDirectories?: (dirs: readonly string[]) => DeletionResult | Promise<DeletionResult>
  readonly deleteTargets?: (targets: {readonly files?: readonly string[], readonly dirs?: readonly string[]}) => DeleteTargetsResult | Promise<DeleteTargetsResult>
}

type NativeDeletionResult = DeletionResult & {
  readonly deleted_paths?: readonly string[]
}

type NativeDeleteTargetsResult = DeleteTargetsResult & {
  readonly deleted_files?: readonly string[]
  readonly deleted_dirs?: readonly string[]
  readonly file_errors?: readonly DeletionError[]
  readonly dir_errors?: readonly DeletionError[]
}

function requireNativeDeskPathsBinding(): NativeDeskPathsBinding {
  const binding = getNativeBinding<NativeDeskPathsBinding>()
  if (binding == null) {
    throw new Error('Native desk-paths binding is required. Build or install the Rust NAPI package before running tnmsc.')
  }
  return binding
}

function requireDeskPathsMethod<K extends keyof NativeDeskPathsBinding>(
  methodName: K
): NonNullable<NativeDeskPathsBinding[K]> {
  const binding = requireNativeDeskPathsBinding()
  const method = binding[methodName]
  if (method == null) {
    throw new Error(`Native desk-paths binding is missing "${String(methodName)}". Rebuild the Rust NAPI package before running tnmsc.`)
  }
  return method
}

function normalizeDeletionResult(result: NativeDeletionResult): DeletionResult {
  return {
    deleted: result.deleted,
    deletedPaths: result.deletedPaths ?? result.deleted_paths ?? [],
    errors: result.errors ?? []
  }
}

function normalizeDeleteTargetsResult(result: NativeDeleteTargetsResult): DeleteTargetsResult {
  return {
    deletedFiles: result.deletedFiles ?? result.deleted_files ?? [],
    deletedDirs: result.deletedDirs ?? result.deleted_dirs ?? [],
    fileErrors: result.fileErrors ?? result.file_errors ?? [],
    dirErrors: result.dirErrors ?? result.dir_errors ?? []
  }
}

export function getPlatformFixedDir(): string {
  return requireDeskPathsMethod('getPlatformFixedDir')()
}

export function ensureDir(dir: string): void {
  requireDeskPathsMethod('ensureDir')(dir)
}

export function existsSync(targetPath: string): boolean {
  return requireDeskPathsMethod('existsSync')(targetPath)
}

export function deletePathSync(targetPath: string): void {
  requireDeskPathsMethod('deletePathSync')(targetPath)
}

export function writeFileSync(filePath: string, data: string | Buffer, encoding: BufferEncoding = 'utf8'): void {
  requireDeskPathsMethod('writeFileSync')(filePath, data, encoding)
}

export function readFileSync(filePath: string, encoding: BufferEncoding = 'utf8'): string {
  return requireDeskPathsMethod('readFileSync')(filePath, encoding)
}

export async function deleteFiles(files: readonly string[]): Promise<DeletionResult> {
  return normalizeDeletionResult(await Promise.resolve(requireDeskPathsMethod('deleteFiles')(files) as NativeDeletionResult))
}

export async function deleteDirectories(dirs: readonly string[]): Promise<DeletionResult> {
  return normalizeDeletionResult(await Promise.resolve(requireDeskPathsMethod('deleteDirectories')(dirs) as NativeDeletionResult))
}

export async function deleteEmptyDirectories(dirs: readonly string[]): Promise<DeletionResult> {
  return normalizeDeletionResult(await Promise.resolve(requireDeskPathsMethod('deleteEmptyDirectories')(dirs) as NativeDeletionResult))
}

export async function deleteTargets(targets: {
  readonly files?: readonly string[]
  readonly dirs?: readonly string[]
}): Promise<DeleteTargetsResult> {
  return normalizeDeleteTargetsResult(await Promise.resolve(requireDeskPathsMethod('deleteTargets')({
    files: targets.files ?? [],
    dirs: targets.dirs ?? []
  }) as NativeDeleteTargetsResult))
}

export function writeFileSafe(options: SafeWriteOptions): SafeWriteResult {
  const {fullPath, content, type, relativePath, dryRun, logger} = options

  if (dryRun) {
    logger.trace({action: 'dryRun', type, path: fullPath})
    return {path: relativePath, success: true, skipped: false}
  }

  try {
    writeFileSync(fullPath, content)
    logger.trace({action: 'write', type, path: fullPath})
    return {path: relativePath, success: true}
  }
  catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)
    logger.error(buildFileOperationDiagnostic({
      code: 'OUTPUT_FILE_WRITE_FAILED',
      title: `Failed to write ${type} output`,
      operation: 'write',
      targetKind: `${type} output file`,
      path: fullPath,
      error: errMsg,
      details: {
        relativePath,
        type
      }
    }))
    return {path: relativePath, success: false, error: error as Error}
  }
}
