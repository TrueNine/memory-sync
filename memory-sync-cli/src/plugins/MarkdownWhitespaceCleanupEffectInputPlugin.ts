import type {
  CollectedInputContext,
  InputEffectContext,
  InputEffectResult,
  InputPluginContext
} from 'memory-sync-cli/src/types'
import {AbstractInputPlugin} from './AbstractInputPlugin'

/**
 * Result of the markdown whitespace cleanup effect.
 */
export interface WhitespaceCleanupEffectResult extends InputEffectResult {
  readonly modifiedFiles: string[]
  readonly skippedFiles: string[]
}

export class MarkdownWhitespaceCleanupEffectInputPlugin extends AbstractInputPlugin {
  constructor() {
    super('MarkdownWhitespaceCleanupEffectInputPlugin')
    this.registerEffect('markdown-whitespace-cleanup', this.cleanupWhitespace.bind(this), 30)
  }

  private async cleanupWhitespace(ctx: InputEffectContext): Promise<WhitespaceCleanupEffectResult> {
    const {fs, path, shadowProjectDir, dryRun, logger} = ctx

    const modifiedFiles: string[] = []
    const skippedFiles: string[] = []
    const errors: {path: string, error: Error}[] = []

    const dirsToScan = [ // Directories to scan (Requirement 3.1)
      path.join(shadowProjectDir, 'src'),
      path.join(shadowProjectDir, 'app'),
      path.join(shadowProjectDir, 'dist')
    ]

    for (const dir of dirsToScan) {
      if (!fs.existsSync(dir)) { // Skip non-existent directories gracefully (Requirement 3.6)
        logger.debug({action: 'whitespace-cleanup', message: 'Directory does not exist, skipping', dir})
        continue
      }

      this.processDirectory(ctx, dir, modifiedFiles, skippedFiles, errors, dryRun ?? false)
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
      ...hasErrors && {error: new Error(`${errors.length} errors occurred during cleanup`)}
    }
  }

  private processDirectory(
    ctx: InputEffectContext,
    dir: string,
    modifiedFiles: string[],
    skippedFiles: string[],
    errors: {path: string, error: Error}[],
    dryRun: boolean
  ): void {
    const {fs, path, logger} = ctx

    let entries: import('node:fs').Dirent[]
    try {
      entries = fs.readdirSync(dir, {withFileTypes: true})
    }
    catch (error) {
      errors.push({path: dir, error: error as Error})
      logger.warn({action: 'whitespace-cleanup', message: 'Failed to read directory', path: dir, error: (error as Error).message})
      return
    }

    for (const entry of entries) {
      const entryPath = path.join(dir, entry.name)

      if (entry.isDirectory()) {
        this.processDirectory(ctx, entryPath, modifiedFiles, skippedFiles, errors, dryRun) // Recursively process subdirectories
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        this.processMarkdownFile(ctx, entryPath, modifiedFiles, skippedFiles, errors, dryRun) // Process markdown files
      }
    }
  }

  private processMarkdownFile(
    ctx: InputEffectContext,
    filePath: string,
    modifiedFiles: string[],
    skippedFiles: string[],
    errors: {path: string, error: Error}[],
    dryRun: boolean
  ): void {
    const {fs, logger} = ctx

    try {
      const originalContent = fs.readFileSync(filePath, 'utf8')
      const cleanedContent = this.cleanMarkdownContent(originalContent)

      if (originalContent === cleanedContent) { // Skip if no changes needed (Requirement 3.4)
        skippedFiles.push(filePath)
        logger.debug({action: 'whitespace-cleanup', skipped: filePath, reason: 'no changes needed'})
        return
      }

      if (dryRun) { // Write cleaned content (Requirement 3.5 for dry-run)
        logger.debug({action: 'whitespace-cleanup', dryRun: true, wouldModify: filePath})
        modifiedFiles.push(filePath)
      } else {
        fs.writeFileSync(filePath, cleanedContent, 'utf8')
        modifiedFiles.push(filePath)
        logger.debug({action: 'whitespace-cleanup', modified: filePath})
      }
    }
    catch (error) {
      errors.push({path: filePath, error: error as Error})
      logger.warn({action: 'whitespace-cleanup', message: 'Failed to process file', path: filePath, error: (error as Error).message})
    }
  }

  cleanMarkdownContent(content: string): string {
    const lineEnding = this.detectLineEnding(content) // Detect line ending style (Requirement 3.7)

    const lines = content.split(/\r?\n/) // Split into lines (handle both LF and CRLF)

    const trimmedLines = lines.map(line => line.replace(/[ \t]+$/, '')) // Remove trailing whitespace from each line (Requirement 3.2)

    const result: string[] = [] // Reduce excessive blank lines (Requirement 3.3)
    let consecutiveBlankCount = 0

    for (const line of trimmedLines) {
      if (line === '') {
        consecutiveBlankCount++
        if (consecutiveBlankCount <= 2) result.push(line) // Only keep up to 2 consecutive blank lines
      } else {
        consecutiveBlankCount = 0
        result.push(line)
      }
    }

    return result.join(lineEnding)
  }

  detectLineEnding(content: string): '\r\n' | '\n' {
    if (content.includes('\r\n')) return '\r\n' // Check for CRLF first (Windows style)
    return '\n' // Default to LF (Unix style)
  }

  collect(_ctx: InputPluginContext): Partial<CollectedInputContext> {
    return {}
  }
}
