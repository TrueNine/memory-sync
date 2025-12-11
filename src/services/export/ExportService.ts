import type { Dirent } from 'node:fs'
import type { RuleGenerationOptions } from '../rule/RuleGeneratorService'
import type { FrontMatterOptions } from '@/core'
import type { LogAdapter } from '../../log'
import path from 'node:path'
import fs from 'fs-extra'
import { FrontMatterType } from '@/core'
import { cleanAndEnsureDir } from '../../dirCleaner'
import { findAgentsFiles } from '../fileWalker'
import { isInsideDirectory } from '../../pathResolver'
import { LogMessages } from '../../logMessages'
import { RuleGeneratorService } from '../rule/RuleGeneratorService'
import { MemoryRuleProcessor } from './MemoryRuleProcessor'

/**
 * Options for export operations
 */
export interface ExportOptions {
  /**
   * Source path to export from
   */
  sourcePath: string
  /**
   * Target path to export to
   */
  targetPath: string
  /**
   * Front matter type to use
   */
  frontMatterType: FrontMatterType
  /**
   * Whether to skip root level files
   */
  skipRoot?: boolean
  /**
   * Whether to process ref projects
   */
  processRefProjects?: boolean
  /**
   * Path to ref directory (required if processRefProjects is true)
   */
  refPath?: string
  /**
   * Optional logger for operation logging
   */
  logger?: LogAdapter
  /**
   * Glob patterns to exclude files and directories during export.
   */
  excludePatterns?: readonly string[]
  /**
   * Whether to clean target directory before export.
   * When true, removes all existing files from target before writing new files.
   */
  cleanTarget?: boolean
}

/**
 * Result of export operation
 */
export interface ExportResult {
  /**
   * Number of files successfully exported
   */
  exported: number
  /**
   * Number of files skipped
   */
  skipped: number
  /**
   * List of error messages
   */
  errors: string[]
}

/**
 * Options for memory-based ref export operations
 */
export interface RefMemoryExportOptions {
  /**
   * Path to ref directory
   */
  refPath: string
  /**
   * Target path to write rule files
   */
  targetPath: string
  /**
   * Front matter type to use
   */
  frontMatterType: FrontMatterType
  /**
   * Optional logger for operation logging
   */
  logger?: LogAdapter
}

/**
 * Service for exporting AGENTS.md files to different AI tool formats
 */
export class ExportService {
  private ruleGenerator: RuleGeneratorService
  private memoryProcessor: MemoryRuleProcessor

  constructor() {
    this.ruleGenerator = new RuleGeneratorService()
    this.memoryProcessor = new MemoryRuleProcessor()
  }

  /**
   * Export AGENTS.md files with specified front matter type
   *
   * @param options - Export options
   * @returns Export result with counts and errors
   */
  async exportAgentsFiles(options: ExportOptions): Promise<ExportResult> {
    const {
      sourcePath,
      targetPath,
      frontMatterType,
      skipRoot = true,
      processRefProjects = false,
      refPath,
      logger,
      excludePatterns = [],
      cleanTarget = true,
    } = options

    const result: ExportResult = {
      exported: 0,
      skipped: 0,
      errors: [],
    }

    try {
      // Ensure source path exists
      if (!(await fs.pathExists(sourcePath))) {
        const errorMsg = LogMessages.DIR_NOT_FOUND.replace('{}', sourcePath)
        result.errors.push(errorMsg)
        if (logger) {
          logger.error(LogMessages.DIR_NOT_FOUND, sourcePath)
        }
        return result
      }

      // Clean target directory if requested, otherwise just ensure it exists
      if (cleanTarget) {
        await cleanAndEnsureDir(targetPath)
      } else {
        await fs.ensureDir(targetPath)
      }

      // Find all AGENTS.md files
      let agentsFiles = await findAgentsFiles(sourcePath, {
        skipRoot,
        allowScripts: true,
        excludePatterns,
      })

      // Filter out ref directory files if not processing ref projects
      if (!processRefProjects && typeof refPath === 'string' && refPath.length > 0) {
        const beforeCount = agentsFiles.length
        const refPathValue = refPath
        agentsFiles = agentsFiles.filter((file: string) => !isInsideDirectory(file, refPathValue))
        result.skipped = beforeCount - agentsFiles.length
        if (result.skipped > 0 && logger) {
          logger.debug('Skipping {} AGENTS.md file(s) under ref/', result.skipped)
        }
      }

      // Export each file
      for (const agentsFile of agentsFiles) {
        const frontMatterOptions: FrontMatterOptions = {
          type: frontMatterType,
        }

        const ruleOptions: Omit<RuleGenerationOptions, 'sourceFile'> = {
          targetDir: targetPath,
          frontMatterOptions,
          basePath: sourcePath,
          ...(logger ? { logger } : {}),
        }

        const success = await this.ruleGenerator.generateRuleFile({
          ...ruleOptions,
          sourceFile: agentsFile,
        })

        if (success) {
          result.exported++
        } else {
          result.errors.push(`Failed to export: ${agentsFile}`)
        }
      }

      // Process ref projects if requested
      if (processRefProjects && typeof refPath === 'string' && refPath.length > 0 && (await fs.pathExists(refPath))) {
        const refResult = await this.processRefProjects(refPath, frontMatterType, logger)
        result.exported += refResult.exported
        result.errors.push(...refResult.errors)
      }

      if (logger) {
        logger.info(LogMessages.EXPORT_SUCCESS, result.exported)
        if (result.skipped > 0) {
          logger.debug(LogMessages.EXPORT_SKIPPED, `${result.skipped} file(s) under ref/`)
        }
      }

      return result
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      result.errors.push(errorMsg)
      if (logger) {
        logger.error(LogMessages.EXPORT_ERROR, errorMsg)
      }
      return result
    }
  }

