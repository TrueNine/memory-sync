import type {Buffer} from 'node:buffer'
import * as fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import {resolveRuntimeEnvironment, resolveUserPath} from '../../src/runtime-environment.ts'

type PlatformFixedDir = 'win32' | 'darwin' | 'linux'

function getLinuxDataDir(homeDir: string): string {
  const xdgDataHome = process.env['XDG_DATA_HOME']
  if ((xdgDataHome?.trim()?.length ?? 0) > 0 && xdgDataHome != null) return resolveUserPath(xdgDataHome)
  return path.join(homeDir, '.local', 'share')
}

export function getPlatformFixedDir(): string {
  const testBinding = (globalThis as {__TNMSC_TEST_NATIVE_BINDING__?: {getPlatformFixedDir?: () => string}}).__TNMSC_TEST_NATIVE_BINDING__
  if (testBinding?.getPlatformFixedDir != null) {
    return testBinding.getPlatformFixedDir()
  }

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
  } else if (stat.isDirectory()) fs.rmSync(p, {recursive: true, force: true})
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
  } catch (error) {
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
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}

async function deleteEmptyDirectory(p: string): Promise<boolean> {
  try {
    await fs.promises.rmdir(p)
    return true
  } catch (error) {
    const {code} = error as NodeJS.ErrnoException
    if (code === 'ENOENT' || code === 'ENOTEMPTY') return false
    throw error
  }
}

