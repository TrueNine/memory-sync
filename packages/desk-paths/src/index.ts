import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

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
  if (typeof xdgDataHome === 'string' && xdgDataHome.trim().length > 0) return xdgDataHome
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
  const platform = process.platform as PlatformFixedDir
  const homeDir = os.homedir()

  if (platform === 'win32') return process.env['LOCALAPPDATA'] ?? path.join(homeDir, 'AppData', 'Local')
  if (platform === 'darwin') return path.join(homeDir, 'Library', 'Application Support')
  if (platform === 'linux') return getLinuxDataDir(homeDir)

  throw new Error(`Unsupported platform: ${process.platform}`)
}

// =============================================================================
// Symlink Utilities - Cross-platform symlink creation and management
// =============================================================================

import * as fs from 'node:fs'

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
 */
function ensureDirectory(dir: string): void {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, {recursive: true})
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
}

