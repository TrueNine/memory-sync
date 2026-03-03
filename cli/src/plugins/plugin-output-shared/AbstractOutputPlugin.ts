import type {Buffer} from 'node:buffer'
import type {CleanEffectHandler, CommandPrompt, CommandSeriesPluginOverride, EffectRegistration, EffectResult, ILogger, OutputCleanContext, OutputPlugin, OutputPluginContext, OutputWriteContext, Project, RegistryOperationResult, RulePrompt, RuleScope, SkillPrompt, SubAgentPrompt, WriteEffectHandler, WriteResult, WriteResults} from '../plugin-shared'

import type {Path, ProjectConfig, RegistryData, RelativePath} from '../plugin-shared/types'
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
import {mdxToMd} from '@truenine/md-compiler'
import {buildMarkdownWithFrontMatter} from '@truenine/md-compiler/markdown'
import {GlobalScopeCollector} from '@truenine/plugin-input-shared'
import {
  AbstractPlugin,
  FilePathKind,
  PluginKind
} from '../plugin-shared'
import {
  applySubSeriesGlobPrefix,
  filterCommandsByProjectConfig,
  filterRulesByProjectConfig,
  filterSkillsByProjectConfig,
  filterSubAgentsByProjectConfig
} from './utils'

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

  commandsSubDir?: string // CLI-specific options (merged from BaseCLIOutputPlugin)

  agentsSubDir?: string

  skillsSubDir?: string

  supportsCommands?: boolean

  supportsSubAgents?: boolean

  supportsSkills?: boolean

  toolPreset?: string

  /** Rule output configuration (declarative) */
  supportsRules?: boolean // Enable rule output, default false

  rulesSubDir?: string // Rules subdirectory, default 'rules'

  ruleLinkSymbol?: string // Link symbol between series and ruleName, default '-'

  rulePrefix?: string // Rule file prefix, default 'rule'

  ruleExt?: string // Rule file extension, default '.md'

  transformRuleFrontMatter?: (rule: RulePrompt) => Record<string, unknown> // Custom frontmatter transformer
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

  protected readonly commandsSubDir: string // CLI-specific properties (merged from BaseCLIOutputPlugin)

  protected readonly agentsSubDir: string

  protected readonly skillsSubDir: string

  protected readonly supportsCommands: boolean

  protected readonly supportsSubAgents: boolean

  protected readonly supportsSkills: boolean

  protected readonly toolPreset: string | undefined

  /** Rule output configuration properties */
  protected readonly supportsRules: boolean

  protected readonly rulesSubDir: string

  protected readonly ruleLinkSymbol: string

  protected readonly rulePrefix: string

  protected readonly ruleExt: string

  protected readonly transformRuleFrontMatter: ((rule: RulePrompt) => Record<string, unknown>) | undefined

  private readonly registryWriterCache: Map<string, RegistryWriter<unknown>> = new Map()

  private readonly writeEffects: EffectRegistration<WriteEffectHandler>[] = []

  private readonly cleanEffects: EffectRegistration<CleanEffectHandler>[] = []

  protected constructor(name: string, options?: AbstractOutputPluginOptions) {
    super(name, PluginKind.Output, options?.dependsOn)
    this.globalConfigDir = options?.globalConfigDir ?? ''
    this.outputFileName = options?.outputFileName ?? ''
    this.indexignore = options?.indexignore

    this.commandsSubDir = options?.commandsSubDir ?? 'commands' // Initialize CLI-specific properties with defaults (disabled by default)
    this.agentsSubDir = options?.agentsSubDir ?? 'agents'
    this.skillsSubDir = options?.skillsSubDir ?? 'skills'
    this.supportsCommands = options?.supportsCommands ?? false
    this.supportsSubAgents = options?.supportsSubAgents ?? false
    this.supportsSkills = options?.supportsSkills ?? false
    this.toolPreset = options?.toolPreset

    this.supportsRules = options?.supportsRules ?? false // Initialize rule output config
    this.rulesSubDir = options?.rulesSubDir ?? 'rules'
    this.ruleLinkSymbol = options?.ruleLinkSymbol ?? '-'
    this.rulePrefix = options?.rulePrefix ?? 'rule'
    this.ruleExt = options?.ruleExt ?? '.md'
    this.transformRuleFrontMatter = options?.transformRuleFrontMatter
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

  protected buildRuleContent(rule: RulePrompt): string {
    const fmData = this.transformRuleFrontMatter // Use custom frontmatter transformer if provided
      ? this.transformRuleFrontMatter(rule)
      : {globs: rule.globs.join(', ')}

    return buildMarkdownWithFrontMatter(fmData, rule.content)
  }

  protected buildRuleFileName(rule: RulePrompt): string {
    const prefix = `${this.rulePrefix}${this.ruleLinkSymbol}`
    return `${prefix}${rule.series}${this.ruleLinkSymbol}${rule.ruleName}${this.ruleExt}`
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

  async registerGlobalOutputDirs(_ctx: OutputPluginContext): Promise<RelativePath[]> {
    return []
  }

  async registerProjectOutputDirs(ctx: OutputPluginContext): Promise<RelativePath[]> {
    const results: RelativePath[] = []
    const {projects} = ctx.collectedInputContext.workspace

    const subdirs: string[] = []
    if (this.supportsCommands) subdirs.push(this.commandsSubDir)
    if (this.supportsSubAgents) subdirs.push(this.agentsSubDir)
    if (this.supportsSkills) subdirs.push(this.skillsSubDir)

    this.log.debug('registerProjectOutputDirs', {
      plugin: this.name,
      projectCount: projects.length,
      supportsCommands: this.supportsCommands,
      supportsSubAgents: this.supportsSubAgents,
      supportsSkills: this.supportsSkills,
      supportsRules: this.supportsRules,
      subdirs,
      commandsCount: ctx.collectedInputContext.commands?.length ?? 0,
      subAgentsCount: ctx.collectedInputContext.subAgents?.length ?? 0,
      skillsCount: ctx.collectedInputContext.skills?.length ?? 0,
      rulesCount: ctx.collectedInputContext.rules?.length ?? 0
    })

    if (subdirs.length > 0) { // Register CLI subdirs (commands, agents, skills)
      for (const project of projects) {
        if (project.dirFromWorkspacePath == null) {
          this.log.debug('project has no dirFromWorkspacePath', {plugin: this.name, projectName: project.name})
          continue
        }

        for (const subdir of subdirs) {
          const dirPath = path.join(project.dirFromWorkspacePath.path, this.globalConfigDir, subdir)
          results.push(this.createRelativePath(dirPath, project.dirFromWorkspacePath.basePath, () => subdir))
          this.log.debug('registered output dir', {plugin: this.name, project: project.name, subdir, dirPath})
        }
      }
    }

    if (this.supportsRules && ctx.collectedInputContext.rules != null && ctx.collectedInputContext.rules.length > 0) { // Register rules subdirs
      for (const project of projects) {
        if (project.dirFromWorkspacePath == null) continue
        const projectRules = applySubSeriesGlobPrefix(
          filterRulesByProjectConfig(ctx.collectedInputContext.rules, project.projectConfig),
          project.projectConfig
        )
        if (projectRules.length === 0) continue
        const dirPath = path.join(project.dirFromWorkspacePath.path, this.globalConfigDir, this.rulesSubDir)
        results.push(this.createRelativePath(dirPath, project.dirFromWorkspacePath.basePath, () => this.rulesSubDir))
        this.log.debug('registered rules dir', {plugin: this.name, project: project.name, dirPath})
      }
    }

    this.log.debug('registerProjectOutputDirs complete', {plugin: this.name, dirCount: results.length})
    return results
  }

  async registerProjectOutputFiles(ctx: OutputPluginContext): Promise<RelativePath[]> {
    const results: RelativePath[] = []
    const {projects} = ctx.collectedInputContext.workspace

    this.log.debug('registerProjectOutputFiles start', {
      plugin: this.name,
      projectCount: projects.length,
      commandsAvailable: ctx.collectedInputContext.commands != null,
      commandsCount: ctx.collectedInputContext.commands?.length ?? 0,
      subAgentsAvailable: ctx.collectedInputContext.subAgents != null,
      subAgentsCount: ctx.collectedInputContext.subAgents?.length ?? 0,
      skillsAvailable: ctx.collectedInputContext.skills != null,
      skillsCount: ctx.collectedInputContext.skills?.length ?? 0
    })

    for (const project of projects) {
      this.log.debug('processing project', {
        plugin: this.name,
        projectName: project.name,
        hasRootMemory: project.rootMemoryPrompt != null,
        childMemoryCount: project.childMemoryPrompts?.length ?? 0,
        hasDirFromWorkspace: project.dirFromWorkspacePath != null,
        projectConfig: project.projectConfig
      })

      if (project.rootMemoryPrompt != null && project.dirFromWorkspacePath != null) {
        results.push(this.createFileRelativePath(project.dirFromWorkspacePath, this.outputFileName))
      }

      if (project.childMemoryPrompts != null) {
        for (const child of project.childMemoryPrompts) {
          if (child.dir != null && this.isRelativePath(child.dir)) results.push(this.createFileRelativePath(child.dir, this.outputFileName))
        }
      }

      if (project.dirFromWorkspacePath == null) {
        this.log.debug('project has no dirFromWorkspacePath, skipping', {plugin: this.name, projectName: project.name})
        continue
      }

      const {projectConfig} = project
      const basePath = path.join(project.dirFromWorkspacePath.path, this.globalConfigDir)
      const transformOptions = {includeSeriesPrefix: true} as const

      if (this.supportsCommands && ctx.collectedInputContext.commands != null) {
        const allCommands = ctx.collectedInputContext.commands
        const filteredCommands = filterCommandsByProjectConfig(allCommands, projectConfig)
        this.log.debug('filtering commands', {
          plugin: this.name,
          projectName: project.name,
          totalCommands: allCommands.length,
          filteredCommands: filteredCommands.length,
          projectConfig
        })
        for (const cmd of filteredCommands) {
          const fileName = this.transformCommandName(cmd, transformOptions)
          results.push(this.createRelativePath(path.join(basePath, this.commandsSubDir, fileName), project.dirFromWorkspacePath.basePath, () => this.commandsSubDir))
          this.log.debug('registered command file', {plugin: this.name, project: project.name, fileName})
        }
      } else {
        this.log.debug('commands skipped', {
          plugin: this.name,
          supportsCommands: this.supportsCommands,
          hasCommands: ctx.collectedInputContext.commands != null
        })
      }

      if (this.supportsSubAgents && ctx.collectedInputContext.subAgents != null) {
        const allSubAgents = ctx.collectedInputContext.subAgents
        const filteredSubAgents = filterSubAgentsByProjectConfig(allSubAgents, projectConfig)
        this.log.debug('filtering subAgents', {
          plugin: this.name,
          projectName: project.name,
          totalSubAgents: allSubAgents.length,
          filteredSubAgents: filteredSubAgents.length,
          projectConfig
        })
        for (const agent of filteredSubAgents) {
          const fileName = agent.dir.path.replace(/\.mdx$/, '.md')
          results.push(this.createRelativePath(path.join(basePath, this.agentsSubDir, fileName), project.dirFromWorkspacePath.basePath, () => this.agentsSubDir))
          this.log.debug('registered agent file', {plugin: this.name, project: project.name, fileName})
        }
      } else {
        this.log.debug('subAgents skipped', {
          plugin: this.name,
          supportsSubAgents: this.supportsSubAgents,
          hasSubAgents: ctx.collectedInputContext.subAgents != null
        })
      }

      if (this.supportsSkills && ctx.collectedInputContext.skills != null) {
        const allSkills = ctx.collectedInputContext.skills
        const filteredSkills = filterSkillsByProjectConfig(allSkills, projectConfig)
        this.log.debug('filtering skills', {
          plugin: this.name,
          projectName: project.name,
          totalSkills: allSkills.length,
          filteredSkills: filteredSkills.length
        })
        for (const skill of filteredSkills) {
          const skillName = skill.yamlFrontMatter?.name ?? skill.dir.getDirectoryName()
          const skillDir = path.join(basePath, this.skillsSubDir, skillName)

          results.push(this.createRelativePath(path.join(skillDir, 'SKILL.md'), project.dirFromWorkspacePath.basePath, () => skillName))

          if (skill.childDocs != null) {
            for (const refDoc of skill.childDocs) {
              const refDocFileName = refDoc.dir.path.replace(/\.mdx$/, '.md')
              const refDocPath = path.join(skillDir, refDocFileName)
              results.push(this.createRelativePath(refDocPath, project.dirFromWorkspacePath.basePath, () => skillName))
            }
          }

          if (skill.resources != null) {
            for (const resource of skill.resources) {
              const resourcePath = path.join(skillDir, resource.relativePath)
              results.push(this.createRelativePath(resourcePath, project.dirFromWorkspacePath.basePath, () => skillName))
            }
          }
        }
      } else {
        this.log.debug('skills skipped', {
          plugin: this.name,
          supportsSkills: this.supportsSkills,
          hasSkills: ctx.collectedInputContext.skills != null
        })
      }

      if (this.supportsRules && ctx.collectedInputContext.rules != null && ctx.collectedInputContext.rules.length > 0) { // Register rule files
        const projectRules = applySubSeriesGlobPrefix(
          filterRulesByProjectConfig(ctx.collectedInputContext.rules, projectConfig),
          projectConfig
        )
        this.log.debug('registering rule files', {
          plugin: this.name,
          projectName: project.name,
          totalRules: ctx.collectedInputContext.rules.length,
          filteredRules: projectRules.length
        })
        for (const rule of projectRules) {
          const filePath = path.join(project.dirFromWorkspacePath.path, this.globalConfigDir, this.rulesSubDir, this.buildRuleFileName(rule))
          results.push(this.createRelativePath(filePath, project.dirFromWorkspacePath.basePath, () => this.rulesSubDir))
          this.log.debug('registered rule file', {plugin: this.name, project: project.name, ruleName: rule.ruleName})
        }
      } else {
        this.log.debug('rules skipped', {
          plugin: this.name,
          supportsRules: this.supportsRules,
          hasRules: ctx.collectedInputContext.rules != null
        })
      }
    }

    this.log.debug('registerProjectOutputFiles complete', {plugin: this.name, fileCount: results.length})
    return results
  }

  async registerGlobalOutputFiles(ctx: OutputPluginContext): Promise<RelativePath[]> {
    const {globalMemory} = ctx.collectedInputContext
    if (globalMemory == null) return []
    if (this.outputFileName === '') {
      this.log.error({action: 'skip', reason: 'outputFileName is empty', plugin: this.name, hint: 'Set outputFileName in plugin options or override registerGlobalOutputFiles'})
      return []
    }

    const globalDir = this.getGlobalConfigDir()
    return [
      this.createRelativePath(this.outputFileName, globalDir, () => this.globalConfigDir)
    ]
  }

  async canWrite(ctx: OutputWriteContext): Promise<boolean> {
    const {workspace, globalMemory, commands, subAgents, skills, rules} = ctx.collectedInputContext
    const hasProjectOutputs = workspace.projects.some(
      p => p.rootMemoryPrompt != null || (p.childMemoryPrompts?.length ?? 0) > 0
    )
    const hasGlobalMemory = globalMemory != null
    const hasProjectLevelCommands = this.supportsCommands && (commands?.length ?? 0) > 0 && workspace.projects.length > 0
    const hasProjectLevelSubAgents = this.supportsSubAgents && (subAgents?.length ?? 0) > 0 && workspace.projects.length > 0
    const hasProjectLevelSkills = this.supportsSkills && (skills?.length ?? 0) > 0 && workspace.projects.length > 0
    const hasProjectLevelRules = this.supportsRules && (rules?.length ?? 0) > 0 && workspace.projects.length > 0

    this.log.debug('canWrite check', {
      plugin: this.name,
      hasProjectOutputs,
      hasGlobalMemory,
      hasProjectLevelCommands,
      hasProjectLevelSubAgents,
      hasProjectLevelSkills,
      hasProjectLevelRules,
      projectCount: workspace.projects.length,
      commandsCount: commands?.length ?? 0,
      subAgentsCount: subAgents?.length ?? 0,
      skillsCount: skills?.length ?? 0,
      rulesCount: rules?.length ?? 0,
      supportsCommands: this.supportsCommands,
      supportsSubAgents: this.supportsSubAgents,
      supportsSkills: this.supportsSkills,
      supportsRules: this.supportsRules
    })

    if (hasProjectOutputs || hasGlobalMemory || hasProjectLevelCommands || hasProjectLevelSubAgents || hasProjectLevelSkills || hasProjectLevelRules) return true

    this.log.trace({action: 'skip', reason: 'noOutputs'})
    return false
  }

  async writeProjectOutputs(ctx: OutputWriteContext): Promise<WriteResults> {
    const {projects} = ctx.collectedInputContext.workspace
    const fileResults: WriteResult[] = []
    const dirResults: WriteResult[] = []

    this.log.debug('writeProjectOutputs start', {
      plugin: this.name,
      projectCount: projects.length,
      commandsCount: ctx.collectedInputContext.commands?.length ?? 0,
      subAgentsCount: ctx.collectedInputContext.subAgents?.length ?? 0,
      skillsCount: ctx.collectedInputContext.skills?.length ?? 0
    })

    for (const project of projects) {
      const projectName = project.name ?? 'unknown'
      const projectDir = project.dirFromWorkspacePath

      this.log.debug('writing project outputs', {
        plugin: this.name,
        projectName,
        hasProjectDir: projectDir != null,
        projectConfig: project.projectConfig
      })

      if (projectDir == null) {
        this.log.debug('project has no dirFromWorkspacePath, skipping', {plugin: this.name, projectName})
        continue
      }

      if (project.rootMemoryPrompt != null) {
        const result = await this.writePromptFile(ctx, projectDir, project.rootMemoryPrompt.content as string, `project:${projectName}/root`)
        fileResults.push(result)
      }

      if (project.childMemoryPrompts != null) {
        for (const child of project.childMemoryPrompts) {
          const childResult = await this.writePromptFile(ctx, child.dir, child.content as string, `project:${projectName}/child:${child.workingChildDirectoryPath?.path ?? 'unknown'}`)
          fileResults.push(childResult)
        }
      }

      const {projectConfig} = project
      const basePath = path.join(projectDir.basePath, projectDir.path, this.globalConfigDir)

      if (this.supportsCommands && ctx.collectedInputContext.commands != null) {
        const allCommands = ctx.collectedInputContext.commands
        const filteredCommands = filterCommandsByProjectConfig(allCommands, projectConfig)
        this.log.debug('writing commands', {
          plugin: this.name,
          projectName,
          totalCommands: allCommands.length,
          filteredCommands: filteredCommands.length,
          projectConfig
        })
        for (const cmd of filteredCommands) {
          const cmdResults = await this.writeCommand(ctx, basePath, cmd)
          fileResults.push(...cmdResults)
          this.log.debug('wrote command', {plugin: this.name, projectName, commandName: cmd.commandName, success: cmdResults.every(r => r.success)})
        }
      } else {
        this.log.debug('commands not written', {
          plugin: this.name,
          supportsCommands: this.supportsCommands,
          hasCommands: ctx.collectedInputContext.commands != null
        })
      }

      if (this.supportsSubAgents && ctx.collectedInputContext.subAgents != null) {
        const allSubAgents = ctx.collectedInputContext.subAgents
        const filteredSubAgents = filterSubAgentsByProjectConfig(allSubAgents, projectConfig)
        this.log.debug('writing subAgents', {
          plugin: this.name,
          projectName,
          totalSubAgents: allSubAgents.length,
          filteredSubAgents: filteredSubAgents.length,
          projectConfig
        })
        for (const agent of filteredSubAgents) {
          const agentResults = await this.writeSubAgent(ctx, basePath, agent)
          fileResults.push(...agentResults)
          this.log.debug('wrote subAgent', {plugin: this.name, projectName, agentPath: agent.dir.path, success: agentResults.every(r => r.success)})
        }
      } else {
        this.log.debug('subAgents not written', {
          plugin: this.name,
          supportsSubAgents: this.supportsSubAgents,
          hasSubAgents: ctx.collectedInputContext.subAgents != null
        })
      }

      if (this.supportsSkills && ctx.collectedInputContext.skills != null) {
        const allSkills = ctx.collectedInputContext.skills
        const filteredSkills = filterSkillsByProjectConfig(allSkills, projectConfig)
        this.log.debug('writing skills', {
          plugin: this.name,
          projectName,
          totalSkills: allSkills.length,
          filteredSkills: filteredSkills.length
        })
        for (const skill of filteredSkills) {
          const skillResults = await this.writeSkill(ctx, basePath, skill)
          fileResults.push(...skillResults)
          this.log.debug('wrote skill', {plugin: this.name, projectName, skillName: skill.yamlFrontMatter?.name, success: skillResults.every(r => r.success)})
        }
      } else {
        this.log.debug('skills not written', {
          plugin: this.name,
          supportsSkills: this.supportsSkills,
          hasSkills: ctx.collectedInputContext.skills != null
        })
      }

      if (this.supportsRules && ctx.collectedInputContext.rules != null && ctx.collectedInputContext.rules.length > 0) { // Write rules
        const allRules = ctx.collectedInputContext.rules
        const filteredRules = applySubSeriesGlobPrefix(
          filterRulesByProjectConfig(allRules, projectConfig),
          projectConfig
        )
        this.log.debug('writing rules', {
          plugin: this.name,
          projectName,
          totalRules: allRules.length,
          filteredRules: filteredRules.length
        })
        if (filteredRules.length > 0) {
          const rulesDir = path.join(projectDir.basePath, projectDir.path, this.globalConfigDir, this.rulesSubDir)
          for (const rule of filteredRules) {
            const rulePath = path.join(rulesDir, this.buildRuleFileName(rule))
            const result = await this.writeFile(ctx, rulePath, this.buildRuleContent(rule), 'rule')
            fileResults.push(result)
            this.log.debug('wrote rule', {plugin: this.name, projectName, ruleName: rule.ruleName, success: result.success})
          }
        }
      } else {
        this.log.debug('rules not written', {
          plugin: this.name,
          supportsRules: this.supportsRules,
          hasRules: ctx.collectedInputContext.rules != null
        })
      }
    }

    return {files: fileResults, dirs: dirResults}
  }

  async writeGlobalOutputs(ctx: OutputWriteContext): Promise<WriteResults> {
    const {globalMemory} = ctx.collectedInputContext
    const fileResults: WriteResult[] = []
    const dirResults: WriteResult[] = []

    if (globalMemory == null) return {files: fileResults, dirs: dirResults}
    if (this.outputFileName === '') {
      this.log.error({action: 'skip', reason: 'outputFileName is empty', plugin: this.name, hint: 'Set outputFileName in plugin options or override writeGlobalOutputs'})
      return {files: fileResults, dirs: dirResults}
    }

    const globalDir = this.getGlobalConfigDir()
    const fullPath = path.join(globalDir, this.outputFileName)
    const relativePath: RelativePath = this.createRelativePath(this.outputFileName, globalDir, () => this.globalConfigDir)

    if (ctx.dryRun === true) {
      this.log.trace({action: 'dryRun', type: 'globalMemory', path: fullPath})
      fileResults.push({
        path: relativePath,
        success: true,
        skipped: false
      })
    } else {
      try {
        deskWriteFileSync(fullPath, globalMemory.content as string)
        this.log.trace({action: 'write', type: 'globalMemory', path: fullPath})
        fileResults.push({path: relativePath, success: true})
      }
      catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error)
        this.log.error({action: 'write', type: 'globalMemory', path: fullPath, error: errMsg})
        fileResults.push({path: relativePath, success: false, error: error as Error})
      }
    }

    return {files: fileResults, dirs: dirResults}
  }

  protected async writeCommand(
    ctx: OutputWriteContext,
    basePath: string,
    cmd: CommandPrompt
  ): Promise<WriteResult[]> {
    const transformOptions = this.getTransformOptionsFromContext(ctx)
    const fileName = this.transformCommandName(cmd, transformOptions)
    const targetDir = path.join(basePath, this.commandsSubDir)
    const fullPath = path.join(targetDir, fileName)

    let compiledContent = cmd.content
    let compiledFrontMatter = cmd.yamlFrontMatter
    let useRecompiledFrontMatter = false

    if (cmd.rawMdxContent != null && this.toolPreset != null) {
      this.log.debug('recompiling command with tool preset', {
        file: cmd.dir.getAbsolutePath(),
        toolPreset: this.toolPreset,
        hasRawContent: true
      })
      try {
        // eslint-disable-next-line ts/no-unsafe-assignment
        const scopeCollector = new GlobalScopeCollector({toolPreset: this.toolPreset as any})
        const globalScope = scopeCollector.collect()
        const result = await mdxToMd(cmd.rawMdxContent, {globalScope, extractMetadata: true, basePath: cmd.dir.basePath})
        compiledContent = result.content
        compiledFrontMatter = result.metadata.fields as typeof cmd.yamlFrontMatter
        useRecompiledFrontMatter = true
      }
      catch (e) {
        this.log.warn('failed to recompile command, using default', {
          file: cmd.dir.getAbsolutePath(),
          error: e instanceof Error ? e.message : String(e)
        })
      }
    }

    const content = useRecompiledFrontMatter
      ? this.buildMarkdownContent(compiledContent, compiledFrontMatter)
      : this.buildMarkdownContentWithRaw(compiledContent, compiledFrontMatter, cmd.rawFrontMatter)

    return [await this.writeFile(ctx, fullPath, content, 'command')]
  }

  protected async writeSubAgent(
    ctx: OutputWriteContext,
    basePath: string,
    agent: SubAgentPrompt
  ): Promise<WriteResult[]> {
    const fileName = agent.dir.path.replace(/\.mdx$/, '.md')
    const targetDir = path.join(basePath, this.agentsSubDir)
    const fullPath = path.join(targetDir, fileName)

    const content = this.buildMarkdownContentWithRaw(
      agent.content,
      agent.yamlFrontMatter,
      agent.rawFrontMatter
    )

    return [await this.writeFile(ctx, fullPath, content, 'subAgent')]
  }

  protected async writeSkill(
    ctx: OutputWriteContext,
    basePath: string,
    skill: SkillPrompt
  ): Promise<WriteResult[]> {
    const results: WriteResult[] = []
    const skillName = skill.yamlFrontMatter?.name ?? skill.dir.getDirectoryName()
    const targetDir = path.join(basePath, this.skillsSubDir, skillName)
    const fullPath = path.join(targetDir, 'SKILL.md')

    const content = this.buildMarkdownContentWithRaw(
      skill.content as string,
      skill.yamlFrontMatter,
      skill.rawFrontMatter
    )

    const mainFileResult = await this.writeFile(ctx, fullPath, content, 'skill')
    results.push(mainFileResult)

    if (skill.childDocs != null) {
      for (const refDoc of skill.childDocs) {
        const refResults = await this.writeSkillReferenceDocument(ctx, targetDir, skillName, refDoc, basePath)
        results.push(...refResults)
      }
    }

    if (skill.resources != null) {
      for (const resource of skill.resources) {
        const refResults = await this.writeSkillResource(ctx, targetDir, skillName, resource, basePath)
        results.push(...refResults)
      }
    }

    return results
  }

  protected async writeSkillReferenceDocument(
    ctx: OutputWriteContext,
    skillDir: string,
    _skillName: string,
    refDoc: {dir: RelativePath, content: unknown},
    _basePath: string
  ): Promise<WriteResult[]> {
    const fileName = refDoc.dir.path.replace(/\.mdx$/, '.md')
    const fullPath = path.join(skillDir, fileName)
    return [await this.writeFile(ctx, fullPath, refDoc.content as string, 'skillRefDoc')]
  }

  protected async writeSkillResource(
    ctx: OutputWriteContext,
    skillDir: string,
    _skillName: string,
    resource: {relativePath: string, content: string},
    _basePath: string
  ): Promise<WriteResult[]> {
    const fullPath = path.join(skillDir, resource.relativePath)
    return [await this.writeFile(ctx, fullPath, resource.content, 'skillResource')]
  }
}
