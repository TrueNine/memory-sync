import type { FrontMatterOptions } from '@/core'
import type { LogAdapter } from '../../log'
import path from 'node:path'
import fs from 'fs-extra'
import { addFrontMatter, FrontMatterType, generateFrontMatter } from '@/core'

import { calculateGlobPattern, FileSystemError, generateUniqueFileName } from '../../pathResolver'
import { LogMessages } from '../../logMessages'

/**
 * Options for generating a single rule file
 */
export interface RuleGenerationOptions {
  /**
   * Source file path to read content from
   */
  sourceFile: string
  /**
   * Target directory where the rule file will be created
   */
  targetDir: string
  /**
   * Front matter options for the rule file
   */
  frontMatterOptions: FrontMatterOptions
  /**
   * Base path for calculating relative paths and patterns
   */
  basePath: string
  /**
   * Optional custom file name generator
   * If not provided, uses generateUniqueFileName from pathResolver
   */
  fileNameGenerator?: (options: { sourcePath: string, basePath: string }) => string
  /**
   * Optional custom glob pattern generator
   * If not provided, uses calculateGlobPattern from pathResolver
   */
  globPatternGenerator?: (options: { sourcePath: string, basePath: string }) => string
  /**
   * Optional logger for operation logging
   */
  logger?: LogAdapter
}

/**
 * Result of batch rule generation
 */
export interface RuleGenerationResult {
  /**
   * Number of rules successfully generated
   */
  generated: number
  /**
   * Number of rules that failed to generate
   */
  failed: number
  /**
   * List of error messages for failed generations
   */
  errors: string[]
}

/**
 * Service for generating rule files with front matter
 */
export class RuleGeneratorService {
  /**
   * Generate a single rule file with front matter
   *
   * @param options - Rule generation options
   * @returns true if generation succeeded, false otherwise
   */
  async generateRuleFile(options: RuleGenerationOptions): Promise<boolean> {
    const {
      sourceFile,
      targetDir,
      frontMatterOptions,
      basePath,
      fileNameGenerator = generateUniqueFileName,
      globPatternGenerator = calculateGlobPattern,
      logger,
    } = options

    try {
      // Check if source file exists
      if (!(await fs.pathExists(sourceFile))) {
        throw new FileSystemError(`Source file not found: ${sourceFile}`, sourceFile)
      }

      // Read source file content
      const content = await fs.readFile(sourceFile, 'utf-8')

      // Determine the pattern for front matter if needed
      let frontMatterOpts = frontMatterOptions
      if (frontMatterOptions.type === FrontMatterType.KIRO_FILE_MATCH || frontMatterOptions.type === FrontMatterType.QODER_GLOB) {
        if (frontMatterOptions.filePattern == null) {
          const filePattern = globPatternGenerator({ sourcePath: sourceFile, basePath })
          frontMatterOpts = { ...frontMatterOptions, filePattern }
        }
      }

      // Generate front matter
      const frontMatter = generateFrontMatter(frontMatterOpts)

      // Add front matter to content
      const contentWithFrontMatter = addFrontMatter(content, frontMatter)

      // Generate target file name
      const targetFileName = fileNameGenerator({ sourcePath: sourceFile, basePath })
      const targetPath = path.join(targetDir, targetFileName)

      // Ensure target directory exists
      await fs.ensureDir(targetDir)

      // Write the rule file
      await fs.writeFile(targetPath, contentWithFrontMatter, 'utf-8')

      if (logger) {
        logger.debug(LogMessages.RULE_GENERATE_SUCCESS, targetPath)
      }

      return true
    } catch (error) {
      if (logger) {
        logger.error(LogMessages.RULE_GENERATE_ERROR, sourceFile, error)
      }
      return false
    }
  }

  /**
   * Generate multiple rule files in batch
   *
   * @param files - Array of source file paths
   * @param options - Common options for all rule generations
   * @returns Result summary with counts and errors
   */
  async batchGenerateRules(
    files: string[],
    options: Omit<RuleGenerationOptions, 'sourceFile'>,
  ): Promise<RuleGenerationResult> {
    const result: RuleGenerationResult = {
      generated: 0,
      failed: 0,
      errors: [],
    }

    for (const file of files) {
      const success = await this.generateRuleFile({
        ...options,
        sourceFile: file,
      })

      if (success) {
        result.generated++
      } else {
        result.failed++
        result.errors.push(`Failed to generate rule from: ${file}`)
      }
    }

    if (options.logger) {
      options.logger.info(LogMessages.OPERATION_COMPLETE)
      options.logger.debug('Batch generation: {} generated, {} failed', result.generated, result.failed)
    }

    return result
  }
}
