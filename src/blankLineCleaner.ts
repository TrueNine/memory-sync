import fs from 'fs-extra'
import { walkFiles } from './fileWalker'

export interface CleanBlankLinesOptions {
/**
 * Base directory to start processing from
 */
  baseDir: string
  /**
   * File extensions to process (e.g., ['.md', '.ts'])
   * If not provided, processes all files
   */
  extensions?: string[]
  /**
   * Additional directories to skip beyond the default
   */
  skipDirs?: string[]
  /**
   * Whether to process the operation (dry run if false)
   */
  dryRun?: boolean
}

export interface CleanBlankLinesResult {
/**
 * Total number of files processed
 */
  processedCount: number
  /**
   * Number of files that were modified
   */
  modifiedCount: number
  /**
   * List of modified file paths
   */
  modifiedFiles: string[]
}

/**
 * Clean whitespace from blank lines in content
 * 
 * @param content - Content to clean
 * @returns Cleaned content
 */
function cleanBlankLinesInContent(content: string): string {
  // Replace blank lines with indentation to just newlines
  // Match lines that only contain whitespace (spaces or tabs)
  return content.replace(/^[ \t]+$/gm, '')
}

/**
 * Remove indentation spaces from blank lines in files
 * This saves tokens when files are used as prompts
 *
 * @param options - Configuration options
 * @returns Result summary
 */
export async function cleanBlankLines(
  options: CleanBlankLinesOptions,
): Promise<CleanBlankLinesResult> {
  const {
    baseDir,
    extensions,
    skipDirs = [],
    dryRun = false,
  } = options

  const defaultSkipDirs = ['node_modules', '.git', 'dist', 'build', 'coverage']
  const allSkipDirs = [...new Set([...defaultSkipDirs, ...skipDirs])]

  const result: CleanBlankLinesResult = {
    processedCount: 0,
    modifiedCount: 0,
    modifiedFiles: [],
  }

  // Find all files matching the criteria
  const walkOptions: Parameters<typeof walkFiles>[0] = {
    baseDir,
    skipDirs: allSkipDirs,
    skipHidden: false,
  }

  if (extensions) {
    walkOptions.fileFilter = (_filePath, fileName) => {
      const ext = fileName.substring(fileName.lastIndexOf('.'))
      return extensions.includes(ext)
    }
  }

  const files = await walkFiles(walkOptions)

  // Process each file
  for (const filePath of files) {
    result.processedCount++

    try {
      const content = await fs.readFile(filePath, 'utf-8')

      // Clean blank lines using shared function
      const modifiedContent = cleanBlankLinesInContent(content)

      if (content !== modifiedContent) {
        if (!dryRun) {
          await fs.writeFile(filePath, modifiedContent, 'utf-8')
        }
        result.modifiedCount++
        result.modifiedFiles.push(filePath)
      }
    } catch {
      // Skip files that cannot be read or written
    }
  }

  return result
}

/**
 * Clean blank lines in a single file
 *
 * @param filePath - Path to the file to process
 * @returns True if the file was modified, false otherwise
 */
export async function cleanBlankLinesInFile(filePath: string): Promise<boolean> {
  try {
    const content = await fs.readFile(filePath, 'utf-8')
    
    // Clean blank lines using shared function
    const modifiedContent = cleanBlankLinesInContent(content)

    if (content !== modifiedContent) {
      await fs.writeFile(filePath, modifiedContent, 'utf-8')
      return true
    }

    return false
  } catch {
    return false
  }
}