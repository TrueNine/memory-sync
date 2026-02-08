import type {Buffer} from 'node:buffer'
import type {RegistryWriter} from './registry/RegistryWriter'
import type {ILogger} from '@/log'
import type {
  CleanEffectHandler,
  EffectRegistration,
  EffectResult,
  FastCommandPrompt,
  OutputCleanContext,
  OutputPlugin,
  OutputWriteContext,
  RegistryOperationResult,
  WriteEffectHandler,
  WriteResult,
  WriteResults
} from '@/types'

import type {FastCommandSeriesPluginOverride} from '@/types/ConfigTypes'
import type {Path, RelativePath} from '@/types/FileSystemTypes'
import type {RegistryData} from '@/types/RegistryTypes'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import process from 'node:process'
import {
  createFileRelativePath as deskCreateFileRelativePath,
  createRelativePath as deskCreateRelativePath,
  createSymlink as deskCreateSymlink,
  ensureDir as deskEnsureDir,
  isSymlink as deskIsSymlink,
  lstatSync as deskLstatSync,
  removeSymlink as deskRemoveSymlink,
  writeFileSync as deskWriteFileSync
} from '@truenine/desk-paths'
import {buildMarkdownWithFrontMatter} from '@/markdown'
import {FilePathKind, PluginKind} from '@/types'
import {AbstractPlugin} from './AbstractPlugin'

/**
 * Options for transforming fast command names in output filenames.
 * Used by transformFastCommandName method to control prefix handling.
 */
export interface FastCommandNameTransformOptions {
  readonly includeSeriesPrefix?: boolean
  readonly seriesSeparator?: string
}

/**
 * Options for configuring AbstractOutputPlugin subclasses.
 */
export interface AbstractOutputPluginOptions {
  globalConfigDir?: string

  outputFileName?: string

  dependsOn?: readonly string[]
}

/**
 * Options for combining global content with project content.
 */
export interface CombineOptions {
  separator?: string

  skipIfEmpty?: boolean

  position?: 'before' | 'after'
}

export abstract class AbstractOutputPlugin extends AbstractPlugin<PluginKind.Output> implements OutputPlugin {
  protected readonly globalConfigDir: string

  protected readonly outputFileName: string

  private readonly registryWriterCache: Map<string, RegistryWriter<unknown>> = new Map()

  private readonly writeEffects: EffectRegistration<WriteEffectHandler>[] = []

  private readonly cleanEffects: EffectRegistration<CleanEffectHandler>[] = []

  protected constructor(name: string, options?: AbstractOutputPluginOptions) {
    super(name, PluginKind.Output, options?.dependsOn)
    this.globalConfigDir = options?.globalConfigDir ?? ''
    this.outputFileName = options?.outputFileName ?? ''
  }

  protected registerWriteEffect(name: string, handler: WriteEffectHandler): void {
    this.writeEffects.push({name, handler})
  }

  protected registerCleanEffect(name: string, handler: CleanEffectHandler): void {
    this.cleanEffects.push({name, handler})
  }

  protected async executeWriteEffects(ctx: OutputWriteContext): Promise<EffectResult[]> {
    const results: EffectResult[] = []

    for (const effect of this.writeEffects) {
      if (ctx.dryRun === true) {
        this.log.trace({action: 'dryRun', type: 'effect', name: effect.name})
        results.push({success: true, description: `Would execute write effect: ${effect.name}`})
        continue
      }

      try {
        const result = await effect.handler(ctx)
        if (result.success) this.log.trace({action: 'effect', name: effect.name, status: 'success'})
        else {
          const errorMsg = result.error instanceof Error ? result.error.message : String(result.error)
          this.log.error({action: 'effect', name: effect.name, status: 'failed', error: errorMsg})
        }
        results.push(result)
      }
      catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        this.log.error({action: 'effect', name: effect.name, status: 'failed', error: errorMsg})
        results.push({success: false, error: error as Error, description: `Write effect failed: ${effect.name}`})
      }
    }

