import type { LogAdapter } from './log'
import path from 'node:path'
import fs from 'fs-extra'
import { cleanAndEnsureDir } from './dirCleaner'

export interface RuleGeneratorOptions {
  /**
   * Source AGENTS.md file path
   */
  sourcePath: string
  /**
   * Target rule file path
   */
  targetPath: string
  /**
   * YAML front matter to add
   */
  frontMatter: string
  /**
   * Display name for logging
   */
  displayName: string
  /**
   * Logger instance
   */
  logger?: LogAdapter | undefined
}

/**
 * Generate a rule file from AGENTS.md with YAML front matter
 */
export async function generateRuleFile(options: RuleGeneratorOptions): Promise<boolean> {
  const { sourcePath, targetPath, frontMatter, displayName, logger } = options

  if (!(await fs.pathExists(sourcePath))) {
    return false
  }

  try {
    const targetDir = path.dirname(targetPath)
    await fs.ensureDir(targetDir)

    // Remove existing file if it exists
    if (await fs.pathExists(targetPath)) {
      await fs.remove(targetPath)
      logger?.debug('DELETED: {}', displayName)
    }

    const content = await fs.readFile(sourcePath, 'utf-8')
    await fs.writeFile(targetPath, frontMatter + content)

    logger?.info('{}', displayName)
    return true
  } catch (error) {
    logger?.error('Failed to generate {}', displayName)

    if (error instanceof Error) {
      logger?.error('  {}', error.message)
    }

    return false
  }
}

export interface RuleTarget {
  /**
   * Target directory path
   */
  dirPath: string
  /**
   * Target file name (e.g., '_project.md')
   */
  fileName: string
  /**
   * YAML front matter to add
   */
  frontMatter: string
  /**
   * Display name for logging (e.g., '.cursor/rules/_project.md')
   */
  displayName: string
}

/**
 * Generate multiple rule files from the same source
 */
export async function generateRuleFiles(
  sourcePath: string,
  targets: readonly RuleTarget[],
  logger?: LogAdapter,
): Promise<boolean> {
  if (!(await fs.pathExists(sourcePath))) {
    logger?.error('Source file not found at {}', sourcePath)
    return false
  }

  let allSuccess = true

  for (const target of targets) {
    // Clean and ensure target directory exists
    await cleanAndEnsureDir(target.dirPath)

    const targetPath = path.join(target.dirPath, target.fileName)

    const success = await generateRuleFile({
      sourcePath,
      targetPath,
      frontMatter: target.frontMatter,
      displayName: target.displayName,
      logger,
    })

    allSuccess = allSuccess && success
  }

  return allSuccess
}

/**
 * Generate a unique filename for the rule file based on directory path
 */
export function generateUniqueFilename(
  filePath: string,
  basePath: string,
  options?: {
    prefix?: string
    extension?: string
  },
): string {
  const { prefix = '_', extension = '.md' } = options ?? {}

  // Get relative path from base path
  const relativePath = path.relative(basePath, filePath).replace(/\\/g, '/')
  // Get directory name
  const dirName = path.dirname(relativePath)

  // Replace path separators with underscores, escape dots with ___
  const uniqueName = dirName.replace(/[\\/]/g, '_').replace(/\./g, '___')

  return `${prefix}${uniqueName}${extension}`
}

/**
 * Calculate glob pattern for a file relative to base path
 */
export function calculateGlobPattern(filePath: string, basePath: string): string {
  const dirPath = path.dirname(filePath)
  const relativePath = path.relative(basePath, dirPath).replace(/\\/g, '/')

  if (!relativePath || relativePath === '.') {
    return '**/*'
  }

  return `${relativePath}/**/*`
}

export interface BatchRuleGeneratorOptions {
  /**
   * Source files to process
   */
  sourceFiles: readonly string[]
  /**
   * Base path for calculating relative paths
   */
  basePath: string
  /**
   * Target directories for rule files
   */
  targets: {
    qoderDir: string
    codebuddyDir: string
  }
  /**
   * Function to generate YAML front matter
   */
  frontMatterGenerator: (globPattern: string) => string
  /**
   * Logger instance
   */
  logger?: LogAdapter
}

/**
 * Generate rule files for multiple source files in batch
 */
export async function batchGenerateRuleFiles(options: BatchRuleGeneratorOptions): Promise<number> {
  const { sourceFiles, basePath, targets, frontMatterGenerator, logger } = options

  let exportedCount = 0

  for (const sourceFile of sourceFiles) {
    try {
      const uniqueFilename = generateUniqueFilename(sourceFile, basePath)
      const globPattern = calculateGlobPattern(sourceFile, basePath)

      // Generate qoder rule file
      const qoderRuleFile = path.join(targets.qoderDir, uniqueFilename)
      const qoderSuccess = await generateRuleFile({
        sourcePath: sourceFile,
        targetPath: qoderRuleFile,
        frontMatter: frontMatterGenerator(globPattern),
        displayName: uniqueFilename,
        logger,
      })

      // Generate codebuddy rule file
      const codebuddyRuleFile = path.join(
        targets.codebuddyDir,
        uniqueFilename.replace(/\.md$/, '.mdc'),
      )
      const codebuddySuccess = await generateRuleFile({
        sourcePath: sourceFile,
        targetPath: codebuddyRuleFile,
        frontMatter: frontMatterGenerator(globPattern),
        displayName: uniqueFilename.replace(/\.md$/, '.mdc'),
        logger,
      })

      if (qoderSuccess && codebuddySuccess) {
        logger?.info('EXPORTED: {} (glob: {}) to .qoder and .codebuddy', uniqueFilename, globPattern)
        exportedCount++
      }
    } catch (error) {
      logger?.error('ERROR: Failed to export {}', sourceFile)

      if (error instanceof Error) {
        logger?.error('  {}', error.message)
      }
    }
  }

  return exportedCount
}
