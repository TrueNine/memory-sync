import type { Logger } from '@/log'
import type {
  OutputPlugin,
  OutputWriteContext,
  WriteResult,
  WriteResults,
} from '@/types'
import type { Path, RelativePath } from '@/types/FileSystemTypes'

import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import process from 'node:process'
import { FilePathKind, PluginKind } from '@/types'
import { AbstractPlugin } from './AbstractPlugin'

/**
 * Options for configuring AbstractOutputPlugin subclasses.
 */
export interface AbstractOutputPluginOptions {
  /**
   * Global configuration directory name (e.g., '.claude', '.gemini', '.kiro').
   * This is the directory name under the user's home directory.
   * @default undefined - Subclasses should set this value
   */
  globalConfigDir?: string

  /**
   * Output file name (e.g., 'CLAUDE.md', 'GEMINI.md', 'AGENTS.md').
   * @default undefined - Subclasses should set this value
   */
  outputFileName?: string

  /**
   * Plugin dependency list.
   */
  dependsOn?: readonly string[]
}

/**
 * Abstract base class for output plugins.
 * Provides common functionality for writing data to the file system.
 *
 * @example
 * ```typescript
 * class MyOutputPlugin extends AbstractOutputPlugin {
 *   constructor() {
 *     super('MyOutputPlugin', {
 *       globalConfigDir: '.myconfig',
 *       outputFileName: 'OUTPUT.md',
 *     })
 *   }
 *
 *   async writeProjectOutputs(ctx: OutputWriteContext): Promise<WriteResults> {
 *     // ... write project outputs using inherited utility methods
 *     return { files: [], dirs: [] }
 *   }
 * }
 * ```
 */
export abstract class AbstractOutputPlugin extends AbstractPlugin<PluginKind.Output> implements OutputPlugin {
  /**
   * Logger instance inherited from AbstractPlugin.
   * Exposed for compatibility with OutputPlugin interface.
   */
  declare readonly log: Logger

  /**
   * Global configuration directory name (e.g., '.claude', '.gemini').
   * Used by getGlobalConfigDir() to construct the full path.
   */
  protected readonly globalConfigDir: string

  /**
   * Output file name (e.g., 'CLAUDE.md', 'GEMINI.md').
   * Used when writing output files.
   */
  protected readonly outputFileName: string

  /**
   * Creates a new AbstractOutputPlugin instance.
   * Automatically sets the plugin type to PluginKind.Output.
   *
   * @param name - The unique name of the plugin
   * @param options - Optional configuration options
   */
  protected constructor(name: string, options?: AbstractOutputPluginOptions) {
    super(name, PluginKind.Output, options?.dependsOn)
    this.globalConfigDir = options?.globalConfigDir ?? ''
    this.outputFileName = options?.outputFileName ?? ''
  }

  /**
   * Type guard to check if a path is a RelativePath.
   *
   * @param p - The path to check
   * @returns True if the path is a RelativePath, false otherwise
   *
   * @example
   * ```typescript
   * if (this.isRelativePath(somePath)) {
   *   // somePath is now typed as RelativePath
   *   console.log(somePath.basePath)
   * }
   * ```
   */
  protected isRelativePath(p: Path): p is RelativePath {
    return p.pathKind === FilePathKind.Relative
  }

  /**
   * Convert any Path to a RelativePath.
   * If the path is already relative, returns it as-is.
   * Otherwise, creates a RelativePath with an empty basePath.
   *
   * @param p - The path to convert
   * @returns A RelativePath representation of the input path
   *
   * @example
   * ```typescript
   * const relativePath = this.toRelativePath(somePath)
   * ```
   */
  protected toRelativePath(p: Path): RelativePath {
    if (this.isRelativePath(p)) {
      return p
    }
    // Fallback for non-relative paths
    return {
      pathKind: FilePathKind.Relative,
      path: p.path,
      basePath: '',
      getDirectoryName: p.getDirectoryName,
      getAbsolutePath: () => p.path,
    }
  }

