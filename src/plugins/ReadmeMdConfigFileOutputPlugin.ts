import type {
  OutputPluginContext,
  OutputWriteContext,
  WriteResult,
  WriteResults,
} from '@/types'
import type { RelativePath } from '@/types/FileSystemTypes'

import * as fs from 'node:fs'
import * as path from 'node:path'
import { FilePathKind } from '@/types'
import { AbstractOutputPlugin } from './AbstractOutputPlugin'

const README_FILE_NAME = 'README.md'

/**
 * Output plugin for writing README.md files to project directories.
 * Reads README prompts collected by ReadmeMdInputPlugin and writes them
 * to the corresponding project directories.
 *
 * Supports:
 * - Root README files (written to project root)
 * - Child README files (written to project subdirectories)
 * - Dry-run mode (preview without writing)
 * - Clean operation (delete generated files)
 *
 * @see Requirements 3.1, 3.2, 3.3, 3.4, 4.1, 4.2, 4.3, 5.1, 5.2, 5.3, 5.4, 6.2
 */
export class ReadmeMdConfigFileOutputPlugin extends AbstractOutputPlugin {
  constructor() {
    super('ReadmeMdConfigFileOutputPlugin', {
      outputFileName: README_FILE_NAME,
    })
  }

  /**
   * Register all README.md output file paths for clean operation.
   * Returns paths for all README files that would be written by this plugin.
   *
   * @see Requirements 5.1, 5.2
   */
  async registerProjectOutputFiles(ctx: OutputPluginContext): Promise<RelativePath[]> {
    const results: RelativePath[] = []
    const { readmePrompts } = ctx.collectedInputContext

    if (readmePrompts == null || readmePrompts.length === 0) {
      return results
    }

    for (const readme of readmePrompts) {
      const targetDir = readme.targetDir
      const filePath = path.join(targetDir.path, README_FILE_NAME)

      results.push({
        pathKind: FilePathKind.Relative,
        path: filePath,
        basePath: targetDir.basePath,
        getDirectoryName: () => targetDir.getDirectoryName(),
        getAbsolutePath: () => path.join(targetDir.basePath, filePath),
      })
    }

    return results
  }

  /**
   * Check if there are README prompts to write.
   *
   * @see Requirements 6.2
   */
  async canWrite(ctx: OutputWriteContext): Promise<boolean> {
    const { readmePrompts } = ctx.collectedInputContext

    if (readmePrompts == null || readmePrompts.length === 0) {
      this.log.debug('skipped', { reason: 'no README prompts to write' })
      return false
    }

    return true
  }

  /**
   * Write README.md files to project directories.
   * Handles both root and child README files.
   *
   * In dry-run mode, logs what would be written without actual file operations.
   *
   * @see Requirements 3.1, 3.2, 3.3, 3.4, 4.1, 4.2, 4.3
   */
  async writeProjectOutputs(ctx: OutputWriteContext): Promise<WriteResults> {
    const fileResults: WriteResult[] = []
    const dirResults: WriteResult[] = []
    const { readmePrompts } = ctx.collectedInputContext

    if (readmePrompts == null || readmePrompts.length === 0) {
      return { files: fileResults, dirs: dirResults }
    }

    for (const readme of readmePrompts) {
      const result = await this.writeReadmeFile(ctx, readme)
      fileResults.push(result)
    }

    return { files: fileResults, dirs: dirResults }
  }

  /**
   * Write a single README.md file.
   *
   * @param ctx - Output write context
   * @param readme - README prompt to write
   * @param readme.projectName - Project name
   * @param readme.targetDir - Target directory path
   * @param readme.content - README content
   * @param readme.isRoot - Whether this is a root README
   * @returns Write result
   */
  private async writeReadmeFile(
    ctx: OutputWriteContext,
    readme: { projectName: string, targetDir: RelativePath, content: unknown, isRoot: boolean },
  ): Promise<WriteResult> {
    const targetDir = readme.targetDir
    const filePath = path.join(targetDir.path, README_FILE_NAME)
    const fullPath = path.join(targetDir.basePath, filePath)
    const content = readme.content as string

    const relativePath: RelativePath = {
      pathKind: FilePathKind.Relative,
      path: filePath,
      basePath: targetDir.basePath,
      getDirectoryName: () => targetDir.getDirectoryName(),
      getAbsolutePath: () => fullPath,
    }

    const label = readme.isRoot
      ? `project:${readme.projectName}/README.md`
      : `project:${readme.projectName}/${targetDir.path}/README.md`

    // Dry-run mode: log without writing
    if (ctx.dryRun === true) {
      this.log.trace({ action: 'dryRun', type: 'readme', path: fullPath, label })
      return { path: relativePath, success: true, skipped: false }
    }

    // Actual write operation
    try {
      // Ensure target directory exists
      const dir = path.dirname(fullPath)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }

      fs.writeFileSync(fullPath, content, 'utf-8')
      this.log.trace({ action: 'write', type: 'readme', path: fullPath, label })
      return { path: relativePath, success: true }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      this.log.error({ action: 'write', type: 'readme', path: fullPath, label, error: errMsg })
      return { path: relativePath, success: false, error: error as Error }
    }
  }
}
