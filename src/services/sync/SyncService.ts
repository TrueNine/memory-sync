import type { LogAdapter } from '../../utils/log'
import path from 'node:path'
import process from 'node:process'
import fs from 'fs-extra'
import { FileSystemError } from '../../utils/errors'
import { findAgentsFiles, matchesExcludePattern } from '../../utils/fileWalker'
import { LogMessages } from '../../utils/logMessages'

/**
 * Options for sync operations
 */
export interface SyncOptions {
  /**
   * Source directory path
   */
  source: string
  /**
   * Target directory path
   */
  target: string
  /**
   * Whether to create symlinks instead of copying
   */
  createSymlinks?: boolean
  /**
   * Whether to clean target directory before syncing
   */
  cleanTarget?: boolean
  /**
   * Glob patterns to exclude files and directories during sync.
   * Supports patterns like:
   * - ref/star/dist - matches any dist directory under any subdirectory of ref/
   * - starstar/node_modules - matches node_modules at any depth
   * - star.log - matches files ending with .log
   */
  excludePatterns?: readonly string[]
  /**
   * Optional logger for operation logging
   */
  logger?: LogAdapter
}

/**
 * Result of sync operation
 */
export interface SyncResult {
  /**
   * Number of files copied
   */
  copied: number
  /**
   * Number of symlinks created
   */
  linked: number
  /**
   * Number of files deleted
   */
  deleted: number
  /**
   * List of error messages
   */
  errors: string[]
}

/**
 * Service for syncing files and directories
 */
export class SyncService {
  /**
   * Sync directory contents from source to target
   *
   * @param options - Sync options
   * @returns Sync result with counts and errors
   */
  async syncDirectory(options: SyncOptions): Promise<SyncResult> {
    const {
      source,
      target,
      createSymlinks = false,
      cleanTarget = true,
      excludePatterns = [],
      logger,
    } = options

    const result: SyncResult = {
      copied: 0,
      linked: 0,
      deleted: 0,
      errors: [],
    }

    try {
      // Check if source exists
      if (!(await fs.pathExists(source))) {
        throw new FileSystemError(`Source directory not found: ${source}`, source)
      }

      // Clean target if requested
      if (cleanTarget) {
        if (await fs.pathExists(target)) {
          await fs.emptyDir(target)
          if (logger) {
            logger.debug(LogMessages.DIR_CLEAN_SUCCESS, target)
          }
        }
      }

      // Ensure target directory exists
      await fs.ensureDir(target)

      // Create filter function for exclude patterns
      const copyFilter = (src: string): boolean => {
        if (excludePatterns.length === 0) {
          return true
        }
        const relativePath = path.relative(source, src)
        // Always include the source directory itself
        if (relativePath === '') {
          return true
        }
        return !matchesExcludePattern(relativePath, excludePatterns)
      }

      // Copy or link files
      if (createSymlinks) {
        try {
          // Remove target if it exists
          if (await fs.pathExists(target)) {
            await fs.remove(target)
          }

          const linkType = process.platform === 'win32' ? 'junction' : 'dir'
          await fs.ensureSymlink(source, target, linkType)
          result.linked = 1
          if (logger) {
            logger.debug(LogMessages.SYMLINK_CREATE_SUCCESS, source, target)
          }
        } catch {
          // Fall back to copying if symlink creation fails (e.g., permission issues on Windows)
          await fs.copy(source, target, { overwrite: true, filter: copyFilter })
          result.copied = 1
          if (logger) {
            logger.debug(LogMessages.FILE_COPY_SUCCESS, `${source} (symlink fallback)`)
          }
        }
      } else {
        await fs.copy(source, target, { overwrite: true, filter: copyFilter })
        result.copied = 1
        if (logger) {
          logger.debug(LogMessages.FILE_COPY_SUCCESS, `${source} -> ${target}`)
        }
      }

      return result
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      result.errors.push(errorMsg)
      if (logger) {
        logger.error(LogMessages.SYNC_ERROR, errorMsg)
      }
      return result
    }
  }

  /**
   * Sync AGENTS.md files to CLAUDE.md by creating symlinks
   *
   * @param basePath - Base path to search for AGENTS.md files
   * @param options - Additional options
   * @param options.allowScripts - Whether to include .scripts directory
   * @param options.logger - Optional logger for operation logging
   * @returns Sync result
   */
  async syncAgentsToClaude(
    basePath: string,
    options?: {
      allowScripts?: boolean
      logger?: LogAdapter
    },
  ): Promise<SyncResult> {
    const { allowScripts = true, logger } = options ?? {}

    const result: SyncResult = {
      copied: 0,
      linked: 0,
      deleted: 0,
      errors: [],
    }

    try {
      // First, clean all existing CLAUDE.md files
      const cleanResult = await this.cleanAllClaudeMd(basePath, { allowScripts, ...(logger && { logger }) })
      result.deleted = cleanResult

      // Find all AGENTS.md files
      const agentsFiles = await findAgentsFiles(basePath, {
        skipRoot: false,
        allowScripts,
      })

      // Create symlinks for each AGENTS.md -> CLAUDE.md
      for (const agentsFile of agentsFiles) {
        try {
          const claudeFile = path.join(path.dirname(agentsFile), 'CLAUDE.md')

          // Try to create symlink, fall back to copy on Windows permission issues
          try {
            const relativeSource = path.relative(path.dirname(claudeFile), agentsFile)
            await fs.symlink(relativeSource, claudeFile, 'file')
            result.linked++
            if (logger) {
              logger.debug(LogMessages.SYMLINK_CREATE_SUCCESS, claudeFile, agentsFile)
            }
          } catch {
            // Fall back to copying if symlink fails (e.g., Windows permissions)
            await fs.copy(agentsFile, claudeFile, { overwrite: true })
            result.copied++
            if (logger) {
              logger.debug(LogMessages.FILE_COPY_SUCCESS, `${agentsFile} (symlink fallback)`)
            }
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error)
          result.errors.push(`Failed to sync ${agentsFile}: ${errorMsg}`)
          if (logger) {
            logger.error(LogMessages.SYNC_ERROR, `${agentsFile}: ${errorMsg}`)
          }
        }
      }

      if (logger) {
        logger.info(LogMessages.SYNC_SUCCESS, result.linked + result.copied)
      }

      return result
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      result.errors.push(errorMsg)
      if (logger) {
        logger.error(LogMessages.SYNC_ERROR, errorMsg)
      }
      return result
    }
  }

