import type { LogAdapter } from '../../utils/log'
import path from 'node:path'
import fs from 'fs-extra'
import { FileSystemError } from '../../utils/errors'
import { LogMessages } from '../../utils/logMessages'

/**
 * Options for cleanup operations
 */
export interface CleanupOptions {
  /**
   * Path to ref directory (e.g., 'ref/')
   */
  refPath: string
  /**
   * Files to preserve during cleanup
   */
  preserveFiles: string[]
  /**
   * Optional logger for operation logging
   */
  logger?: LogAdapter
}

/**
 * Result of cleanup operation
 */
export interface CleanupResult {
  /**
   * Number of directories successfully cleaned
   */
  cleaned: number
  /**
   * List of error messages
   */
  errors: string[]
}

/**
 * Service for cleaning up intermediate directories in ref project dist directories
 */
export class RefDistCleanupService {
  /**
   * Directories to remove from ref project dist directories
   */
  private readonly INTERMEDIATE_DIRS = [
    '.agent',
    '.codebuddy',
    '.kiro',
    '.qoder',
    '.windsurf',
  ]

  /**
   * Clean intermediate directories from all ref project dist directories
   *
   * @param options - Cleanup options
   * @returns Cleanup result with counts and errors
   */
  async cleanRefDistDirectories(options: CleanupOptions): Promise<CleanupResult> {
    const { refPath, preserveFiles, logger } = options

    const result: CleanupResult = {
      cleaned: 0,
      errors: [],
    }

    try {
      if (!(await fs.pathExists(refPath))) {
        const errorMsg = LogMessages.DIR_NOT_FOUND.replace('{}', refPath)
        throw new FileSystemError(errorMsg, refPath)
      }

      const projectDirs = await fs.readdir(refPath, { withFileTypes: true })

      for (const entry of projectDirs) {
        if (!entry.isDirectory()) {
          continue
        }

        const distPath = path.join(refPath, entry.name, 'dist')

        if (!(await fs.pathExists(distPath))) {
          continue
        }

        const cleanupCount = await this.cleanDistDirectory(
          distPath,
          entry.name,
          preserveFiles,
          logger,
        )

        result.cleaned += cleanupCount
      }

      if (logger && result.cleaned > 0) {
        logger.info('Cleaned {} intermediate director(ies) from ref/*/dist/', result.cleaned)
      }

      return result
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      result.errors.push(errorMsg)
      if (logger) {
        logger.error(LogMessages.OPERATION_SKIPPED, `cleanup: ${errorMsg}`)
      }
      return result
    }
  }

  /**
   * Clean intermediate directories from a single dist directory
   */
  private async cleanDistDirectory(
    distPath: string,
    projectName: string,
    preserveFiles: string[],
    logger?: LogAdapter,
  ): Promise<number> {
    let cleanedCount = 0

    for (const dirName of this.INTERMEDIATE_DIRS) {
      const dirPath = path.join(distPath, dirName)

      try {
        if (await fs.pathExists(dirPath)) {
          await fs.remove(dirPath)
          cleanedCount++
          if (logger) {
            logger.debug('Removed {} from ref/{}/dist/', dirName, projectName)
          }
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        if (logger) {
          logger.warn('Failed to remove {} from ref/{}/dist/: {}', dirName, projectName, errorMsg)
        }
      }
    }

    await this.cleanUnpreservedFiles(distPath, projectName, preserveFiles, logger)

    return cleanedCount
  }

  /**
   * Remove files that are not in the preserve list
   */
  private async cleanUnpreservedFiles(
    distPath: string,
    projectName: string,
    preserveFiles: string[],
    logger?: LogAdapter,
  ): Promise<void> {
    try {
      const entries = await fs.readdir(distPath, { withFileTypes: true })

      for (const entry of entries) {
        if (entry.isFile() && !preserveFiles.includes(entry.name)) {
          const filePath = path.join(distPath, entry.name)
          try {
            await fs.remove(filePath)
            if (logger) {
              logger.debug('Removed unpreserved file {} from ref/{}/dist/', entry.name, projectName)
            }
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error)
            if (logger) {
              logger.warn('Failed to remove {} from ref/{}/dist/: {}', entry.name, projectName, errorMsg)
            }
          }
        }
      }
    } catch (error) {
      if (logger) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        logger.warn('Failed to clean unpreserved files from ref/{}/dist/: {}', projectName, errorMsg)
      }
    }
  }
}
