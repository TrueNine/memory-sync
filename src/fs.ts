import path from 'node:path'
import fs from 'fs-extra'

export interface PathSegmentsOptions {
  base: string
  segments: readonly string[]
}

/**
 * Resolve a path using a base directory and child segments.
 */
export function resolvePath({ base, segments }: PathSegmentsOptions): string {
  return path.join(base, ...segments)
}

/**
 * Recursively get all files in a directory
 */
export async function getAllFiles(dirPath: string): Promise<string[]> {
  const files: string[] = []

  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name)

      if (entry.isDirectory()) {
        const subFiles = await getAllFiles(fullPath)
        files.push(...subFiles)
      } else if (entry.isFile()) {
        files.push(fullPath)
      }
    }
  } catch {
    // Directory might not exist or be accessible
  }

  return files
}

/**
 * Get only first-level directories in a path
 */
export async function getFirstLevelDirs(basePath: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(basePath, { withFileTypes: true })
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
  } catch {
    return []
  }
}

/**
 * Ensure a directory exists, create if it doesn't
 */
export async function ensureDir(dirPath: string): Promise<void> {
  await fs.ensureDir(dirPath)
}

/**
 * Check if a path exists
 */
export async function pathExists(targetPath: string): Promise<boolean> {
  return fs.pathExists(targetPath)
}

export interface CopyDirectoryOptions {
  source: string
  target: string
  ignore?: readonly string[]
  onIgnore?: ((ignoredPath: string) => Promise<void> | void) | undefined
}

/**
 * Copy directory contents recursively, removing target before copying.
 */
export async function copyDirectory({ source, target, ignore = [], onIgnore }: CopyDirectoryOptions): Promise<boolean> {
  if (!(await fs.pathExists(source))) {
    return false
  }

  if (await fs.pathExists(target)) {
    await fs.remove(target)
  }

  const entries = await fs.readdir(source, { withFileTypes: true })

  await fs.ensureDir(target)

  for (const entry of entries) {
    const sourcePath = path.join(source, entry.name)
    const targetPath = path.join(target, entry.name)

    if (entry.isDirectory()) {
      await copyDirectory({ source: sourcePath, target: targetPath, ignore, onIgnore })
      continue
    }

    if (ignore.includes(entry.name)) {
      if (onIgnore) {
        await onIgnore(sourcePath)
      }
      continue
    }

    await fs.copy(sourcePath, targetPath)
  }

  return true
}

export interface CopyFileOptions {
  source: string
  target: string
}

export interface EnsureDirectoryLinkOptions {
  source: string
  link: string
}

/**
 * Copy single file if available.
 */
export async function copyFile({ source, target }: CopyFileOptions): Promise<boolean> {
  if (!(await fs.pathExists(source))) {
    return false
  }

  await fs.ensureDir(path.dirname(target))
  await fs.copy(source, target, { overwrite: true })
  return true
}

/**
 * Ensure a directory symbolic link exists.
 */
export async function ensureDirectoryLink({ source, link }: EnsureDirectoryLinkOptions): Promise<boolean> {
  const process = await import('node:process')

  if (!(await fs.pathExists(source))) {
    return false
  }

  const linkExists = await fs.pathExists(link)

  if (linkExists) {
    const stats = await fs.lstat(link)

    if (!stats.isSymbolicLink()) {
      await fs.remove(link)
    } else {
      const currentTarget = await fs.readlink(link)
      const absoluteTarget = path.resolve(path.dirname(link), currentTarget)

      if (path.normalize(absoluteTarget) === path.normalize(source)) {
        return true
      }

      await fs.remove(link)
    }
  }

  await fs.ensureDir(path.dirname(link))

  const linkType = process.platform === 'win32' ? 'junction' : 'dir'
  await fs.ensureSymlink(source, link, linkType)

  return true
}

export async function linkOrCopyFile(source: string, target: string): Promise<boolean> {
  try {
    const targetDir = path.dirname(target)
    await fs.ensureDir(targetDir)

    const targetExists = await fs.pathExists(target)

    if (targetExists) {
      const stats = await fs.lstat(target)

      if (stats.isSymbolicLink()) {
        const currentTarget = await fs.readlink(target)
        const absoluteSource = path.resolve(source)
        const absoluteTarget = path.resolve(path.dirname(target), currentTarget)

        if (path.normalize(absoluteTarget) === path.normalize(absoluteSource)) {
          return false
        }

        await fs.remove(target)
      } else {
        const sourceStats = await fs.stat(source)
        const targetFileStats = await fs.stat(target)

        if (sourceStats.mtime <= targetFileStats.mtime) {
          return false
        }

        await fs.remove(target)
      }
    }

    try {
      const relativeSource = path.relative(targetDir, source)
      await fs.symlink(relativeSource, target, 'file')
      return true
    } catch {
      await fs.copy(source, target, { overwrite: true })
      return true
    }
  } catch {
    return false
  }
}