  /**
   * Resolve a Path to its full absolute path string.
   * Handles absolute, relative, and other path types.
   * Optionally appends an output file name to the resolved path.
   *
   * @param targetPath - The path to resolve
   * @param outputFileName - Optional file name to append (defaults to this.outputFileName if set)
   * @returns The fully resolved absolute path string
   *
   * @example
   * ```typescript
   * const fullPath = this.resolveFullPath(projectDir)
   * // or with custom file name
   * const fullPath = this.resolveFullPath(projectDir, 'CUSTOM.md')
   * ```
   */
  protected resolveFullPath(targetPath: Path, outputFileName?: string): string {
    let dirPath: string
    if (targetPath.pathKind === FilePathKind.Absolute) {
      dirPath = targetPath.path
    } else if (this.isRelativePath(targetPath)) {
      dirPath = path.resolve(targetPath.basePath, targetPath.path)
    } else {
      dirPath = path.resolve(process.cwd(), targetPath.path)
    }

    // Append the output file name if provided or if default is set
    const fileName = outputFileName ?? this.outputFileName
    if (fileName) {
      return path.join(dirPath, fileName)
    }
    return dirPath
  }

  /**
   * Factory method to create a RelativePath object.
   *
   * @param pathStr - The relative path string
   * @param basePath - The base path for resolution
   * @param dirNameFn - Function that returns the directory name
   * @returns A new RelativePath object
   *
   * @example
   * ```typescript
   * const relativePath = this.createRelativePath(
   *   'subdir/file.md',
   *   '/home/user/project',
   *   () => 'subdir'
   * )
   * ```
   */
  protected createRelativePath(
    pathStr: string,
    basePath: string,
    dirNameFn: () => string,
  ): RelativePath {
    return {
      pathKind: FilePathKind.Relative,
      path: pathStr,
      basePath,
      getDirectoryName: dirNameFn,
      getAbsolutePath: () => path.join(basePath, pathStr),
    }
  }

  /**
   * Create a RelativePath for a file within a directory.
   * Appends the filename to the directory's path.
   *
   * @param dir - The directory RelativePath
   * @param fileName - The file name to append
   * @returns A new RelativePath pointing to the file
   *
   * @example
   * ```typescript
   * const fileRelativePath = this.createFileRelativePath(projectDir, 'CLAUDE.md')
   * ```
   */
  protected createFileRelativePath(dir: RelativePath, fileName: string): RelativePath {
    const filePath = path.join(dir.path, fileName)
    return {
      pathKind: FilePathKind.Relative,
      path: filePath,
      basePath: dir.basePath,
      getDirectoryName: () => dir.getDirectoryName(),
      getAbsolutePath: () => path.join(dir.basePath, filePath),
    }
  }

  /**
   * Get the full path to the global configuration directory.
   * Combines the user's home directory with the globalConfigDir.
   *
   * @returns The absolute path to the global config directory
   *
   * @example
   * ```typescript
   * const globalDir = this.getGlobalConfigDir()
   * // Returns something like '/home/user/.claude'
   * ```
   */
  protected getGlobalConfigDir(): string {
    return path.join(os.homedir(), this.globalConfigDir)
  }

  /**
   * Ensure a directory exists, creating it recursively if necessary.
   *
   * @param dir - The directory path to ensure exists
   * @throws Error if directory creation fails
   *
   * @example
   * ```typescript
   * this.ensureDirectory('/path/to/output')
   * ```
   */
  protected ensureDirectory(dir: string): void {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
  }