  /**
   * Export to Kiro steering directory
   *
   * @param options - Export options
   * @returns Export result
   */
  async exportToKiro(options: Omit<ExportOptions, 'frontMatterType'>): Promise<ExportResult> {
    return this.exportAgentsFiles({
      ...options,
      frontMatterType: FrontMatterType.KIRO_FILE_MATCH,
    })
  }

  /**
   * Export to Qoder rules directory
   *
   * @param options - Export options
   * @returns Export result
   */
  async exportToQoder(options: Omit<ExportOptions, 'frontMatterType'>): Promise<ExportResult> {
    return this.exportAgentsFiles({
      ...options,
      frontMatterType: FrontMatterType.QODER_GLOB,
    })
  }

  /**
   * Process ref project dist directories
   */
  private async processRefProjects(
    refPath: string,
    frontMatterType: FrontMatterType,
    logger?: LogAdapter,
  ): Promise<ExportResult> {
    const result: ExportResult = {
      exported: 0,
      skipped: 0,
      errors: [],
    }

    try {
      const projectDirs: Dirent[] = await fs.readdir(refPath, { withFileTypes: true })

      for (const entry of projectDirs) {
        if (!entry.isDirectory()) {
          continue
        }

        const distPath = path.join(refPath, entry.name, 'dist')

        if (!(await fs.pathExists(distPath))) {
          continue
        }

        const projectResult = await this.processRefDistDirectory(
          distPath,
          entry.name,
          frontMatterType,
          logger,
        )

        result.exported += projectResult.exported
        result.errors.push(...projectResult.errors)
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      result.errors.push(`Failed to process ref projects: ${errorMsg}`)
      if (logger) {
        logger.error(LogMessages.OPERATION_SKIPPED, `ref projects: ${errorMsg}`)
      }
    }

    return result
  }

  /**
   * Process a single ref project dist directory
   */
  private async processRefDistDirectory(
    distPath: string,
    projectName: string,
    frontMatterType: FrontMatterType,
    logger?: LogAdapter,
  ): Promise<ExportResult> {
    const result: ExportResult = {
      exported: 0,
      skipped: 0,
      errors: [],
    }

    try {
      // Determine target directory based on front matter type
      let targetSubDir: string
      if (frontMatterType === FrontMatterType.KIRO_FILE_MATCH) {
        targetSubDir = path.join('.kiro', 'steering')
      } else if (frontMatterType === FrontMatterType.QODER_GLOB) {
        targetSubDir = path.join('.qoder', 'rules')
      } else {
        throw new Error(`Unsupported front matter type for ref projects: ${frontMatterType}`)
      }

      const targetPath = path.join(distPath, targetSubDir)
      await fs.emptyDir(targetPath)
      await fs.ensureDir(targetPath)

      // Find all AGENTS.md files in dist directory (skip root)
      const agentsFiles = await findAgentsFiles(distPath, {
        skipRoot: true,
        allowScripts: false,
      })

      // Export each file
      for (const agentsFile of agentsFiles) {
        const frontMatterOptions: FrontMatterOptions = {
          type: frontMatterType,
        }

        const ruleOptions: Omit<RuleGenerationOptions, 'sourceFile'> = {
          targetDir: targetPath,
          frontMatterOptions,
          basePath: distPath,
          ...(logger ? { logger } : {}),
        }

        const success = await this.ruleGenerator.generateRuleFile({
          ...ruleOptions,
          sourceFile: agentsFile,
        })

        if (success) {
          result.exported++
          if (logger) {
            logger.debug('Exported from ref/{} to {}', projectName, targetSubDir)
          }
        } else {
          result.errors.push(`Failed to export from ref/${projectName}: ${agentsFile}`)
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      result.errors.push(`Failed to process ref/${projectName}: ${errorMsg}`)
      if (logger) {
        logger.error(LogMessages.EXPORT_ERROR, `ref/${projectName}: ${errorMsg}`)
      }
    }

    return result
  }

  /**
   * Export ref projects using memory-based processing
   * Reads AGENTS.md files from ref projects and writes directly to root target directories
   *
   * @param options - Memory-based ref export options
   * @returns Export result with counts and errors
   */
  async exportRefProjectsInMemory(options: RefMemoryExportOptions): Promise<ExportResult> {
    const { refPath, targetPath, frontMatterType, logger } = options

    const result: ExportResult = {
      exported: 0,
      skipped: 0,
      errors: [],
    }

    try {
      // Ensure ref path exists
      if (!(await fs.pathExists(refPath))) {
        const errorMsg = LogMessages.DIR_NOT_FOUND.replace('{}', refPath)
        result.errors.push(errorMsg)
        if (logger) {
          logger.error(LogMessages.DIR_NOT_FOUND, refPath)
        }
        return result
      }

      // Ensure target directory exists
      await fs.ensureDir(targetPath)

      // Read all project directories under ref/
      const projectDirs = await fs.readdir(refPath, { withFileTypes: true }) as unknown as Dirent[]

      for (const entry of projectDirs) {
        if (!entry.isDirectory()) {
          continue
        }

        const projectName = entry.name
        const distPath = path.join(refPath, projectName, 'dist')

        // Skip if dist directory doesn't exist
        if (!(await fs.pathExists(distPath))) {
          if (logger) {
            logger.debug('Skipping ref/{}: dist directory not found', projectName)
          }
          continue
        }

        // Find all AGENTS.md files in dist directory
        const agentsFiles = await findAgentsFiles(distPath, {
          skipRoot: false,
          allowScripts: false,
        })

        // Process each AGENTS.md file
        for (const agentsFile of agentsFiles) {
          try {
            // Read file content
            const content = await fs.readFile(agentsFile, 'utf-8')

            // Calculate relative path from dist directory
            const relativePath = path.relative(path.join(refPath, projectName), agentsFile)

            // Process rule in memory
            const processedRule = this.memoryProcessor.processRule({
              content,
              projectName,
              relativePath: relativePath.replace(/[\\/]AGENTS\.md$/, ''),
              frontMatterType,
            })

            // Write directly to target directory
            const outputPath = path.join(targetPath, processedRule.filename)
            await fs.writeFile(outputPath, processedRule.content, 'utf-8')

            result.exported++
            if (logger) {
              logger.debug('Exported ref/{}/{} to {}', projectName, relativePath, processedRule.filename)
            }
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error)
            result.errors.push(`Failed to process ${agentsFile}: ${errorMsg}`)
            if (logger) {
              logger.error('Failed to process {}: {}', agentsFile, errorMsg)
            }
          }
        }
      }

      if (logger) {
        logger.info('Exported {} ref project rule(s) to {}', result.exported, targetPath)
      }

      return result
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      result.errors.push(errorMsg)
      if (logger) {
        logger.error(LogMessages.EXPORT_ERROR, errorMsg)
      }
      return result
    }
  }
}
