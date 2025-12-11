import path from 'node:path'
import fs from 'fs-extra'

/**
 * Ensure directory exists and remove all existing files
 */
export async function cleanAndEnsureDir(dirPath: string): Promise<void> {
  await fs.ensureDir(dirPath)

  try {
    const existingFiles = await fs.readdir(dirPath)

    for (const file of existingFiles) {
      const filePath = path.join(dirPath, file)
      await fs.remove(filePath)
    }
  } catch {
    // Directory might not exist or be accessible
  }
}

/**
 * Clean multiple directories in parallel
 */
export async function cleanAndEnsureDirs(dirPaths: readonly string[]): Promise<void> {
  await Promise.all(dirPaths.map(async (dirPath) => cleanAndEnsureDir(dirPath)))
}

/**
 * Remove specific files and directories from a base path
 */
export async function cleanTargetPaths(
  basePath: string,
  options: {
    files?: readonly string[]
    dirs?: readonly string[]
  },
): Promise<void> {
  const { files = [], dirs = [] } = options

  // Delete specific files
  for (const file of files) {
    const filePath = path.join(basePath, file)

    if (await fs.pathExists(filePath)) {
      await fs.remove(filePath)
    }
  }

  // Delete specific directories
  for (const dir of dirs) {
    const dirPath = path.join(basePath, dir)

    if (await fs.pathExists(dirPath)) {
      await fs.remove(dirPath)
    }
  }
}