    return results
  }

  protected async executeCleanEffects(ctx: OutputCleanContext): Promise<EffectResult[]> {
    const results: EffectResult[] = []

    for (const effect of this.cleanEffects) {
      if (ctx.dryRun === true) {
        this.log.trace({action: 'dryRun', type: 'effect', name: effect.name})
        results.push({success: true, description: `Would execute clean effect: ${effect.name}`})
        continue
      }

      try {
        const result = await effect.handler(ctx)
        if (result.success) this.log.trace({action: 'effect', name: effect.name, status: 'success'})
        else {
          const errorMsg = result.error instanceof Error ? result.error.message : String(result.error)
          this.log.error({action: 'effect', name: effect.name, status: 'failed', error: errorMsg})
        }
        results.push(result)
      }
      catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        this.log.error({action: 'effect', name: effect.name, status: 'failed', error: errorMsg})
        results.push({success: false, error: error as Error, description: `Clean effect failed: ${effect.name}`})
      }
    }

    return results
  }

  protected isRelativePath(p: Path): p is RelativePath {
    return p.pathKind === FilePathKind.Relative
  }

  protected toRelativePath(p: Path): RelativePath {
    if (this.isRelativePath(p)) return p
    return { // Fallback for non-relative paths
      pathKind: FilePathKind.Relative,
      path: p.path,
      basePath: '',
      getDirectoryName: p.getDirectoryName,
      getAbsolutePath: () => p.path
    }
  }

  protected resolveFullPath(targetPath: Path, outputFileName?: string): string {
    let dirPath: string
    if (targetPath.pathKind === FilePathKind.Absolute) dirPath = targetPath.path
    else if (this.isRelativePath(targetPath)) dirPath = path.resolve(targetPath.basePath, targetPath.path)
    else dirPath = path.resolve(process.cwd(), targetPath.path)

    const fileName = outputFileName ?? this.outputFileName // Append the output file name if provided or if default is set
    if (fileName) return path.join(dirPath, fileName)
    return dirPath
  }

  protected createRelativePath(
    pathStr: string,
    basePath: string,
    dirNameFn: () => string
  ): RelativePath {
    return deskCreateRelativePath(pathStr, basePath, dirNameFn)
  }

  protected createFileRelativePath(dir: RelativePath, fileName: string): RelativePath {
    return deskCreateFileRelativePath(dir, fileName)
  }

  protected getGlobalConfigDir(): string {
    return path.join(this.getHomeDir(), this.globalConfigDir)
  }

  protected getHomeDir(): string {
    return os.homedir()
  }

  protected joinPath(...segments: string[]): string {
    return path.join(...segments)
  }

  protected resolvePath(...segments: string[]): string {
    return path.resolve(...segments)
  }

  protected dirname(p: string): string {
    return path.dirname(p)
  }

  protected basename(p: string, ext?: string): string {
    return path.basename(p, ext)
  }

  protected writeFileSync(filePath: string, content: string, encoding: BufferEncoding = 'utf8'): void {
    deskWriteFileSync(filePath, content, encoding)
  }

  protected writeFileSyncBuffer(filePath: string, buffer: Buffer): void {
    deskWriteFileSync(filePath, buffer)
  }

  protected ensureDirectory(dir: string): void {
    deskEnsureDir(dir)
  }

  protected existsSync(p: string): boolean {
    return fs.existsSync(p)
  }

  protected lstatSync(p: string): fs.Stats {
    return deskLstatSync(p)
  }

  protected isSymlink(p: string): boolean {
    return deskIsSymlink(p)
  }

  protected createSymlink(targetPath: string, symlinkPath: string, type: 'file' | 'dir' = 'dir'): void {
    deskCreateSymlink(targetPath, symlinkPath, type)
  }

  protected removeSymlink(symlinkPath: string): void {
    deskRemoveSymlink(symlinkPath)
  }

  protected async writeDirectorySymlink(
    ctx: OutputWriteContext,
    targetPath: string,
    symlinkPath: string,
    label: string
  ): Promise<WriteResult> {
    const dir = path.dirname(symlinkPath)
    const linkName = path.basename(symlinkPath)
    const relativePath: RelativePath = deskCreateRelativePath(linkName, dir, () => path.basename(dir))

    if (ctx.dryRun === true) {
      this.log.trace({action: 'dryRun', type: 'symlink', target: targetPath, link: symlinkPath, label})
      return {path: relativePath, success: true, skipped: false}
    }

    try {
      this.createSymlink(targetPath, symlinkPath, 'dir')
      this.log.trace({action: 'write', type: 'symlink', target: targetPath, link: symlinkPath, label})
      return {path: relativePath, success: true}
    }
    catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      this.log.error({action: 'write', type: 'symlink', target: targetPath, link: symlinkPath, label, error: errMsg})
      return {path: relativePath, success: false, error: error as Error}
    }
  }

  protected readdirSync(dir: string, options: {withFileTypes: true}): fs.Dirent[]
  protected readdirSync(dir: string): string[]
  protected readdirSync(dir: string, options?: {withFileTypes?: boolean}): fs.Dirent[] | string[] {
    if (options?.withFileTypes === true) return fs.readdirSync(dir, {withFileTypes: true})
    return fs.readdirSync(dir)
  }

  protected async writeFile(
    ctx: OutputWriteContext,
    fullPath: string,
    content: string,
    label: string
  ): Promise<WriteResult> {
    const dir = path.dirname(fullPath) // Create a relative path for the result
    const fileName = path.basename(fullPath)
    const relativePath: RelativePath = deskCreateRelativePath(fileName, dir, () => path.basename(dir))

    if (ctx.dryRun === true) {
      this.log.trace({action: 'dryRun', type: 'file', path: fullPath, label})
      return {path: relativePath, success: true, skipped: false}
    }

    try {
      deskWriteFileSync(fullPath, content)
      this.log.trace({action: 'write', type: 'file', path: fullPath, label})
      return {path: relativePath, success: true}
    }
    catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      this.log.error({action: 'write', type: 'file', path: fullPath, label, error: errMsg})
      return {path: relativePath, success: false, error: error as Error}
    }
  }

  protected async writePromptFile(
    ctx: OutputWriteContext,
    targetPath: Path,
    content: string,
    label: string
  ): Promise<WriteResult> {
    const fullPath = this.resolveFullPath(targetPath)
    const relativePath = this.toRelativePath(targetPath)

    if (ctx.dryRun === true) {
      this.log.trace({action: 'dryRun', type: 'promptFile', path: fullPath, label})
      return {path: relativePath, success: true, skipped: false}
    }

    try {
      deskWriteFileSync(fullPath, content)
      this.log.trace({action: 'write', type: 'promptFile', path: fullPath, label})
      return {path: relativePath, success: true}
    }
    catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      this.log.error({action: 'write', type: 'promptFile', path: fullPath, label, error: errMsg})
      return {path: relativePath, success: false, error: error as Error}
    }
  }

  protected buildMarkdownContent(content: string, frontMatter?: Record<string, unknown>): string {
    return buildMarkdownWithFrontMatter(frontMatter, content)
  }

  protected buildMarkdownContentWithRaw(
    content: string,
    frontMatter?: Record<string, unknown>,
    rawFrontMatter?: string
  ): string {
    if (frontMatter != null && Object.keys(frontMatter).length > 0) return buildMarkdownWithFrontMatter(frontMatter, content) // If we have parsed front matter, use it

    if (rawFrontMatter != null && rawFrontMatter.length > 0) return `---\n${rawFrontMatter}\n---\n${content}` // If we have raw front matter but parsing failed, use raw

    return content // No front matter
  }

  protected extractGlobalMemoryContent(ctx: OutputWriteContext): string | undefined {
    return ctx.collectedInputContext.globalMemory?.content as string | undefined
  }

  protected combineGlobalWithContent(
    globalContent: string | undefined,
    projectContent: string,
    options?: CombineOptions
  ): string {
    const {
      separator = '\n\n',
      skipIfEmpty = true,
      position = 'before'
    } = options ?? {}

    if (skipIfEmpty && (globalContent == null || globalContent.trim().length === 0)) return projectContent // Skip if global content is undefined/null or empty/whitespace when skipIfEmpty is true

    const effectiveGlobalContent = globalContent ?? '' // If global content is null/undefined but skipIfEmpty is false, treat as empty string

    if (position === 'after') return `${projectContent}${separator}${effectiveGlobalContent}` // Combine based on position

    return `${effectiveGlobalContent}${separator}${projectContent}` // Default: 'before'
  }

  protected transformFastCommandName(
    cmd: FastCommandPrompt,
    options?: FastCommandNameTransformOptions
  ): string {
    const {includeSeriesPrefix = true, seriesSeparator = '_'} = options ?? {}

    if (!includeSeriesPrefix || cmd.series == null) return `${cmd.commandName}.md` // If prefix should not be included or series is not present, return just commandName

    return `${cmd.series}${seriesSeparator}${cmd.commandName}.md`
  }

  protected getFastCommandSeriesOptions(ctx: OutputWriteContext): FastCommandSeriesPluginOverride {
    const globalOptions = ctx.pluginOptions?.fastCommandSeriesOptions
    const pluginOverride = globalOptions?.pluginOverrides?.[this.name]

    const includeSeriesPrefix = pluginOverride?.includeSeriesPrefix ?? globalOptions?.includeSeriesPrefix // Only include properties that have defined values to satisfy exactOptionalPropertyTypes // Plugin-specific overrides take precedence over global settings
    const seriesSeparator = pluginOverride?.seriesSeparator

    if (includeSeriesPrefix != null && seriesSeparator != null) return {includeSeriesPrefix, seriesSeparator} // Build result object conditionally to avoid assigning undefined to readonly properties
    if (includeSeriesPrefix != null) return {includeSeriesPrefix}
    if (seriesSeparator != null) return {seriesSeparator}
    return {}
  }

  protected getTransformOptionsFromContext(
    ctx: OutputWriteContext,
    additionalOptions?: FastCommandNameTransformOptions
  ): FastCommandNameTransformOptions {
    const seriesOptions = this.getFastCommandSeriesOptions(ctx)

    const includeSeriesPrefix = seriesOptions.includeSeriesPrefix ?? additionalOptions?.includeSeriesPrefix // Only include properties that have defined values to satisfy exactOptionalPropertyTypes // Merge: additionalOptions (plugin defaults) <- seriesOptions (config overrides)
    const seriesSeparator = seriesOptions.seriesSeparator ?? additionalOptions?.seriesSeparator

    if (includeSeriesPrefix != null && seriesSeparator != null) return {includeSeriesPrefix, seriesSeparator} // Build result object conditionally to avoid assigning undefined to readonly properties
    if (includeSeriesPrefix != null) return {includeSeriesPrefix}
    if (seriesSeparator != null) return {seriesSeparator}
    return {}
  }

  protected shouldSkipDueToPlugin(ctx: OutputWriteContext, precedingPluginName: string): boolean {
    const registeredPlugins = ctx.registeredPluginNames
    if (registeredPlugins == null) return false
    return registeredPlugins.includes(precedingPluginName)
  }

  async onWriteComplete(ctx: OutputWriteContext, results: WriteResults): Promise<void> {
    const success = results.files.filter(r => r.success).length
    const skipped = results.files.filter(r => r.skipped).length
    const failed = results.files.filter(r => !r.success && !r.skipped).length

    this.log.trace({action: ctx.dryRun === true ? 'dryRun' : 'complete', type: 'writeSummary', success, skipped, failed})

    await this.executeWriteEffects(ctx) // Execute registered write effects
  }

  async onCleanComplete(ctx: OutputCleanContext): Promise<void> {
    await this.executeCleanEffects(ctx) // Execute registered clean effects
  }

  protected getRegistryWriter<
    TEntry,
    TRegistry extends RegistryData,
    T extends RegistryWriter<TEntry, TRegistry>
  >(
    WriterClass: new (logger: ILogger) => T
  ): T {
    const cacheKey = WriterClass.name

    const cached = this.registryWriterCache.get(cacheKey) // Check cache first
    if (cached != null) return cached as T

    const writer = new WriterClass(this.log) // Create new instance and cache it
    this.registryWriterCache.set(cacheKey, writer as RegistryWriter<unknown>)
    return writer
  }

  protected async registerInRegistry<
    TEntry,
    TRegistry extends RegistryData
  >(
    writer: RegistryWriter<TEntry, TRegistry>,
    entries: readonly TEntry[],
    ctx: OutputWriteContext
  ): Promise<readonly RegistryOperationResult[]> {
    return writer.register(entries, ctx.dryRun)
  }
}
