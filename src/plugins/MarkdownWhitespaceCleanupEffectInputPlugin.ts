import type {InputEffectContext, InputEffectResult} from './AbstractInputPlugin'

import type {CollectedInputContext, InputPluginContext} from '@/types'
import {AbstractInputPlugin} from './AbstractInputPlugin'

/**
 * Result of the markdown whitespace cleanup effect.
 */
export interface WhitespaceCleanupEffectResult extends InputEffectResult {
  readonly modifiedFiles: string[]
  readonly skippedFiles: string[]
}

/**
 * Effect Input Plugin that cleans trailing whitespace and excessive blank lines in Markdown files.
 *
 * This plugin scans .md files in src/, app/, and dist/ directories and performs:
 * - Removal of trailing whitespace (spaces/tabs) from each line
 * - Reduction of consecutive blank lines > 2 to exactly 2 blank lines
 * - Preservation of original line ending style (LF or CRLF)
 *
 * Features:
 * - Scans src/, app/, dist/ directories recursively for .md files
 * - Detects and preserves line ending style (LF/CRLF)
 * - Skips files that require no changes (preserves timestamps)
 * - Supports dry-run mode for previewing operations
 * - Gracefully handles missing directories
 *
 * @example
 * ```
 * Before:
 *   "Hello World   \n"     (trailing spaces)
 *   "\n\n\n\n"             (4 blank lines)
 *
 * After:
 *   "Hello World\n"        (trailing spaces removed)
 *   "\n\n"                 (reduced to 2 blank lines)
 * ```
 */
export class MarkdownWhitespaceCleanupEffectInputPlugin extends AbstractInputPlugin {
  constructor() {
    super('MarkdownWhitespaceCleanupEffectInputPlugin')
    this.registerEffect('markdown-whitespace-cleanup', this.cleanupWhitespace.bind(this), 30)
  }

  /**
   * Effect handler that cleans whitespace in markdown files.
   */
  private async cleanupWhitespace(ctx: InputEffectContext): Promise<WhitespaceCleanupEffectResult> {
    const {fs, path, shadowProjectDir, dryRun, logger} = ctx

    const modifiedFiles: string[] = []
    const skippedFiles: string[] = []
    const errors: {path: string, error: Error}[] = []

    // Directories to scan (Requirement 3.1)
    const dirsToScan = [
      path.join(shadowProjectDir, 'src'),
      path.join(shadowProjectDir, 'app'),
      path.join(shadowProjectDir, 'dist'),
    ]

    for (const dir of dirsToScan) {
      // Skip non-existent directories gracefully (Requirement 3.6)
      if (!fs.existsSync(dir)) {
        logger.debug({action: 'whitespace-cleanup', message: 'Directory does not exist, skipping', dir})
        continue
      }

      this.processDirectory(
        ctx,
        dir,
        modifiedFiles,
        skippedFiles,
        errors,
        dryRun ?? false,
      )
    }

    const hasErrors = errors.length > 0
    if (hasErrors) logger.warn({action: 'whitespace-cleanup', errors: errors.map(e => ({path: e.path, error: e.error.message}))})

    return {
      success: !hasErrors,
      description: dryRun
        ? `Would modify ${modifiedFiles.length} files, skip ${skippedFiles.length} files`
        : `Modified ${modifiedFiles.length} files, skipped ${skippedFiles.length} files`,
      modifiedFiles,
      skippedFiles,
      ...hasErrors && {error: new Error(`${errors.length} errors occurred during cleanup`)},
    }
  }

  /**
   * Recursively process a directory for .md files.
   */
  private processDirectory(
    ctx: InputEffectContext,
    dir: string,
    modifiedFiles: string[],
    skippedFiles: string[],
    errors: {path: string, error: Error}[],
    dryRun: boolean,
  ): void {
    const {fs, path, logger} = ctx

    let entries: import('node:fs').Dirent[]
    try {
      entries = fs.readdirSync(dir, {withFileTypes: true})
    } catch (error) {
      errors.push({path: dir, error: error as Error})
      logger.warn({action: 'whitespace-cleanup', message: 'Failed to read directory', path: dir, error: (error as Error).message})
      return
    }

    for (const entry of entries) {
      const entryPath = path.join(dir, entry.name)

      if (entry.isDirectory()) {
        // Recursively process subdirectories
        this.processDirectory(ctx, entryPath, modifiedFiles, skippedFiles, errors, dryRun)
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        // Process markdown files
        this.processMarkdownFile(ctx, entryPath, modifiedFiles, skippedFiles, errors, dryRun)
      }
    }
  }

  /**
   * Process a single markdown file for whitespace cleanup.
   */
  private processMarkdownFile(
    ctx: InputEffectContext,
    filePath: string,
    modifiedFiles: string[],
    skippedFiles: string[],
    errors: {path: string, error: Error}[],
    dryRun: boolean,
  ): void {
    const {fs, logger} = ctx

    try {
      const originalContent = fs.readFileSync(filePath, 'utf8')
      const cleanedContent = this.cleanMarkdownContent(originalContent)

      // Skip if no changes needed (Requirement 3.4)
      if (originalContent === cleanedContent) {
        skippedFiles.push(filePath)
        logger.debug({action: 'whitespace-cleanup', skipped: filePath, reason: 'no changes needed'})
        return
      }

      // Write cleaned content (Requirement 3.5 for dry-run)
      if (dryRun) {
        logger.debug({action: 'whitespace-cleanup', dryRun: true, wouldModify: filePath})
        modifiedFiles.push(filePath)
      } else {
        fs.writeFileSync(filePath, cleanedContent, 'utf8')
        modifiedFiles.push(filePath)
        logger.debug({action: 'whitespace-cleanup', modified: filePath})
      }
    } catch (error) {
      errors.push({path: filePath, error: error as Error})
      logger.warn({action: 'whitespace-cleanup', message: 'Failed to process file', path: filePath, error: (error as Error).message})
    }
  }

  /**
   * Clean markdown content by removing trailing whitespace and reducing excessive blank lines.
   *
   * @param content - The original markdown content
   * @returns The cleaned markdown content with preserved line endings
   */
  cleanMarkdownContent(content: string): string {
    // Detect line ending style (Requirement 3.7)
    const lineEnding = this.detectLineEnding(content)

    // Split into lines (handle both LF and CRLF)
    const lines = content.split(/\r?\n/)

    // Remove trailing whitespace from each line (Requirement 3.2)
    const trimmedLines = lines.map(line => line.replace(/[ \t]+$/, ''))

    // Reduce excessive blank lines (Requirement 3.3)
    const result: string[] = []
    let consecutiveBlankCount = 0

    for (const line of trimmedLines) {
      if (line === '') {
        consecutiveBlankCount++
        // Only keep up to 2 consecutive blank lines
        if (consecutiveBlankCount <= 2) result.push(line)
      } else {
        consecutiveBlankCount = 0
        result.push(line)
      }
    }

    return result.join(lineEnding)
  }

  /**
   * Detect the line ending style used in the content.
   *
   * @param content - The content to analyze
   * @returns The detected line ending ('\r\n' for CRLF, '\n' for LF)
   */
  detectLineEnding(content: string): '\r\n' | '\n' {
    // Check for CRLF first (Windows style)
    if (content.includes('\r\n')) return '\r\n'
    // Default to LF (Unix style)
    return '\n'
  }

  /**
   * Collect method returns empty - this plugin only performs effects.
   */
  collect(_ctx: InputPluginContext): Partial<CollectedInputContext> {
    return {}
  }
}
