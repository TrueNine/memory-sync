import type {
  CollectedInputContext,
  InputEffectContext,
  InputEffectResult,
  InputPluginContext
} from '../plugins/plugin-core'
import {AbstractInputPlugin} from '../plugins/plugin-core'

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
    const {fs, path, aindexDir, dryRun, logger} = ctx

    const modifiedFiles: string[] = []
    const skippedFiles: string[] = []
    const errors: {path: string, error: Error}[] = []

    const dirsToScan = [
      path.join(aindexDir, 'src'),
      path.join(aindexDir, 'app'),
      path.join(aindexDir, 'dist')
    ]

    for (const dir of dirsToScan) {
      if (!fs.existsSync(dir)) {
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

      if (entry.isDirectory()) this.processDirectory(ctx, entryPath, modifiedFiles, skippedFiles, errors, dryRun)
      else if (entry.isFile() && entry.name.endsWith('.md')) this.processMarkdownFile(ctx, entryPath, modifiedFiles, skippedFiles, errors, dryRun)
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

      if (originalContent === cleanedContent) {
        skippedFiles.push(filePath)
        logger.debug({action: 'whitespace-cleanup', skipped: filePath, reason: 'no changes needed'})
        return
      }

      if (dryRun) {
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
    const lineEnding = this.detectLineEnding(content)
    const lines = content.split(/\r?\n/)
    const trimmedLines = lines.map(line => line.replace(/[ \t]+$/, ''))

    const result: string[] = []
    let consecutiveBlankCount = 0

    for (const line of trimmedLines) {
      if (line === '') {
        consecutiveBlankCount++
        if (consecutiveBlankCount <= 2) result.push(line)
      } else {
        consecutiveBlankCount = 0
        result.push(line)
      }
    }

    return result.join(lineEnding)
  }

  detectLineEnding(content: string): '\r\n' | '\n' {
    if (content.includes('\r\n')) return '\r\n'
    return '\n'
  }

  collect(_ctx: InputPluginContext): Partial<CollectedInputContext> {
    return {}
  }
}
