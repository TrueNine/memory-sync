import type {CleanEffectHandler, CommandPrompt, CommandSeriesPluginOverride, EffectRegistration, EffectResult, ILogger, OutputCleanContext, OutputPlugin, OutputPluginContext, OutputWriteContext, Project, RegistryOperationResult, RulePrompt, RuleScope, SkillPrompt, WriteEffectHandler, WriteResult, WriteResults} from '@truenine/plugin-shared'
import type {Path, ProjectConfig, RegistryData, RelativePath} from '@truenine/plugin-shared/types'

import type {Buffer} from 'node:buffer'
import type {RegistryWriter} from './registry/RegistryWriter'
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
import {buildMarkdownWithFrontMatter} from '@truenine/md-compiler/markdown'
import {
  AbstractPlugin,
  FilePathKind,
  PluginKind
} from '@truenine/plugin-shared'

/**
 * Options for building skill front matter
 */
export interface SkillFrontMatterOptions {
  readonly includeTools?: boolean
  readonly toolFormat?: 'array' | 'string'
  readonly additionalFields?: Record<string, unknown>
}

/**
 * Options for building rule content
 */
export interface RuleContentOptions {
  readonly fileExtension: '.mdc' | '.md'
  readonly alwaysApply: boolean
  readonly globJoinPattern: ', ' | '|' | string
  readonly frontMatterFormatter?: (globs: string) => unknown
  readonly additionalFrontMatter?: Record<string, unknown>
}

/**
 * Options for executing write operations with dry-run support
 */
export interface WriteOperationOptions {
  readonly ctx: OutputWriteContext
  readonly type: string
  readonly fullPath: string
  readonly relativePath: RelativePath
  readonly label?: string | undefined
}

/**
 * Context for error handling
 */
export interface ErrorContext {
  readonly action: string
  readonly path?: string
  readonly [key: string]: unknown
}

/**
 * Options for transforming command names in output filenames.
 * Used by transformCommandName method to control prefix handling.
 */
export interface CommandNameTransformOptions {
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

  indexignore?: string
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

  protected readonly indexignore: string | undefined

  private readonly registryWriterCache: Map<string, RegistryWriter<unknown>> = new Map()

  private readonly writeEffects: EffectRegistration<WriteEffectHandler>[] = []

  private readonly cleanEffects: EffectRegistration<CleanEffectHandler>[] = []

  protected constructor(name: string, options?: AbstractOutputPluginOptions) {
    super(name, PluginKind.Output, options?.dependsOn)
    this.globalConfigDir = options?.globalConfigDir ?? ''
    this.outputFileName = options?.outputFileName ?? ''
    this.indexignore = options?.indexignore
  }

  protected resolvePromptSourceProjectConfig(ctx: OutputPluginContext | OutputWriteContext): ProjectConfig | undefined {
    const {projects} = ctx.collectedInputContext.workspace
    const promptSource = projects.find(p => p.isPromptSourceProject === true)
    return promptSource?.projectConfig ?? projects[0]?.projectConfig
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

  protected getIgnoreOutputPath(): string | undefined {
    if (this.indexignore == null) return void 0
    return this.indexignore
  }

  protected registerProjectIgnoreOutputFiles(projects: readonly Project[]): RelativePath[] {
    const outputPath = this.getIgnoreOutputPath()
    if (outputPath == null) return []

    const results: RelativePath[] = []

    for (const project of projects) {
      const projectDir = project.dirFromWorkspacePath
      if (projectDir == null) continue
      if (project.isPromptSourceProject === true) continue

      const filePath = path.join(projectDir.path, outputPath)
      results.push({
        pathKind: FilePathKind.Relative,
        path: filePath,
        basePath: projectDir.basePath,
        getDirectoryName: () => path.basename(projectDir.path),
        getAbsolutePath: () => path.join(projectDir.basePath, filePath)
      })
    }

    return results
  }

  protected async writeProjectIgnoreFiles(ctx: OutputWriteContext): Promise<WriteResult[]> {
    const outputPath = this.getIgnoreOutputPath()
    if (outputPath == null) return []

    const {workspace, aiAgentIgnoreConfigFiles} = ctx.collectedInputContext
    const results: WriteResult[] = []

    if (aiAgentIgnoreConfigFiles == null || aiAgentIgnoreConfigFiles.length === 0) return results

    const ignoreFile = aiAgentIgnoreConfigFiles.find(file => file.fileName === this.indexignore)
    if (ignoreFile == null) return results

    for (const project of workspace.projects) {
      const projectDir = project.dirFromWorkspacePath
      if (projectDir == null) continue
      if (project.isPromptSourceProject === true) continue

      const label = `project:${project.name ?? 'unknown'}/${ignoreFile.fileName}`
      const filePath = path.join(projectDir.path, outputPath)
      const fullPath = path.join(projectDir.basePath, filePath)

      const relativePath: RelativePath = {
        pathKind: FilePathKind.Relative,
        path: filePath,
        basePath: projectDir.basePath,
        getDirectoryName: () => path.basename(projectDir.path),
        getAbsolutePath: () => fullPath
      }

      if (ctx.dryRun === true) {
        this.log.trace({action: 'dryRun', type: 'ignoreFile', path: fullPath, label})
        results.push({path: relativePath, success: true, skipped: false})
        continue
      }

      try {
        fs.mkdirSync(path.dirname(fullPath), {recursive: true})
        fs.writeFileSync(fullPath, ignoreFile.content, 'utf8')
        this.log.trace({action: 'write', type: 'ignoreFile', path: fullPath, label})
        results.push({path: relativePath, success: true})
      }
      catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error)
        this.log.error({action: 'write', type: 'ignoreFile', path: fullPath, label, error: errMsg})
        results.push({path: relativePath, success: false, error: error as Error})
      }
    }

