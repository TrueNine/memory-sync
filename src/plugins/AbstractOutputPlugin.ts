import type { RegistryWriter } from './registry/RegistryWriter'
import type { Logger } from '@/log'
import type {
  FastCommandPrompt,
  OutputPlugin,
  OutputWriteContext,
  RegistryOperationResult,
  WriteResult,
  WriteResults,
} from '@/types'
import type { FastCommandSeriesPluginOverride } from '@/types/ConfigTypes'

import type { Path, RelativePath } from '@/types/FileSystemTypes'
import type { RegistryData } from '@/types/RegistryTypes'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import process from 'node:process'
import { FilePathKind, PluginKind } from '@/types'
import { AbstractPlugin } from './AbstractPlugin'

/**
 * Options for transforming fast command names in output filenames.
 * Used by transformFastCommandName method to control prefix handling.
 */
export interface FastCommandNameTransformOptions {
  /**
   * Whether to include series prefix in output filename.
   * @default true
   */
  readonly includeSeriesPrefix?: boolean
  /**
   * Separator between series and command name.
   * @default '_'
   */
  readonly seriesSeparator?: string
}

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
 * Options for combining global content with project content.
 */
export interface CombineOptions {
  /**
   * Separator between global and project content.
   * @default '\n\n'
   */
  separator?: string

  /**
   * Skip combination if global content is empty or only whitespace.
   * @default true
   */
  skipIfEmpty?: boolean

  /**
   * Position of global content relative to project content.
   * @default 'before'
   */
  position?: 'before' | 'after'
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
   * Cache for registry writer instances.
   * Uses lazy initialization pattern for efficiency.
   * Key is the constructor name of the registry writer class.
   *
   * @see Requirements 5.1, 5.5
   */
  private readonly registryWriterCache: Map<string, RegistryWriter<unknown, RegistryData>> = new Map()

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
   * Join path segments using the platform-specific separator.
   * Wrapper around path.join for consistency.
   *
   * @param segments - Path segments to join
   * @returns The joined path
   *
   * @example
   * ```typescript
   * const fullPath = this.joinPath('dir', 'subdir', 'file.txt')
   * ```
   */
  protected joinPath(...segments: string[]): string {
    return path.join(...segments)
  }

  /**
   * Resolve path segments to an absolute path.
   * Wrapper around path.resolve for consistency.
   *
   * @param segments - Path segments to resolve
   * @returns The resolved absolute path
   *
   * @example
   * ```typescript
   * const absPath = this.resolvePath('/base', 'relative', 'path')
   * ```
   */
  protected resolvePath(...segments: string[]): string {
    return path.resolve(...segments)
  }

  /**
   * Get the directory name from a path.
   * Wrapper around path.dirname for consistency.
   *
   * @param p - The path to get directory from
   * @returns The directory name
   *
   * @example
   * ```typescript
   * const dir = this.dirname('/path/to/file.txt') // '/path/to'
   * ```
   */
  protected dirname(p: string): string {
    return path.dirname(p)
  }

  /**
   * Get the base name from a path.
   * Wrapper around path.basename for consistency.
   *
   * @param p - The path to get basename from
   * @param ext - Optional extension to remove
   * @returns The base name
   *
   * @example
   * ```typescript
   * const name = this.basename('/path/to/file.txt') // 'file.txt'
   * ```
   */
  protected basename(p: string, ext?: string): string {
    return path.basename(p, ext)
  }

  /**
   * Write file content synchronously.
   * Wrapper around fs.writeFileSync for consistency.
   *
   * @param filePath - The file path to write
   * @param content - The content to write
   * @param encoding - The encoding (default: 'utf-8')
   *
   * @example
   * ```typescript
   * this.writeFileSync('/path/to/file.txt', 'content')
   * ```
   */
  protected writeFileSync(filePath: string, content: string, encoding: BufferEncoding = 'utf-8'): void {
    fs.writeFileSync(filePath, content, encoding)
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
      this.log.trace({ action: 'dryRun', type: 'file', path: fullPath, label })
      return { path: relativePath, success: true, skipped: false }
    }

    try {
      this.ensureDirectory(dir)
      fs.writeFileSync(fullPath, content, 'utf-8')
      this.log.trace({ action: 'write', type: 'file', path: fullPath, label })
      return { path: relativePath, success: true }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      this.log.error({ action: 'write', type: 'file', path: fullPath, label, error: errMsg })
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
      this.log.trace({ action: 'dryRun', type: 'promptFile', path: fullPath, label })
      return { path: relativePath, success: true, skipped: false }
    }

