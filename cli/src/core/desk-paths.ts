import type {Buffer} from 'node:buffer'
import type {
  DeleteTargetsResult,
  DeletionResult,
  SafeWriteOptions,
  SafeWriteResult
} from './desk-paths-fallback'
import {createRequire} from 'node:module'
import process from 'node:process'
import {buildFileOperationDiagnostic} from '@/diagnostics'
import * as fallback from './desk-paths-fallback'

export type {
  DeleteTargetsResult,
  DeletionError,
  DeletionResult,
  SafeWriteOptions,
  SafeWriteResult,
  WriteLogger
} from './desk-paths-fallback'

interface NativeDeskPathsBinding {
  readonly getPlatformFixedDir?: () => string
  readonly ensureDir?: (dir: string) => void
  readonly existsSync?: (targetPath: string) => boolean
  readonly deletePathSync?: (targetPath: string) => void
  readonly writeFileSync?: (filePath: string, data: string | Buffer, encoding?: BufferEncoding) => void
  readonly readFileSync?: (filePath: string, encoding?: BufferEncoding) => string
  readonly deleteFiles?: (files: readonly string[]) => DeletionResult | Promise<DeletionResult>
  readonly deleteDirectories?: (dirs: readonly string[]) => DeletionResult | Promise<DeletionResult>
  readonly deleteTargets?: (targets: {readonly files?: readonly string[], readonly dirs?: readonly string[]}) => DeleteTargetsResult | Promise<DeleteTargetsResult>
}

type NativeDeletionResult = DeletionResult & {
  readonly deleted_paths?: readonly string[]
}

type NativeDeleteTargetsResult = DeleteTargetsResult & {
  readonly deleted_files?: readonly string[]
  readonly deleted_dirs?: readonly string[]
  readonly file_errors?: readonly import('./desk-paths-fallback').DeletionError[]
  readonly dir_errors?: readonly import('./desk-paths-fallback').DeletionError[]
}

function shouldSkipNativeBinding(): boolean {
  return process.env['NODE_ENV'] === 'test'
    || process.env['VITEST'] != null
    || process.env['VITEST_WORKER_ID'] != null
}

function tryLoadNativeBinding(): NativeDeskPathsBinding | undefined {
  if (shouldSkipNativeBinding()) return void 0

  const suffixMap: Readonly<Record<string, string>> = {
    'win32-x64': 'win32-x64-msvc',
    'linux-x64': 'linux-x64-gnu',
    'linux-arm64': 'linux-arm64-gnu',
    'darwin-arm64': 'darwin-arm64',
    'darwin-x64': 'darwin-x64'
  }
  const suffix = suffixMap[`${process.platform}-${process.arch}`]
  if (suffix == null) return void 0

  try {
    const _require = createRequire(import.meta.url)
    const packageName = `@truenine/memory-sync-cli-${suffix}`
    const binaryFile = `napi-memory-sync-cli.${suffix}.node`
    const candidates = [
      packageName,
      `${packageName}/${binaryFile}`,
      `./${binaryFile}`
    ]

    for (const specifier of candidates) {
      try {
        const loaded = _require(specifier) as unknown
        const possibleBindings = [
          loaded,
          (loaded as {default?: unknown})?.default,
          (loaded as {config?: unknown})?.config,
          (loaded as {default?: {config?: unknown}})?.default?.config
        ]

        for (const candidate of possibleBindings) {
          if (candidate != null && typeof candidate === 'object') return candidate as NativeDeskPathsBinding
        }
      }
      catch {}
    }
  }
  catch {
  }

  return void 0
}

const nativeBinding = tryLoadNativeBinding()

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
  return fallback.getPlatformFixedDir()
}

export function ensureDir(dir: string): void {
  if (nativeBinding?.ensureDir != null) {
    nativeBinding.ensureDir(dir)
    return
  }
  fallback.ensureDir(dir)
}

export function existsSync(targetPath: string): boolean {
  return nativeBinding?.existsSync?.(targetPath) ?? fallback.existsSync(targetPath)
}

export function deletePathSync(targetPath: string): void {
  if (nativeBinding?.deletePathSync != null) {
    nativeBinding.deletePathSync(targetPath)
    return
  }
  fallback.deletePathSync(targetPath)
}

export function writeFileSync(filePath: string, data: string | Buffer, encoding: BufferEncoding = 'utf8'): void {
  if (nativeBinding?.writeFileSync != null) {
    nativeBinding.writeFileSync(filePath, data, encoding)
    return
  }
  fallback.writeFileSync(filePath, data, encoding)
}

export function readFileSync(filePath: string, encoding: BufferEncoding = 'utf8'): string {
  return nativeBinding?.readFileSync?.(filePath, encoding) ?? fallback.readFileSync(filePath, encoding)
}

export async function deleteFiles(files: readonly string[]): Promise<DeletionResult> {
  if (nativeBinding?.deleteFiles != null) return normalizeDeletionResult(await Promise.resolve(nativeBinding.deleteFiles(files) as NativeDeletionResult))
  return fallback.deleteFiles(files)
}

export async function deleteDirectories(dirs: readonly string[]): Promise<DeletionResult> {
  if (nativeBinding?.deleteDirectories != null) return normalizeDeletionResult(await Promise.resolve(nativeBinding.deleteDirectories(dirs) as NativeDeletionResult))
  return fallback.deleteDirectories(dirs)
}

export async function deleteTargets(targets: {
  readonly files?: readonly string[]
  readonly dirs?: readonly string[]
}): Promise<DeleteTargetsResult> {
  if (nativeBinding?.deleteTargets != null) {
    return normalizeDeleteTargetsResult(await Promise.resolve(nativeBinding.deleteTargets({
      files: targets.files ?? [],
      dirs: targets.dirs ?? []
    }) as NativeDeleteTargetsResult))
  }
  return fallback.deleteTargets(targets)
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
