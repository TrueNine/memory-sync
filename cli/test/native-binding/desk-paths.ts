import type {Buffer} from 'node:buffer'
import type {LoggerDiagnosticInput} from '../../src/plugins/plugin-core'
import * as fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import {buildFileOperationDiagnostic} from '@/diagnostics'
import {resolveRuntimeEnvironment, resolveUserPath} from '@/runtime-environment'

type PlatformFixedDir = 'win32' | 'darwin' | 'linux'

function getLinuxDataDir(homeDir: string): string {
  const xdgDataHome = process.env['XDG_DATA_HOME']
  if (typeof xdgDataHome === 'string' && xdgDataHome.trim().length > 0) return resolveUserPath(xdgDataHome)
  return path.join(homeDir, '.local', 'share')
}

export function getPlatformFixedDir(): string {
  const runtimeEnvironment = resolveRuntimeEnvironment()
  const platform = (runtimeEnvironment.isWsl ? 'win32' : runtimeEnvironment.platform) as PlatformFixedDir
  const homeDir = runtimeEnvironment.effectiveHomeDir

  if (platform === 'win32') return resolveUserPath(process.env['LOCALAPPDATA'] ?? path.join(homeDir, 'AppData', 'Local'))
  if (platform === 'darwin') return path.join(homeDir, 'Library', 'Application Support')
  if (platform === 'linux') return getLinuxDataDir(homeDir)

  throw new Error(`Unsupported platform: ${process.platform}`)
}

export function ensureDir(dir: string): void {
  fs.mkdirSync(dir, {recursive: true})
}

export function existsSync(p: string): boolean {
  return fs.existsSync(p)
}

export function deletePathSync(p: string): void {
  if (!fs.existsSync(p)) return

  const stat = fs.lstatSync(p)
  if (stat.isSymbolicLink()) {
    if (process.platform === 'win32') fs.rmSync(p, {recursive: true, force: true})
    else fs.unlinkSync(p)
  }
  else if (stat.isDirectory()) fs.rmSync(p, {recursive: true, force: true})
  else fs.unlinkSync(p)
}

export function writeFileSync(filePath: string, data: string | Buffer, encoding: BufferEncoding = 'utf8'): void {
  const parentDir = path.dirname(filePath)
  ensureDir(parentDir)
  if (typeof data === 'string') fs.writeFileSync(filePath, data, encoding)
  else fs.writeFileSync(filePath, data)
}

export function readFileSync(filePath: string, encoding: BufferEncoding = 'utf8'): string {
  try {
    return fs.readFileSync(filePath, encoding)
  }
  catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to read file "${filePath}": ${msg}`)
  }
}

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

const DELETE_CONCURRENCY = 32

async function deletePath(p: string): Promise<boolean> {
  try {
    const stat = await fs.promises.lstat(p)
    if (stat.isSymbolicLink()) {
      await (process.platform === 'win32' ? fs.promises.rm(p, {recursive: true, force: true}) : fs.promises.unlink(p))
      return true
    }

    if (stat.isDirectory()) {
      await fs.promises.rm(p, {recursive: true, force: true})
      return true
    }

    await fs.promises.unlink(p)
    return true
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}

async function deleteEmptyDirectory(p: string): Promise<boolean> {
  try {
    await fs.promises.rmdir(p)
    return true
  }
  catch (error) {
    const {code} = error as NodeJS.ErrnoException
    if (code === 'ENOENT' || code === 'ENOTEMPTY') return false
    throw error
  }
}

async function mapWithConcurrencyLimit<T, TResult>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T) => Promise<TResult>
): Promise<TResult[]> {
  if (items.length === 0) return []

  const results: TResult[] = []
  let nextIndex = 0

  const runWorker = async (): Promise<void> => {
    while (true) {
      const currentIndex = nextIndex
      if (currentIndex >= items.length) return

      nextIndex += 1
      results[currentIndex] = await worker(items[currentIndex] as T)
    }
  }

  const workerCount = Math.min(concurrency, items.length)
  const workers: Promise<void>[] = []
  for (let index = 0; index < workerCount; index += 1) {
    workers.push(runWorker())
  }
  await Promise.all(workers)

  return results
}

async function deletePaths(
  paths: readonly string[],
  options?: {readonly sortByDepthDescending?: boolean}
): Promise<DeletionResult> {
  const sortedPaths = options?.sortByDepthDescending === true
    ? [...paths].sort((a, b) => b.length - a.length || b.localeCompare(a))
    : [...paths]

  const results = await mapWithConcurrencyLimit(sortedPaths, DELETE_CONCURRENCY, async currentPath => {
    try {
      const deleted = await deletePath(currentPath)
      return {path: currentPath, deleted}
    }
    catch (error) {
      return {path: currentPath, error}
    }
  })

  const deletedPaths: string[] = []
  const errors: DeletionError[] = []

  for (const result of results) {
    if ('error' in result) {
      errors.push({path: result.path, error: result.error})
      continue
    }

    if (result.deleted) deletedPaths.push(result.path)
  }

  return {
    deleted: deletedPaths.length,
    deletedPaths,
    errors
  }
}

export async function deleteFiles(files: readonly string[]): Promise<DeletionResult> {
  return deletePaths(files)
}

export async function deleteDirectories(dirs: readonly string[]): Promise<DeletionResult> {
  return deletePaths(dirs, {sortByDepthDescending: true})
}

export async function deleteEmptyDirectories(dirs: readonly string[]): Promise<DeletionResult> {
  const sortedPaths = [...dirs].sort((a, b) => b.length - a.length || b.localeCompare(a))
  const deletedPaths: string[] = []
  const errors: DeletionError[] = []

  for (const currentPath of sortedPaths) {
    try {
      const deleted = await deleteEmptyDirectory(currentPath)
      if (deleted) deletedPaths.push(currentPath)
    }
    catch (error) {
      errors.push({path: currentPath, error})
    }
  }

  return {
    deleted: deletedPaths.length,
    deletedPaths,
    errors
  }
}

export async function deleteTargets(targets: {
  readonly files?: readonly string[]
  readonly dirs?: readonly string[]
}): Promise<DeleteTargetsResult> {
  const [fileResult, dirResult] = await Promise.all([
    deleteFiles(targets.files ?? []),
    deleteDirectories(targets.dirs ?? [])
  ])

  return {
    deletedFiles: fileResult.deletedPaths,
    deletedDirs: dirResult.deletedPaths,
    fileErrors: fileResult.errors,
    dirErrors: dirResult.errors
  }
}

export interface WriteLogger {
  readonly trace: (data: object) => void
  readonly error: (diagnostic: LoggerDiagnosticInput) => void
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