async function mapWithConcurrencyLimit<T, TResult>(items: readonly T[], concurrency: number, worker: (item: T) => Promise<TResult>): Promise<TResult[]> {
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

async function deletePaths(paths: readonly string[], options?: {readonly sortByDepthDescending?: boolean}): Promise<DeletionResult> {
  const sortedPaths = options?.sortByDepthDescending === true ? [...paths].sort((a, b) => b.length - a.length || b.localeCompare(a)) : [...paths]

  const results = await mapWithConcurrencyLimit(sortedPaths, DELETE_CONCURRENCY, async currentPath => {
    try {
      const deleted = await deletePath(currentPath)
      return {path: currentPath, deleted}
    } catch (error) {
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
    } catch (error) {
      errors.push({path: currentPath, error})
    }
  }

  return {
    deleted: deletedPaths.length,
    deletedPaths,
    errors
  }
}

export async function deleteTargets(targets: {readonly files?: readonly string[], readonly dirs?: readonly string[]}): Promise<DeleteTargetsResult> {
  const [fileResult, dirResult] = await Promise.all([deleteFiles(targets.files ?? []), deleteDirectories(targets.dirs ?? [])])

  return {
    deletedFiles: fileResult.deletedPaths,
    deletedDirs: dirResult.deletedPaths,
    fileErrors: fileResult.errors,
    dirErrors: dirResult.errors
  }
}

export interface CompactedDeletionTargets {
  readonly files: string[]
  readonly dirs: string[]
}

export function compactDeletionTargets(files: readonly string[], dirs: readonly string[]): CompactedDeletionTargets {
  const filesByKey = new Map<string, string>()
  const dirsByKey = new Map<string, string>()

  for (const filePath of files) {
    const resolvedPath = path.resolve(filePath)
    filesByKey.set(resolvedPath, resolvedPath)
  }

  for (const dirPath of dirs) {
    const resolvedPath = path.resolve(dirPath)
    dirsByKey.set(resolvedPath, resolvedPath)
  }

  const compactedDirs = new Map<string, string>()
  const sortedDirEntries = [...dirsByKey.entries()].sort((a, b) => a[0].length - b[0].length)

  for (const [dirKey, dirPath] of sortedDirEntries) {
    let coveredByParent = false
    for (const existingParentKey of compactedDirs.keys()) {
      if (dirKey === existingParentKey || dirKey.startsWith(`${existingParentKey}${path.sep}`)) {
        coveredByParent = true
        break
      }
    }

    if (!coveredByParent) compactedDirs.set(dirKey, dirPath)
  }

  const compactedFiles: string[] = []
  for (const [fileKey, filePath] of filesByKey) {
    let coveredByDir = false
    for (const dirKey of compactedDirs.keys()) {
      if (fileKey === dirKey || fileKey.startsWith(`${dirKey}${path.sep}`)) {
        coveredByDir = true
        break
      }
    }

    if (!coveredByDir) compactedFiles.push(filePath)
  }

  compactedFiles.sort((a, b) => a.localeCompare(b))
  const compactedDirPaths = [...compactedDirs.values()].sort((a, b) => a.localeCompare(b))

  return {files: compactedFiles, dirs: compactedDirPaths}
}

export interface WorkspaceEmptyDirectoryPlan {
  readonly emptyDirsToDelete: string[]
}

const EMPTY_DIRECTORY_SCAN_EXCLUDED_BASENAMES = new Set([
  '.git',
  'node_modules',
  'dist',
  'target',
  '.next',
  '.turbo',
  'coverage',
  '.nyc_output',
  '.cache',
  '.vite',
  '.vite-temp',
  '.pnpm-store',
  '.yarn',
  '.idea',
  '.volumes',
  'volumes'
])

function shouldSkipEmptyDirectoryTree(workspaceDir: string, currentDir: string): boolean {
  if (currentDir === workspaceDir) return false
  return EMPTY_DIRECTORY_SCAN_EXCLUDED_BASENAMES.has(path.basename(currentDir))
}

export function planWorkspaceEmptyDirectoryCleanup(
  workspaceDir: string,
  filesToDelete: readonly string[],
  dirsToDelete: readonly string[]
): WorkspaceEmptyDirectoryPlan {
  const resolvedWorkspaceDir = path.resolve(workspaceDir)
  const filesToDeleteSet = new Set(filesToDelete.map(p => path.resolve(p)))
  const dirsToDeleteSet = new Set(dirsToDelete.map(p => path.resolve(p)))
  const emptyDirsToDelete = new Set<string>()

  const isScheduledForDeletion = (dirPath: string): boolean => dirsToDeleteSet.has(dirPath) || emptyDirsToDelete.has(dirPath)

  const collectEmptyDirectories = (currentDir: string): boolean => {
    if (isScheduledForDeletion(currentDir)) return true
    if (shouldSkipEmptyDirectoryTree(resolvedWorkspaceDir, currentDir)) return false

    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(currentDir, {withFileTypes: true})
    } catch {
      return false
    }

    let hasRetainedEntries = false

    for (const entry of entries) {
      const entryPath = path.resolve(currentDir, entry.name)

      if (isScheduledForDeletion(entryPath)) continue

      if (entry.isDirectory()) {
        if (shouldSkipEmptyDirectoryTree(resolvedWorkspaceDir, entryPath)) {
          hasRetainedEntries = true
          continue
        }

        if (collectEmptyDirectories(entryPath)) {
          emptyDirsToDelete.add(entryPath)
          continue
        }

        hasRetainedEntries = true
        continue
      }

      if (filesToDeleteSet.has(entryPath)) continue
      hasRetainedEntries = true
    }

    return !hasRetainedEntries
  }

  let previousSize = -1
  while (emptyDirsToDelete.size !== previousSize) {
    previousSize = emptyDirsToDelete.size
    collectEmptyDirectories(resolvedWorkspaceDir)
  }

  return {
    emptyDirsToDelete: [...emptyDirsToDelete].sort((a, b) => a.localeCompare(b))
  }
}

export function isDirectoryStructureMismatchError(error: string): boolean {
  const normalized = error.toLowerCase()
  return normalized.includes('enotdir') || normalized.includes('not a directory') || normalized.includes('eexist') || normalized.includes('file exists')
}

export function findBlockingNonDirectoryPath(expectedDirPath: string): string | undefined {
  const resolvedDirPath = path.resolve(expectedDirPath)
  const {root} = path.parse(resolvedDirPath)
  const relativeSegments = resolvedDirPath
    .slice(root.length)
    .split(path.sep)
    .filter(segment => segment.length > 0)

  let currentPath = root
  for (const segment of relativeSegments) {
    currentPath = currentPath.length > 0 ? path.join(currentPath, segment) : segment
    if (!fs.existsSync(currentPath)) continue

    try {
      if (!fs.lstatSync(currentPath).isDirectory()) return currentPath
    } catch {
      return void 0
    }
  }

  return void 0
}

export function resolveBlockingFilePath(pathArg: string, targetKind: 'file' | 'directory', error: string): string | undefined {
  if (!isDirectoryStructureMismatchError(error)) return void 0

  const expectedDirPath = targetKind === 'file' ? path.dirname(pathArg) : pathArg

  return findBlockingNonDirectoryPath(expectedDirPath)
}

export function removeBlockingFile(blockingPath: string): {removed: boolean, error?: unknown} {
  if (!fs.existsSync(blockingPath)) return {removed: false}

  try {
    if (fs.lstatSync(blockingPath).isDirectory()) return {removed: false}
    fs.rmSync(blockingPath, {force: true})
    return {removed: true}
  } catch (error) {
    return {removed: false, error}
  }
}
