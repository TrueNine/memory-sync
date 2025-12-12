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