  /**
   * Write content to a file with dry-run support.
   * Handles directory creation, error handling, and logging.
   *
   * @param ctx - The output write context (includes dryRun flag)
   * @param fullPath - The full absolute path to write to
   * @param content - The content to write
   * @param label - A label for logging purposes
   * @returns A WriteResult indicating success or failure
   *
   * @example
   * ```typescript
   * const result = await this.writeFile(
   *   ctx,
   *   '/path/to/output/FILE.md',
   *   'content here',
   *   'project:myproject/root'
   * )
   * ```
   */
  protected async writeFile(
    ctx: OutputWriteContext,
    fullPath: string,
    content: string,
    label: string,
  ): Promise<WriteResult> {
    // Create a relative path for the result
    const dir = path.dirname(fullPath)
    const fileName = path.basename(fullPath)
    const relativePath: RelativePath = {
      pathKind: FilePathKind.Relative,
      path: fileName,
      basePath: dir,
      getDirectoryName: () => path.basename(dir),
      getAbsolutePath: () => fullPath,
    }

    if (ctx.dryRun === true) {
      this.log.info(`[DRY-RUN] Would write ${label} -> ${fullPath}`)
      return { path: relativePath, success: true, skipped: false }
    }

    try {
      this.ensureDirectory(dir)
      fs.writeFileSync(fullPath, content, 'utf-8')
      this.log.info(`Written ${label} -> ${fullPath}`)
      return { path: relativePath, success: true }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      this.log.error(`Failed to write ${label}: ${errMsg}`)
      return { path: relativePath, success: false, error: error as Error }
    }
  }

  /**
   * Write a prompt file to a target path.
   * Convenience method that combines path resolution with file writing.
   *
   * @param ctx - The output write context
   * @param targetPath - The target path (can be relative or absolute)
   * @param content - The content to write
   * @param label - A label for logging purposes
   * @returns A WriteResult indicating success or failure
   *
   * @example
   * ```typescript
   * const result = await this.writePromptFile(
   *   ctx,
   *   projectDir,
   *   'prompt content',
   *   'project:myproject/root'
   * )
   * ```
   */
  protected async writePromptFile(
    ctx: OutputWriteContext,
    targetPath: Path,
    content: string,
    label: string,
  ): Promise<WriteResult> {
    const fullPath = this.resolveFullPath(targetPath)
    const relativePath = this.toRelativePath(targetPath)

    if (ctx.dryRun === true) {
      this.log.info(`[DRY-RUN] Would write ${label} -> ${fullPath}`)
      return { path: relativePath, success: true, skipped: false }
    }

    try {
      const dir = path.dirname(fullPath)
      this.ensureDirectory(dir)
      fs.writeFileSync(fullPath, content, 'utf-8')
      this.log.info(`Written ${label} -> ${fullPath}`)
      return { path: relativePath, success: true }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      this.log.error(`Failed to write ${label}: ${errMsg}`)
      return { path: relativePath, success: false, error: error as Error }
    }
  }

  /**
   * Build markdown content by combining front matter with content.
   * If front matter exists, prepends it to the content with a newline separator.
   *
   * @param rawFrontMatter - The raw YAML front matter string (including --- delimiters)
   * @param content - The markdown content
   * @returns The combined markdown string
   *
   * @example
   * ```typescript
   * const markdown = this.buildMarkdownContent(
   *   '---\ntitle: My Doc\n---',
   *   '# Content here'
   * )
   * // Returns: '---\ntitle: My Doc\n---\n# Content here'
   * ```
   */
  protected buildMarkdownContent(rawFrontMatter: string | undefined, content: string): string {
    if (rawFrontMatter != null && rawFrontMatter.length > 0) {
      return `${rawFrontMatter}\n${content}`
    }
    return content
  }

  /**
   * Default implementation of onWriteComplete lifecycle hook.
   * Logs statistics about the write operation including success, skip, and fail counts.
   *
   * @param ctx - The output write context
   * @param results - The collected write results
   *
   * @example
   * ```typescript
   * // Called automatically after write operations complete
   * // Or can be called manually:
   * await this.onWriteComplete(ctx, results)
   * ```
   */
  async onWriteComplete(ctx: OutputWriteContext, results: WriteResults): Promise<void> {
    const successCount = results.files.filter((r) => r.success).length
    const skipCount = results.files.filter((r) => r.skipped).length
    const failCount = results.files.filter((r) => !r.success && !r.skipped).length

    const mode = ctx.dryRun === true ? '[DRY-RUN]' : ''
    this.log.info(`${mode} Write complete: ${successCount} success, ${skipCount} skipped, ${failCount} failed`)
  }
}
