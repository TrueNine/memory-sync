/**
 * Cross-platform symlink utilities.
 *
 * Handles symlink creation, removal, and detection with platform-specific behavior:
 * - Windows: Uses junction links for directories (no admin required)
 * - Unix/macOS: Uses standard symbolic links
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import process from 'node:process'

/**
 * Check if a path is a symbolic link.
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
 * @param targetPath - The path the symlink should point to
 * @param symlinkPath - The path where the symlink will be created
 * @param type - Type of symlink: 'file' or 'dir' (default: 'dir')
 */
export function createSymlink(targetPath: string, symlinkPath: string, type: 'file' | 'dir' = 'dir'): void {
  const parentDir = path.dirname(symlinkPath)
  ensureDirectory(parentDir)

  if (fs.existsSync(symlinkPath)) { // Remove existing symlink or directory
    const stat = fs.lstatSync(symlinkPath)
    if (stat.isSymbolicLink()) fs.unlinkSync(symlinkPath)
    else if (stat.isDirectory()) fs.rmSync(symlinkPath, {recursive: true})
    else fs.unlinkSync(symlinkPath)
  }

  if (process.platform === 'win32' && type === 'dir') { // On Windows, use junction for directories (no admin needed)
    fs.symlinkSync(targetPath, symlinkPath, 'junction')
  } else fs.symlinkSync(targetPath, symlinkPath, type)
}

/**
 * Remove a symbolic link if it exists.
 *
 * @param symlinkPath - The path of the symlink to remove
 */
export function removeSymlink(symlinkPath: string): void {
  if (!fs.existsSync(symlinkPath)) return

  const stat = fs.lstatSync(symlinkPath)
  if (stat.isSymbolicLink()) fs.unlinkSync(symlinkPath)
}

/**
 * Read the target of a symbolic link.
 *
 * @param symlinkPath - The path of the symlink
 * @returns The target path, or null if not a symlink
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
