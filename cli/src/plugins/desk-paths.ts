import type {Buffer} from 'node:buffer'
import type {LoggerDiagnosticInput} from './plugin-core'
import * as fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import {buildFileOperationDiagnostic} from '@/diagnostics'
import {resolveRuntimeEnvironment, resolveUserPath} from '@/runtime-environment'

/**
 * Represents a fixed set of platform directory identifiers.
 *
 * `PlatformFixedDir` is a type that specifies platform-specific values.
 * These values correspond to common operating system platforms and are
 * used to identify directory structures or configurations unique to those systems.
 *
 * Valid values include:
 * - 'win32': Represents the Windows operating system.
 * - 'darwin': Represents the macOS operating system.
 * - 'linux': Represents the Linux operating system.
 *
 * This type is typically used in contexts where platform-dependent logic
 * or directory configurations are required.
 */
type PlatformFixedDir = 'win32' | 'darwin' | 'linux'

/**
 * Determines the Linux data directory based on the XDG_DATA_HOME environment
 * variable or defaults to a directory under the user's home directory.
 *
 * @param {string} homeDir - The home directory path of the current user.
 * @return {string} The resolved path to the Linux data directory.
 */
function getLinuxDataDir(homeDir: string): string {
  const xdgDataHome = process.env['XDG_DATA_HOME']
  if (typeof xdgDataHome === 'string' && xdgDataHome.trim().length > 0) return resolveUserPath(xdgDataHome)
  return path.join(homeDir, '.local', 'share')
}

/**
 * Determines and returns the platform-specific directory for storing application data.
 * The directory path is resolved based on the underlying operating system.
 *
 * @return {string} The resolved directory path specific to the current platform.
 * @throws {Error} If the platform is unsupported.
 */
export function getPlatformFixedDir(): string {
  const runtimeEnvironment = resolveRuntimeEnvironment()
  const platform = (runtimeEnvironment.isWsl ? 'win32' : runtimeEnvironment.platform) as PlatformFixedDir
  const homeDir = runtimeEnvironment.effectiveHomeDir

  if (platform === 'win32') return resolveUserPath(process.env['LOCALAPPDATA'] ?? path.join(homeDir, 'AppData', 'Local'))
  if (platform === 'darwin') return path.join(homeDir, 'Library', 'Application Support')
  if (platform === 'linux') return getLinuxDataDir(homeDir)

  throw new Error(`Unsupported platform: ${process.platform}`)
}

/**
 * Check if a path is a symbolic link (or junction on Windows).
 *
 * @param p - The path to check
 * @returns true if the path is a symbolic link, false otherwise
 */
export function isSymlink(p: string): boolean {
  try {
    return fs.lstatSync(p).isSymbolicLink()
  }
  catch {
    return false
  }
}

/**
 * Get file stats without following symlinks.
 *
 * @param p - The path to get stats for
 * @returns The fs.Stats object
 */
export function lstatSync(p: string): fs.Stats {
  return fs.lstatSync(p)
}

/**
 * Ensure a directory exists, creating it recursively if needed.
 * Idempotent: calling multiple times has the same effect as calling once.
 *
 * @param dir - The directory path to ensure exists
 */
export function ensureDir(dir: string): void {
  fs.mkdirSync(dir, {recursive: true})
}

/** @internal */
function ensureDirectory(dir: string): void {
  ensureDir(dir)
}

/**
 * Create a symbolic link with cross-platform support.
 *
 * On Windows:
 * - Uses 'junction' for directories (no admin privileges required)
 * - Uses 'file' symlink for files (may require admin or developer mode)
 *
 * On Unix/macOS:
 * - Uses standard symbolic links for both files and directories
 *
 * @param targetPath - The path the symlink should point to (must be absolute on Windows for junction)
 * @param symlinkPath - The path where the symlink will be created
 * @param type - Type of symlink: 'file' or 'dir' (default: 'dir')
 */
export function createSymlink(targetPath: string, symlinkPath: string, type: 'file' | 'dir' = 'dir'): void {
  const parentDir = path.dirname(symlinkPath)
  ensureDirectory(parentDir)

  if (fs.existsSync(symlinkPath)) { // Remove existing symlink or directory
    const stat = fs.lstatSync(symlinkPath)
    if (stat.isSymbolicLink()) {
      if (process.platform === 'win32') fs.rmSync(symlinkPath, {recursive: true, force: true}) // Windows junction needs rmSync
      else fs.unlinkSync(symlinkPath)
    } else if (stat.isDirectory()) fs.rmSync(symlinkPath, {recursive: true})
    else fs.unlinkSync(symlinkPath)
  }

  if (process.platform === 'win32' && type === 'dir') fs.symlinkSync(targetPath, symlinkPath, 'junction') // On Windows, use junction for directories (no admin needed)
  else fs.symlinkSync(targetPath, symlinkPath, type)
}

/**
 * Remove a symbolic link (or junction on Windows) if it exists.
 *
 * @param symlinkPath - The path of the symlink to remove
 */
export function removeSymlink(symlinkPath: string): void {
  if (!fs.existsSync(symlinkPath)) return

  const stat = fs.lstatSync(symlinkPath)
  if (stat.isSymbolicLink()) {
    if (process.platform === 'win32') fs.rmSync(symlinkPath, {recursive: true, force: true}) // Windows junction needs rmSync
    else fs.unlinkSync(symlinkPath)
  }
}