    try {
      const dir = path.dirname(fullPath)
      this.ensureDirectory(dir)
      fs.writeFileSync(fullPath, content, 'utf-8')
      this.log.trace({ action: 'write', type: 'promptFile', path: fullPath, label })
      return { path: relativePath, success: true }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      this.log.error({ action: 'write', type: 'promptFile', path: fullPath, label, error: errMsg })
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
   * Extract global memory content from the output write context.
   *
   * @param ctx - The output write context
   * @returns The global memory content string, or undefined if not present
   *
   * @example
   * ```typescript
   * const globalContent = this.extractGlobalMemoryContent(ctx)
   * if (globalContent) {
   *   // Use global content
   * }
   * ```
   */
  protected extractGlobalMemoryContent(ctx: OutputWriteContext): string | undefined {
    return ctx.collectedInputContext.globalMemory?.content as string | undefined
  }

  /**
   * Combine global content with project content.
   * Useful for scenarios where global prompt/memory should be merged with project-specific content.
   *
   * @param globalContent - The global content to combine
   * @param projectContent - The project-specific content
   * @param options - Optional configuration for combination behavior
   * @returns The combined content string
   *
   * @example
   * ```typescript
   * const globalContent = this.extractGlobalMemoryContent(ctx)
   * const combined = this.combineGlobalWithContent(
   *   globalContent,
   *   project.rootMemoryPrompt.content as string
   * )
   * ```
   *
   * @example
   * ```typescript
   * // Custom separator and position
   * const combined = this.combineGlobalWithContent(
   *   globalContent,
   *   projectContent,
   *   { separator: '\n---\n', position: 'after' }
   * )
   * ```
   */
  protected combineGlobalWithContent(
    globalContent: string | undefined,
    projectContent: string,
    options?: CombineOptions,
  ): string {
    const {
      separator = '\n\n',
      skipIfEmpty = true,
      position = 'before',
    } = options ?? {}

    // Skip if global content is undefined/null or empty/whitespace when skipIfEmpty is true
    if (skipIfEmpty && (globalContent == null || globalContent.trim().length === 0)) {
      return projectContent
    }

    // If global content is null/undefined but skipIfEmpty is false, treat as empty string
    const effectiveGlobalContent = globalContent ?? ''

    // Combine based on position
    if (position === 'after') {
      return `${projectContent}${separator}${effectiveGlobalContent}`
    }

    // Default: 'before'
    return `${effectiveGlobalContent}${separator}${projectContent}`
  }

  /**
   * Transform a fast command name into an output filename.
   * Handles series prefix inclusion and separator configuration.
   *
   * @param cmd - The fast command prompt containing series and commandName
   * @param options - Optional configuration for transformation behavior
   * @returns The transformed filename with .md extension
   *
   * @example
   * ```typescript
   * // Default behavior: include prefix with underscore separator
   * const name = this.transformFastCommandName(cmd)
   * // For cmd with series='pe', commandName='compile' -> 'pe_compile.md'
   * ```
   *
   * @example
   * ```typescript
   * // Kiro-style: use hyphen separator
   * const name = this.transformFastCommandName(cmd, { seriesSeparator: '-' })
   * // For cmd with series='pe', commandName='compile' -> 'pe-compile.md'
   * ```
   *
   * @example
   * ```typescript
   * // Strip prefix
   * const name = this.transformFastCommandName(cmd, { includeSeriesPrefix: false })
   * // For cmd with series='pe', commandName='compile' -> 'compile.md'
   * ```
   */
  protected transformFastCommandName(
    cmd: FastCommandPrompt,
    options?: FastCommandNameTransformOptions,
  ): string {
    const { includeSeriesPrefix = true, seriesSeparator = '_' } = options ?? {}

    // If prefix should not be included or series is not present, return just commandName
    if (!includeSeriesPrefix || cmd.series == null) {
      return `${cmd.commandName}.md`
    }

    return `${cmd.series}${seriesSeparator}${cmd.commandName}.md`
  }

  /**
   * Get fast command series options from context, with plugin-specific override support.
   * Plugin-specific overrides take precedence over global settings.
   *
   * @param ctx - The output write context containing plugin options
   * @returns The resolved fast command series options for this plugin
   *
   * @example
   * ```typescript
   * // Get options with plugin-specific overrides
   * const seriesOptions = this.getFastCommandSeriesOptions(ctx)
   * const transformOptions = {
   *   includeSeriesPrefix: seriesOptions.includeSeriesPrefix,
   *   seriesSeparator: seriesOptions.seriesSeparator,
   * }
   * ```
   */
  protected getFastCommandSeriesOptions(ctx: OutputWriteContext): FastCommandSeriesPluginOverride {
    const globalOptions = ctx.pluginOptions?.fastCommandSeriesOptions
    const pluginOverride = globalOptions?.pluginOverrides?.[this.name]

    // Plugin-specific overrides take precedence over global settings
    // Only include properties that have defined values to satisfy exactOptionalPropertyTypes
    const includeSeriesPrefix = pluginOverride?.includeSeriesPrefix ?? globalOptions?.includeSeriesPrefix
    const seriesSeparator = pluginOverride?.seriesSeparator

    // Build result object conditionally to avoid assigning undefined to readonly properties
    if (includeSeriesPrefix != null && seriesSeparator != null) {
      return { includeSeriesPrefix, seriesSeparator }
    }
    if (includeSeriesPrefix != null) {
      return { includeSeriesPrefix }
    }
    if (seriesSeparator != null) {
      return { seriesSeparator }
    }
    return {}
  }

  /**
   * Get transform options for fast command names from context configuration.
   * Combines global settings with plugin-specific overrides.
   * Allows additional options to be merged (e.g., plugin-specific defaults).
   *
   * @param ctx - The output write context containing plugin options
   * @param additionalOptions - Additional options to merge (plugin-specific defaults)
   * @returns The resolved transform options for this plugin
   *
   * @example
   * ```typescript
   * // In KiroCLIOutputPlugin, use hyphen as default separator
   * const options = this.getTransformOptionsFromContext(ctx, { seriesSeparator: '-' })
   * const fileName = this.transformFastCommandName(cmd, options)
   * ```
   */
  protected getTransformOptionsFromContext(
    ctx: OutputWriteContext,
    additionalOptions?: FastCommandNameTransformOptions,
  ): FastCommandNameTransformOptions {
    const seriesOptions = this.getFastCommandSeriesOptions(ctx)

    // Merge: additionalOptions (plugin defaults) <- seriesOptions (config overrides)
    // Only include properties that have defined values to satisfy exactOptionalPropertyTypes
    const includeSeriesPrefix = seriesOptions.includeSeriesPrefix ?? additionalOptions?.includeSeriesPrefix
    const seriesSeparator = seriesOptions.seriesSeparator ?? additionalOptions?.seriesSeparator

    // Build result object conditionally to avoid assigning undefined to readonly properties
    if (includeSeriesPrefix != null && seriesSeparator != null) {
      return { includeSeriesPrefix, seriesSeparator }
    }
    if (includeSeriesPrefix != null) {
      return { includeSeriesPrefix }
    }
    if (seriesSeparator != null) {
      return { seriesSeparator }
    }
    return {}
  }

  /**
   * Check if another plugin with a given name is registered and should take precedence.
   * Useful for plugins that can be replaced by more comprehensive alternatives.
   *
   * @param ctx - The output write context
   * @param precedingPluginName - The name of the plugin that should take precedence
   * @returns True if the preceding plugin is registered, false otherwise
   *
   * @example
   * ```typescript
   * // In WarpIDEOutputPlugin.canWrite():
   * if (this.shouldSkipDueToPlugin(ctx, 'AgentsOutputPlugin')) {
   *   this.log.info('Skipping WARP.md output, AgentsOutputPlugin is registered')
   *   return false
   * }
   * ```
   */
  protected shouldSkipDueToPlugin(ctx: OutputWriteContext, precedingPluginName: string): boolean {
    const registeredPlugins = ctx.registeredPluginNames
    if (registeredPlugins == null) {
      return false
    }
    return registeredPlugins.includes(precedingPluginName)
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
    const success = results.files.filter((r) => r.success).length
    const skipped = results.files.filter((r) => r.skipped).length
    const failed = results.files.filter((r) => !r.success && !r.skipped).length

    this.log.trace({ action: ctx.dryRun === true ? 'dryRun' : 'complete', type: 'writeSummary', success, skipped, failed })
  }

  /**
   * Get or create a registry writer instance.
   * Uses lazy initialization pattern for efficiency.
   * Instances are cached by constructor name to avoid creating duplicates.
   *
   * @template TEntry - The type of entries stored in the registry
   * @template TRegistry - The full registry data structure type
   * @template T - The registry writer class type
   * @param WriterClass - The registry writer class constructor
   * @returns The registry writer instance
   *
   * @see Requirements 5.1, 5.5
   *
   * @example
   * ```typescript
   * // Get a KiroPowersRegistryWriter instance
   * const writer = this.getRegistryWriter(KiroPowersRegistryWriter)
   * ```
   */
  protected getRegistryWriter<
    TEntry,
    TRegistry extends RegistryData,
    T extends RegistryWriter<TEntry, TRegistry>,
  >(
    WriterClass: new (logger: Logger) => T,
  ): T {
    const cacheKey = WriterClass.name

    // Check cache first
    const cached = this.registryWriterCache.get(cacheKey)
    if (cached != null) {
      return cached as T
    }

    // Create new instance and cache it
    const writer = new WriterClass(this.log)
    this.registryWriterCache.set(cacheKey, writer as RegistryWriter<unknown, RegistryData>)
    return writer
  }

  /**
   * Register entries in a registry with dry-run support.
   * Convenience method for subclasses to register entries in a registry.
   *
   * @template TEntry - The type of entries to register
   * @template TRegistry - The full registry data structure type
   * @param writer - The registry writer instance
   * @param entries - The entries to register
   * @param ctx - The output write context (includes dryRun flag)
   * @returns Array of operation results, one for each entry
   *
   * @see Requirements 5.2, 5.3
   *
   * @example
   * ```typescript
   * // Register power entries in Kiro registry
   * const writer = this.getRegistryWriter(KiroPowersRegistryWriter)
   * const results = await this.registerInRegistry(writer, powerEntries, ctx)
   * ```
   */
  protected async registerInRegistry<
    TEntry,
    TRegistry extends RegistryData,
  >(
    writer: RegistryWriter<TEntry, TRegistry>,
    entries: readonly TEntry[],
    ctx: OutputWriteContext,
  ): Promise<readonly RegistryOperationResult[]> {
    return writer.register(entries, ctx.dryRun)
  }
}