    return results
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
      this.ensureDirectory(dir) // Ensure parent directory exists before writing
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

  protected transformCommandName(
    cmd: CommandPrompt,
    options?: CommandNameTransformOptions
  ): string {
    const {includeSeriesPrefix = true, seriesSeparator = '-'} = options ?? {}

    if (!includeSeriesPrefix || cmd.commandPrefix == null) return `${cmd.commandName}.md` // If prefix should not be included or prefix is not present, return just commandName

    return `${cmd.commandPrefix}${seriesSeparator}${cmd.commandName}.md`
  }

  protected getCommandSeriesOptions(ctx: OutputWriteContext): CommandSeriesPluginOverride {
    const globalOptions = ctx.pluginOptions?.commandSeriesOptions
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
    additionalOptions?: CommandNameTransformOptions
  ): CommandNameTransformOptions {
    const seriesOptions = this.getCommandSeriesOptions(ctx)

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

  protected normalizeRuleScope(rule: RulePrompt): RuleScope {
    return rule.scope ?? 'project'
  }

  protected handleError(
    error: unknown,
    context: ErrorContext
  ): {success: false, error: Error} {
    const errorMsg = error instanceof Error ? error.message : String(error)
    this.log.error({...context, error: errorMsg})
    return {success: false, error: error as Error}
  }

  protected async executeWriteOperation<T extends WriteResult>(
    options: WriteOperationOptions,
    execute: () => Promise<T>
  ): Promise<WriteResult> {
    const {ctx, type, fullPath, relativePath, label} = options

    if (ctx.dryRun === true) { // Handle dry-run mode
      this.log.trace({action: 'dryRun', type, path: fullPath, label})
      return {path: relativePath, success: true, skipped: false}
    }

    try { // Execute with standardized error handling
      const result = await execute()
      this.log.trace({action: 'write', type, path: fullPath, label})
      return result
    } catch (error) {
      return {...this.handleError(error, {action: 'write', type, path: fullPath, label}), path: relativePath}
    }
  }

  protected buildSkillFrontMatter(
    skill: SkillPrompt,
    options?: SkillFrontMatterOptions
  ): Record<string, unknown> {
    const fm = skill.yamlFrontMatter
    const result: Record<string, unknown> = {
      name: fm.name,
      description: fm.description
    }

    if ('displayName' in fm && fm.displayName != null) { // Conditionally add optional fields
      result['displayName'] = fm.displayName
    }
    if ('keywords' in fm && fm.keywords != null && fm.keywords.length > 0) result['keywords'] = fm.keywords
    if ('author' in fm && fm.author != null) result['author'] = fm.author
    if ('version' in fm && fm.version != null) result['version'] = fm.version

    const includeTools = options?.includeTools ?? true // Handle tools based on options
    if (includeTools && 'allowTools' in fm && fm.allowTools != null && fm.allowTools.length > 0) {
      const toolFormat = options?.toolFormat ?? 'array'
      result['allowTools'] = toolFormat === 'string' ? fm.allowTools.join(',') : fm.allowTools
    }

    if (options?.additionalFields != null) { // Add any additional custom fields
      Object.assign(result, options.additionalFields)
    }

    return result
  }

  protected buildRuleContent(
    rule: RulePrompt,
    options: RuleContentOptions
  ): string {
    const globsFormatted = rule.globs.length > 0
      ? rule.globs.join(options.globJoinPattern)
      : ''

    const fmData: Record<string, unknown> = {
      alwaysApply: options.alwaysApply,
      globs: options.frontMatterFormatter
        ? options.frontMatterFormatter(globsFormatted)
        : globsFormatted,
      ...options.additionalFrontMatter
    }

    return buildMarkdownWithFrontMatter(fmData, rule.content)
  }

  protected buildRuleFileName(
    rule: RulePrompt,
    prefix: string = 'rule-'
  ): string {
    return `${prefix}${rule.series}-${rule.ruleName}.mdc`
  }

  protected async writeFileWithHandling(
    ctx: OutputWriteContext,
    fullPath: string,
    content: string,
    options: {
      type: string
      label?: string
      relativePath: RelativePath
    }
  ): Promise<WriteResult> {
    const result = await this.executeWriteOperation(
      {
        ctx,
        type: options.type,
        fullPath,
        relativePath: options.relativePath,
        label: options.label
      },
      async () => {
        this.ensureDirectory(path.dirname(fullPath))
        this.writeFileSync(fullPath, content)
        return {path: options.relativePath, success: true as const}
      }
    )

    if ('success' in result && !result.success) { // If executeWriteOperation returned a WriteResult (error case), pass it through
      return result
    }

    return {path: options.relativePath, success: true}
  }
}