/**
 * Read the target of a symbolic link.
 *
 * @param symlinkPath - The path of the symlink
 * @returns The target path, or null if not a symlink or an error occurred
 */
export function readSymlinkTarget(symlinkPath: string): string | null {
  try {
    if (!isSymlink(symlinkPath)) return null
    return fs.readlinkSync(symlinkPath)
  }
  catch {
    return null
  }
}

/**
 * Check if a path exists (file, directory, or symlink).
 *
 * @param p - The path to check
 * @returns true if the path exists
 */
export function existsSync(p: string): boolean {
  return fs.existsSync(p)
}

/**
 * Delete a file, directory, or symlink/junction safely.
 * Handles Windows junctions properly by using rmSync.
 *
 * @param p - The path to delete
 */
export function deletePathSync(p: string): void {
  if (!fs.existsSync(p)) return

  const stat = fs.lstatSync(p)
  if (stat.isSymbolicLink()) {
    if (process.platform === 'win32') fs.rmSync(p, {recursive: true, force: true}) // Windows junction
    else fs.unlinkSync(p)
  } else if (stat.isDirectory()) fs.rmSync(p, {recursive: true, force: true})
  else fs.unlinkSync(p)
} // File Operations - Read, Write, Ensure

/**
 * Write a string or Buffer to a file, auto-creating parent directories.
 *
 * @param filePath - Absolute path to the file
 * @param data - Content to write (string or Buffer)
 * @param encoding - Encoding for string data (default: 'utf8')
 */
export function writeFileSync(filePath: string, data: string | Buffer, encoding: BufferEncoding = 'utf8'): void {
  const parentDir = path.dirname(filePath)
  ensureDir(parentDir)
  if (typeof data === 'string') fs.writeFileSync(filePath, data, encoding)
  else fs.writeFileSync(filePath, data)
}

/**
 * Read a file as a string. Throws with the path included in the error message on failure.
 *
 * @param filePath - Absolute path to the file
 * @param encoding - Encoding (default: 'utf8')
 * @returns The file content as a string
 * @throws Error with path context if the file cannot be read
 */
export function readFileSync(filePath: string, encoding: BufferEncoding = 'utf8'): string {
  try {
    return fs.readFileSync(filePath, encoding)
  }
  catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to read file "${filePath}": ${msg}`)
  }
} // Batch Deletion - Delete files and directories with error collection

/**
 * Error encountered during a batch deletion operation.
 */
export interface DeletionError {
  readonly path: string
  readonly error: unknown
}

/**
 * Result of a batch deletion operation.
 */
export interface DeletionResult {
  readonly deleted: number
  readonly errors: readonly DeletionError[]
}

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

/**
 * Delete multiple files. Skips non-existent files. Collects errors without throwing.
 *
 * @param files - Array of absolute file paths to delete
 * @returns DeletionResult with count and errors
 */
export async function deleteFiles(files: readonly string[]): Promise<DeletionResult> {
  const results = await Promise.all(files.map(async file => {
    try {
      const deleted = await deletePath(file)
      return {path: file, deleted}
    }
    catch (error) {
      return {path: file, error}
    }
  }))

  const errors: DeletionError[] = []
  let deleted = 0

  for (const result of results) {
    if ('error' in result) {
      errors.push({path: result.path, error: result.error})
      continue
    }

    if (result.deleted) deleted++
  }

  return {deleted, errors}
}

/**
 * Delete multiple directories. Sorts by depth descending so nested dirs are removed first.
 * Skips non-existent directories. Collects errors without throwing.
 *
 * @param dirs - Array of absolute directory paths to delete
 * @returns DeletionResult with count and errors
 */
export async function deleteDirectories(dirs: readonly string[]): Promise<DeletionResult> {
  const sorted = [...dirs].sort((a, b) => b.length - a.length)
  const results = await Promise.all(sorted.map(async dir => {
    try {
      const deleted = await deletePath(dir)
      return {path: dir, deleted}
    }
    catch (error) {
      return {path: dir, error}
    }
  }))

  const errors: DeletionError[] = []
  let deleted = 0

  for (const result of results) {
    if ('error' in result) {
      errors.push({path: result.path, error: result.error})
      continue
    }

    if (result.deleted) deleted++
  }

  return {deleted, errors}
} // Safe Write - Dry-run aware file writing with error handling

/**
 * Logger interface for safe write operations.
 */
export interface WriteLogger {
  readonly trace: (data: object) => void
  readonly error: (diagnostic: LoggerDiagnosticInput) => void
}

/**
 * Options for writeFileSafe.
 */
export interface SafeWriteOptions {
  readonly fullPath: string
  readonly content: string | Buffer
  readonly type: string
  /** 相对路径字符串 (相对于输出目标目录) */
  readonly relativePath: string
  readonly dryRun: boolean
  readonly logger: WriteLogger
}

/**
 * Result of a safe write operation.
 */
export interface SafeWriteResult {
  /** 相对路径字符串 (相对于输出目标目录) */
  readonly path: string
  readonly success: boolean
  readonly skipped?: boolean
  readonly error?: Error
}

/**
 * Write a file with dry-run support and error handling.
 * Auto-creates parent directories. Returns a result object instead of throwing.
 *
 * @param options - Write options including path, content, dry-run flag, and logger
 * @returns SafeWriteResult indicating success or failure
 */
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