  /**
   * Clean all CLAUDE.md files (including symlinks) in the project
   *
   * @param basePath - Base path to search for CLAUDE.md files
   * @param options - Additional options
   * @param options.allowScripts - Whether to include .scripts directory
   * @param options.logger - Optional logger for operation logging
   * @returns Number of files deleted
   */
  private async cleanAllClaudeMd(
    basePath: string,
    options?: {
      allowScripts?: boolean
      logger?: LogAdapter
    },
  ): Promise<number> {
    const { allowScripts = true, logger } = options ?? {}

    let deletedCount = 0

    try {
      // Find all CLAUDE.md files
      const claudeFiles = await this.findClaudeMdFiles(basePath, allowScripts)

      // Delete each CLAUDE.md file
      for (const claudeFile of claudeFiles) {
        try {
          if (await fs.pathExists(claudeFile)) {
            await fs.remove(claudeFile)
            deletedCount++

            if (logger) {
              logger.debug(LogMessages.FILE_DELETE_SUCCESS, claudeFile)
            }
          }
        } catch (error) {
          if (logger) {
            logger.error(LogMessages.FILE_DELETE_ERROR, claudeFile, error)
          }
        }
      }

      return deletedCount
    } catch (error) {
      if (logger) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        logger.error(LogMessages.OPERATION_SKIPPED, `clean CLAUDE.md files: ${errorMsg}`)
      }
      return deletedCount
    }
  }

  /**
   * Find all CLAUDE.md files in a directory tree
   */
  private async findClaudeMdFiles(basePath: string, allowScripts: boolean): Promise<string[]> {
    const claudeFiles: string[] = []

    const walk = async (dirPath: string): Promise<void> => {
      try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true })

        for (const entry of entries) {
          const fullPath = path.join(dirPath, entry.name)

          if (entry.isDirectory()) {
            // Skip .scripts directory if not allowed
            if (!allowScripts && entry.name === '.scripts') {
              continue
            }

            // Skip node_modules and other common directories
            if (entry.name === 'node_modules' || entry.name === '.git') {
              continue
            }

            await walk(fullPath)
          } else if (entry.isFile() && entry.name === 'CLAUDE.md') {
            claudeFiles.push(fullPath)
          } else if (entry.isSymbolicLink()) {
            // Check if symlink points to CLAUDE.md
            try {
              const stats = await fs.lstat(fullPath)
              if (stats.isSymbolicLink() && entry.name === 'CLAUDE.md') {
                claudeFiles.push(fullPath)
              }
            } catch {
              // Ignore broken symlinks
            }
          }
        }
      } catch {
        // Ignore directories we can't read
      }
    }

    await walk(basePath)
    return claudeFiles
  }

  /**
   * Sync skills directory to multiple target locations
   *
   * @param sourcePath - Source skills directory path
   * @param targets - Array of target directory paths
   * @param options - Additional options
   * @param options.logger - Optional logger for operation logging
   * @returns Sync result
   */
  async syncSkills(
    sourcePath: string,
    targets: string[],
    options?: {
      logger?: LogAdapter
    },
  ): Promise<SyncResult> {
    const { logger } = options ?? {}

    const result: SyncResult = {
      copied: 0,
      linked: 0,
      deleted: 0,
      errors: [],
    }

    try {
      // Check if source exists
      if (!(await fs.pathExists(sourcePath))) {
        throw new FileSystemError(`Source directory not found: ${sourcePath}`, sourcePath)
      }

      // Sync to each target
      for (const target of targets) {
        try {
          const syncResult = await this.syncDirectory({
            source: sourcePath,
            target,
            createSymlinks: false,
            cleanTarget: true,
            ...(logger && { logger }),
          })

          result.copied += syncResult.copied
          result.linked += syncResult.linked
          result.deleted += syncResult.deleted
          result.errors.push(...syncResult.errors)
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error)
          result.errors.push(`Failed to sync to ${target}: ${errorMsg}`)
          if (logger) {
            logger.error(LogMessages.SYNC_ERROR, `${target}: ${errorMsg}`)
          }
        }
      }

      if (logger) {
        logger.info(LogMessages.SYNC_SUCCESS, result.copied)
      }

      return result
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      result.errors.push(errorMsg)
      if (logger) {
        logger.error(LogMessages.SYNC_ERROR, errorMsg)
      }
      return result
    }
  }
}
