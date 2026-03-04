import {Buffer} from 'node:buffer'
import type {CommandPrompt, CommandSeriesPluginOverride, ILogger, OutputCleanContext, OutputCleanupDeclarations, OutputCleanupPathDeclaration, OutputCleanupScope, OutputDeclarationScope, OutputFileDeclaration, OutputPlugin, OutputPluginCapabilities, OutputPluginContext, OutputScopeSelection, OutputScopeTopic, OutputTopicCapability, OutputWriteContext, RegistryOperationResult, RulePrompt, RuleScope, SkillPrompt, SubAgentPrompt} from './types'

import type {Path, ProjectConfig, RegistryData} from './types'
import type {RegistryWriter} from './RegistryWriter'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import process from 'node:process'
import {mdxToMd} from '@truenine/md-compiler'
import {buildMarkdownWithFrontMatter} from '@truenine/md-compiler/markdown'
import {GlobalScopeCollector} from './GlobalScopeCollector'
import {AbstractPlugin} from './AbstractPlugin'
import {FilePathKind,
  PluginKind} from './enums'
import {
  applySubSeriesGlobPrefix,
  filterByProjectConfig
} from './filters'
import {OUTPUT_SCOPE_TOPICS} from './types'
import {resolveTopicScopes} from './scopePolicy'

interface ScopedSourceConfig {
  /** Allowed source scopes for the topic */
  readonly sourceScopes?: readonly OutputDeclarationScope[]
}

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
 * Rule output configuration (declarative)
 */
export interface RuleOutputConfig {
  /** Rules subdirectory, default 'rules' */
  readonly subDir?: string
  /** Link symbol between series and ruleName, default '-' */
  readonly linkSymbol?: string
  /** Rule file prefix, default 'rule' */
  readonly prefix?: string
  /** Rule file extension, default '.md' */
  readonly ext?: string
  /** Custom frontmatter transformer */
  readonly transformFrontMatter?: (rule: RulePrompt) => Record<string, unknown>
  /** Allowed rule source scopes, default ['project', 'workspace', 'global'] */
  readonly sourceScopes?: readonly OutputDeclarationScope[]
}

/**
 * Command output configuration (declarative)
 */
export interface CommandOutputConfig {
  /** Commands subdirectory, default 'commands' */
  readonly subDir?: string
  /** Custom command frontmatter transformer */
  readonly transformFrontMatter?: (cmd: CommandPrompt, context: {
    readonly sourceFrontMatter?: Record<string, unknown>
    readonly isRecompiled: boolean
  }) => Record<string, unknown>
  /** Allowed command source scopes, default ['project', 'workspace', 'global'] */
  readonly sourceScopes?: readonly OutputDeclarationScope[]
}

/**
 * SubAgent output configuration (declarative)
 */
export interface SubAgentsOutputConfig extends ScopedSourceConfig {
  /** SubAgents subdirectory, default 'agents' */
  readonly subDir?: string
  /** Whether to include input-derived prefix in output filename, default true */
  readonly includePrefix?: boolean
  /** Separator between prefix and agent name, default '-' */
  readonly linkSymbol?: string
  /** SubAgent file extension, default '.md' */
  readonly ext?: string
  /** Optional frontmatter transformer */
  readonly transformFrontMatter?: (subAgent: SubAgentPrompt, context: {
    readonly sourceFrontMatter?: Record<string, unknown>
  }) => Record<string, unknown>
}

/**
 * Skills output configuration (declarative)
 */
export interface SkillsOutputConfig extends ScopedSourceConfig {
  /** Skills subdirectory, default 'skills' */
  readonly subDir?: string
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
 * Options for transforming subagent names in output filenames.
 */
export interface SubAgentNameTransformOptions {
  readonly includePrefix?: boolean
  readonly linkSymbol?: string
  readonly ext?: string
}

/**
 * Cleanup path entries for one scope.
 * Relative paths are resolved by scope base:
 * - project: project root
 * - workspace: workspace root
 * - global: user home
 * - xdgConfig: XDG config home (defaults to ~/.config)
 */
export interface CleanupScopePathsConfig {
  readonly files?: readonly string[]
  readonly dirs?: readonly string[]
  readonly globs?: readonly string[]
}

/**
 * Declarative cleanup configuration for output plugins.
 */
export interface OutputCleanupConfig {
  readonly delete?: Partial<Record<OutputCleanupScope, CleanupScopePathsConfig>>
  readonly protect?: Partial<Record<OutputCleanupScope, CleanupScopePathsConfig>>
  readonly excludeScanGlobs?: readonly string[]
}

/**
 * Options for configuring AbstractOutputPlugin subclasses.
 */
export interface AbstractOutputPluginOptions {
  globalConfigDir?: string

  outputFileName?: string

  dependsOn?: readonly string[]

  indexignore?: string

  /** Command output configuration (declarative) */
  commands?: CommandOutputConfig

  /** SubAgent output configuration (declarative) */
  subagents?: SubAgentsOutputConfig

  /** Skills output configuration (declarative) */
  skills?: SkillsOutputConfig

  toolPreset?: string

  /** Rule output configuration (declarative) */
  rules?: RuleOutputConfig

  /** Cleanup configuration (declarative) */
  cleanup?: OutputCleanupConfig

  /** Explicit output capability matrix for scope override validation */
  capabilities?: OutputPluginCapabilities
}

/**
 * Options for combining global content with project content.
 */
export interface CombineOptions {
  separator?: string

  skipIfEmpty?: boolean

  position?: 'before' | 'after'
}

type DeclarativeOutputSource =
  | {readonly kind: 'projectRootMemory', readonly content: string}
  | {readonly kind: 'projectChildMemory', readonly content: string}
  | {readonly kind: 'globalMemory', readonly content: string}
  | {readonly kind: 'command', readonly command: CommandPrompt}
  | {readonly kind: 'subAgent', readonly subAgent: SubAgentPrompt}
  | {readonly kind: 'skillMain', readonly skill: SkillPrompt}
  | {readonly kind: 'skillReference', readonly content: string}
  | {readonly kind: 'skillResource', readonly content: string, readonly encoding: 'text' | 'base64'}
  | {readonly kind: 'rule', readonly rule: RulePrompt}
  | {readonly kind: 'ignoreFile', readonly content: string}

export abstract class AbstractOutputPlugin extends AbstractPlugin<PluginKind.Output> implements OutputPlugin {
  readonly declarativeOutput = true as const

  readonly outputCapabilities: OutputPluginCapabilities

  protected readonly globalConfigDir: string

  protected readonly outputFileName: string

  protected readonly indexignore: string | undefined

  protected readonly commandsConfig: {
    readonly subDir: string
    readonly transformFrontMatter?: (cmd: CommandPrompt, context: {
      readonly sourceFrontMatter?: Record<string, unknown>
      readonly isRecompiled: boolean
    }) => Record<string, unknown>
    readonly sourceScopes: readonly OutputDeclarationScope[]
  }

  protected readonly subAgentsConfig: {
    readonly subDir: string
    readonly sourceScopes: readonly OutputDeclarationScope[]
    readonly includePrefix: boolean
    readonly linkSymbol: string
    readonly ext: string
    readonly transformFrontMatter?: (subAgent: SubAgentPrompt, context: {
      readonly sourceFrontMatter?: Record<string, unknown>
    }) => Record<string, unknown>
  }

  protected readonly commandOutputEnabled: boolean

  protected readonly subAgentOutputEnabled: boolean

  protected readonly skillsConfig: {
    readonly subDir: string
    readonly sourceScopes: readonly OutputDeclarationScope[]
  }

  protected readonly skillOutputEnabled: boolean

  protected readonly toolPreset: string | undefined

  /** Rule output configuration */
  protected readonly rulesConfig: RuleOutputConfig

  protected readonly ruleOutputEnabled: boolean

  protected readonly cleanupConfig: OutputCleanupConfig

  private readonly registryWriterCache: Map<string, RegistryWriter<unknown>> = new Map()

  protected constructor(name: string, options?: AbstractOutputPluginOptions) {
    super(name, PluginKind.Output, options?.dependsOn)
    this.globalConfigDir = options?.globalConfigDir ?? ''
    this.outputFileName = options?.outputFileName ?? ''
    this.indexignore = options?.indexignore

    const commandFrontMatterTransformer = options?.commands?.transformFrontMatter
    this.commandOutputEnabled = options?.commands != null
    this.commandsConfig = {
      subDir: options?.commands?.subDir ?? 'commands',
      sourceScopes: options?.commands?.sourceScopes ?? ['project', 'workspace', 'global'],
      ...commandFrontMatterTransformer != null && {transformFrontMatter: commandFrontMatterTransformer}
    } // Initialize command output config with defaults
    this.subAgentOutputEnabled = options?.subagents != null
    this.subAgentsConfig = {
      subDir: options?.subagents?.subDir ?? 'agents',
      sourceScopes: options?.subagents?.sourceScopes ?? ['project', 'workspace', 'global'],
      includePrefix: options?.subagents?.includePrefix ?? true,
      linkSymbol: options?.subagents?.linkSymbol ?? '-',
      ext: options?.subagents?.ext ?? '.md',
      ...options?.subagents?.transformFrontMatter != null && {transformFrontMatter: options.subagents.transformFrontMatter}
    } // Initialize subAgent output config with defaults
    this.skillOutputEnabled = options?.skills != null
    this.skillsConfig = {
      subDir: options?.skills?.subDir ?? 'skills',
      sourceScopes: options?.skills?.sourceScopes ?? ['project', 'workspace', 'global']
    }
    this.toolPreset = options?.toolPreset

    this.ruleOutputEnabled = options?.rules != null
    this.rulesConfig = {
      ...options?.rules,
      sourceScopes: options?.rules?.sourceScopes ?? ['project', 'workspace', 'global']
    } // Initialize rule output config with defaults
    this.cleanupConfig = options?.cleanup ?? {}

    this.outputCapabilities = options?.capabilities != null
      ? this.normalizeCapabilities(options.capabilities)
      : this.buildInferredCapabilities()
  }

  private buildInferredCapabilities(): OutputPluginCapabilities {
    const capabilities: OutputPluginCapabilities = {}

    if (this.outputFileName.length > 0) {
      capabilities['prompt'] = {
        scopes: ['project', 'global'],
        singleScope: false
      }
    }

    if (this.ruleOutputEnabled) {
      capabilities['rules'] = {
        scopes: this.rulesConfig.sourceScopes ?? ['project', 'workspace', 'global'],
        singleScope: false
      }
    }

    if (this.commandOutputEnabled) {
      capabilities['commands'] = {
        scopes: this.commandsConfig.sourceScopes,
        singleScope: true
      }
    }

    if (this.subAgentOutputEnabled) {
      capabilities['subagents'] = {
        scopes: this.subAgentsConfig.sourceScopes,
        singleScope: true
      }
    }

    if (this.skillOutputEnabled) {
      capabilities['skills'] = {
        scopes: this.skillsConfig.sourceScopes,
        singleScope: true
      }
    }

    return capabilities
  }

  private normalizeCapabilities(
    capabilities: OutputPluginCapabilities
  ): OutputPluginCapabilities {
    const normalizedCapabilities: OutputPluginCapabilities = {}
    for (const topic of OUTPUT_SCOPE_TOPICS) {
      const capability = capabilities[topic]
      if (capability == null) continue

      const normalized = this.normalizeCapability(capability)
      if (normalized != null) normalizedCapabilities[topic] = normalized
    }
    return normalizedCapabilities
  }

  private normalizeCapability(
    capability: OutputTopicCapability
  ): OutputTopicCapability | undefined {
    const uniqueScopes: OutputDeclarationScope[] = []
    for (const scope of capability.scopes) {
      if (!uniqueScopes.includes(scope)) uniqueScopes.push(scope)
    }
    if (uniqueScopes.length === 0) return void 0
    return {
      scopes: uniqueScopes,
      singleScope: capability.singleScope
    }
  }

  protected resolvePromptSourceProjectConfig(ctx: OutputPluginContext | OutputWriteContext): ProjectConfig | undefined {
    const {projects} = ctx.collectedOutputContext.workspace
    const promptSource = projects.find(p => p.isPromptSourceProject === true)
    return promptSource?.projectConfig ?? projects[0]?.projectConfig
  }

  protected isRelativePath(p: Path): boolean {
    return p.pathKind === FilePathKind.Relative
  }

  protected toRelativePath(p: Path): string {
    return p.path
  }

  protected resolveFullPath(targetPath: Path, outputFileName?: string): string {
    const dirPath = this.resolveDirectoryPath(targetPath)

    const fileName = outputFileName ?? this.outputFileName // Append the output file name if provided or if default is set
    if (fileName) return path.join(dirPath, fileName)
    return dirPath
  }

  protected resolveDirectoryPath(targetPath: Path): string {
    if (targetPath.pathKind === FilePathKind.Absolute) return targetPath.path
    if ('basePath' in targetPath) return path.resolve(targetPath.basePath as string, targetPath.path)
    return path.resolve(process.cwd(), targetPath.path)
  }

  protected getWorkspaceConfigDir(ctx: OutputWriteContext): string {
    const workspaceDir = this.resolveDirectoryPath(ctx.collectedOutputContext.workspace.directory)
    return path.join(workspaceDir, this.globalConfigDir)
  }

  protected createRelativePath(
    pathStr: string,
    basePath: string,
    _dirNameFn: () => string
  ): string {
    return path.join(basePath, pathStr)
  }

  protected createFileRelativePath(dir: string, fileName: string): string {
    return path.join(dir, fileName)
  }

  protected getGlobalConfigDir(): string {
    return path.join(this.getHomeDir(), this.globalConfigDir)
  }

  protected getXdgConfigHomeDir(): string {
    const xdgConfigHome = process.env['XDG_CONFIG_HOME']
    if (typeof xdgConfigHome === 'string' && xdgConfigHome.trim().length > 0) return xdgConfigHome
    return path.join(this.getHomeDir(), '.config')
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

  protected existsSync(p: string): boolean {
    return fs.existsSync(p)
  }

  protected lstatSync(p: string): fs.Stats {
    return fs.lstatSync(p)
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

  private resolveCleanupScopeBasePaths(
    scope: OutputCleanupScope,
    ctx: OutputCleanContext
  ): readonly string[] {
    if (scope === 'global') return [this.getHomeDir()]
    if (scope === 'workspace') return [this.resolveDirectoryPath(ctx.collectedOutputContext.workspace.directory)]
    if (scope === 'xdgConfig') return [this.getXdgConfigHomeDir()]

    const projectBasePaths: string[] = []
    for (const project of ctx.collectedOutputContext.workspace.projects) {
      const projectDir = project.dirFromWorkspacePath
      if (projectDir == null) continue
      projectBasePaths.push(this.resolveDirectoryPath(projectDir))
    }
    return projectBasePaths
  }

  private resolveCleanupDeclaredPath(basePath: string, declaredPath: string): string {
    if (path.isAbsolute(declaredPath)) return path.resolve(declaredPath)
    if (declaredPath === '~') return this.getHomeDir()
    if (declaredPath.startsWith('~/') || declaredPath.startsWith('~\\')) return path.resolve(this.getHomeDir(), declaredPath.slice(2))
    return path.resolve(basePath, declaredPath)
  }

  private normalizeGlobPattern(rawPattern: string): string {
    return rawPattern.replaceAll('\\', '/')
  }

  private buildCleanupTargetsFromScopeConfig(
    scopeConfig: Partial<Record<OutputCleanupScope, CleanupScopePathsConfig>> | undefined,
    kind: 'delete' | 'protect',
    ctx: OutputCleanContext
  ): readonly OutputCleanupPathDeclaration[] {
    if (scopeConfig == null) return []

    const declarations: OutputCleanupPathDeclaration[] = []
    const scopes: readonly OutputCleanupScope[] = ['project', 'workspace', 'global', 'xdgConfig']

    const pushTargets = (
      scope: OutputCleanupScope,
      targetKind: 'file' | 'directory' | 'glob',
      entries: readonly string[] | undefined
    ): void => {
      if (entries == null || entries.length === 0) return
      const basePaths = this.resolveCleanupScopeBasePaths(scope, ctx)

      for (const entry of entries) {
        for (const basePath of basePaths) {
          const resolved = path.isAbsolute(entry)
            ? path.resolve(entry)
            : this.resolveCleanupDeclaredPath(basePath, entry)

          declarations.push({
            path: targetKind === 'glob' ? this.normalizeGlobPattern(resolved) : resolved,
            kind: targetKind,
            scope,
            label: `${kind}.${scope}`
          })
        }
      }
    }

    for (const scope of scopes) {
      const entries = scopeConfig[scope]
      if (entries == null) continue
      pushTargets(scope, 'file', entries.files)
      pushTargets(scope, 'directory', entries.dirs)
      pushTargets(scope, 'glob', entries.globs)
    }

    return declarations
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
    return ctx.collectedOutputContext.globalMemory?.content as string | undefined
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

  protected transformSubAgentName(
    subAgent: SubAgentPrompt,
    options?: SubAgentNameTransformOptions
  ): string {
    const includePrefix = options?.includePrefix ?? this.subAgentsConfig.includePrefix
    const linkSymbol = options?.linkSymbol ?? this.subAgentsConfig.linkSymbol
    const ext = options?.ext ?? this.subAgentsConfig.ext
    const normalizedExt = ext.startsWith('.') ? ext : `.${ext}`
    const hasPrefix = includePrefix && subAgent.agentPrefix != null && subAgent.agentPrefix.length > 0

    if (!hasPrefix) return `${subAgent.agentName}${normalizedExt}`
    return `${subAgent.agentPrefix}${linkSymbol}${subAgent.agentName}${normalizedExt}`
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

  protected normalizeSourceScope(scope: RuleScope | undefined): OutputDeclarationScope {
    if (scope === 'workspace' || scope === 'global' || scope === 'project') return scope
    return 'project'
  }

  protected resolveCommandSourceScope(cmd: CommandPrompt): OutputDeclarationScope {
    if (cmd.globalOnly === true) return 'global'
    const scope = (cmd.yamlFrontMatter as {scope?: RuleScope} | undefined)?.scope
    return this.normalizeSourceScope(scope)
  }

  protected resolveSubAgentSourceScope(subAgent: SubAgentPrompt): OutputDeclarationScope {
    const scope = (subAgent.yamlFrontMatter as {scope?: RuleScope} | undefined)?.scope
    return this.normalizeSourceScope(scope)
  }

  protected resolveSkillSourceScope(skill: SkillPrompt): OutputDeclarationScope {
    const scope = (skill.yamlFrontMatter as {scope?: RuleScope} | undefined)?.scope
    return this.normalizeSourceScope(scope)
  }

  protected selectSingleScopeItems<T>(
    items: readonly T[],
    sourceScopes: readonly OutputDeclarationScope[],
    resolveScope: (item: T) => OutputDeclarationScope,
    requestedScopes?: OutputScopeSelection
  ): {readonly selectedScope?: OutputDeclarationScope, readonly items: readonly T[]} {
    if (items.length === 0) return {items: []}

    const availableScopes = [...new Set(items.map(resolveScope))]
    const selectedScopes = resolveTopicScopes({
      requestedScopes,
      defaultScopes: sourceScopes,
      supportedScopes: sourceScopes,
      singleScope: true,
      availableScopes
    })
    const [selectedScope] = selectedScopes
    if (selectedScope == null) return {items: []}

    return {
      selectedScope,
      items: items.filter(item => resolveScope(item) === selectedScope)
    }
  }

  protected selectRuleScopes(
    ctx: OutputWriteContext,
    rules: readonly RulePrompt[]
  ): readonly OutputDeclarationScope[] {
    const availableScopes = [...new Set(rules.map(rule => this.normalizeSourceScope(this.normalizeRuleScope(rule))))]
    return resolveTopicScopes({
      requestedScopes: this.getTopicScopeOverride(ctx, 'rules'),
      defaultScopes: this.rulesConfig.sourceScopes ?? ['project', 'workspace', 'global'],
      supportedScopes: this.rulesConfig.sourceScopes ?? ['project', 'workspace', 'global'],
      singleScope: false,
      availableScopes
    })
  }

  protected selectPromptScopes(
    ctx: OutputWriteContext,
    supportedScopes: readonly OutputDeclarationScope[] = ['project', 'global'],
    defaultScopes: readonly OutputDeclarationScope[] = supportedScopes
  ): readonly OutputDeclarationScope[] {
    return resolveTopicScopes({
      requestedScopes: this.getTopicScopeOverride(ctx, 'prompt'),
      defaultScopes,
      supportedScopes,
      singleScope: false
    })
  }

  protected getTopicScopeOverride(
    ctx: OutputPluginContext | OutputWriteContext,
    topic: OutputScopeTopic
  ): OutputScopeSelection | undefined {
    return ctx.pluginOptions?.outputScopes?.plugins?.[this.name]?.[topic]
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
    const fmData = this.rulesConfig.transformFrontMatter
      ? this.rulesConfig.transformFrontMatter(rule)
      : {globs: rule.globs.join(', ')}

    const sanitizedFmData = fmData == null || Object.keys(fmData).length === 0
      ? void 0
      : fmData

    return buildMarkdownWithFrontMatter(sanitizedFmData, rule.content)
  }

  protected buildRuleFileName(rule: RulePrompt): string {
    const prefix = `${this.rulesConfig.prefix ?? 'rule'}${this.rulesConfig.linkSymbol ?? '-'}`
    const fileName = `${prefix}${rule.prefix}${this.rulesConfig.linkSymbol ?? '-'}${rule.ruleName}${this.rulesConfig.ext ?? '.md'}`
    this.log.trace('buildRuleFileName', {
      plugin: this.name,
      rulePrefix: rule.prefix,
      ruleName: rule.ruleName,
      prefix: this.rulesConfig.prefix ?? 'rule',
      linkSymbol: this.rulesConfig.linkSymbol ?? '-',
      ext: this.rulesConfig.ext ?? '.md',
      result: fileName
    })
    return fileName
  }

  async declareOutputFiles(ctx: OutputWriteContext): Promise<OutputFileDeclaration[]> {
    return this.buildDefaultOutputDeclarations(ctx)
  }

  async declareCleanupPaths(ctx: OutputCleanContext): Promise<OutputCleanupDeclarations> {
    const cleanupDelete = this.buildCleanupTargetsFromScopeConfig(this.cleanupConfig.delete, 'delete', ctx)
    const cleanupProtect = this.buildCleanupTargetsFromScopeConfig(this.cleanupConfig.protect, 'protect', ctx)
    const excludeScanGlobs = this.cleanupConfig.excludeScanGlobs

    if (cleanupDelete.length === 0 && cleanupProtect.length === 0 && (excludeScanGlobs == null || excludeScanGlobs.length === 0)) return {}

    return {
      ...cleanupDelete.length > 0 && {delete: cleanupDelete},
      ...cleanupProtect.length > 0 && {protect: cleanupProtect},
      ...excludeScanGlobs != null && excludeScanGlobs.length > 0 && {excludeScanGlobs}
    }
  }

  async convertContent(
    declaration: OutputFileDeclaration,
    _ctx: OutputWriteContext
  ): Promise<string | Buffer> {
    const source = declaration.source as DeclarativeOutputSource

    switch (source.kind) {
      case 'projectRootMemory':
      case 'projectChildMemory':
      case 'globalMemory':
      case 'skillReference':
      case 'ignoreFile':
        return source.content
      case 'command':
        return this.buildCommandContent(source.command)
      case 'subAgent':
        return this.buildSubAgentContent(source.subAgent)
      case 'skillMain':
        return this.buildSkillMainContent(source.skill)
      case 'skillResource':
        return source.encoding === 'base64' ? Buffer.from(source.content, 'base64') : source.content
      case 'rule':
        return this.buildRuleContent(source.rule)
      default:
        throw new Error(`Unsupported declaration source for plugin ${this.name}`)
    }
  }

  protected async buildDefaultOutputDeclarations(ctx: OutputWriteContext): Promise<OutputFileDeclaration[]> {
    const declarations: OutputFileDeclaration[] = []
    const {
      workspace,
      globalMemory,
      commands,
      subAgents,
      skills,
      rules,
      aiAgentIgnoreConfigFiles
    } = ctx.collectedOutputContext
    const transformOptions = this.getTransformOptionsFromContext(ctx)
    const ignoreOutputPath = this.getIgnoreOutputPath()
    const ignoreFile = this.indexignore == null
      ? void 0
      : aiAgentIgnoreConfigFiles?.find(file => file.fileName === this.indexignore)

    const selectedCommands = this.commandOutputEnabled && commands != null
      ? this.selectSingleScopeItems(
          commands,
          this.commandsConfig.sourceScopes,
          cmd => this.resolveCommandSourceScope(cmd),
          this.getTopicScopeOverride(ctx, 'commands')
        )
      : {items: [] as readonly CommandPrompt[]}

    const selectedSubAgents = this.subAgentOutputEnabled && subAgents != null
      ? this.selectSingleScopeItems(
          subAgents,
          this.subAgentsConfig.sourceScopes,
          subAgent => this.resolveSubAgentSourceScope(subAgent),
          this.getTopicScopeOverride(ctx, 'subagents')
        )
      : {items: [] as readonly SubAgentPrompt[]}

    const selectedSkills = this.skillOutputEnabled && skills != null
      ? this.selectSingleScopeItems(
          skills,
          this.skillsConfig.sourceScopes,
          skill => this.resolveSkillSourceScope(skill),
          this.getTopicScopeOverride(ctx, 'skills')
        )
      : {items: [] as readonly SkillPrompt[]}

    const allRules = rules ?? []
    const activeRuleScopes = this.ruleOutputEnabled && allRules.length > 0
      ? new Set(this.selectRuleScopes(ctx, allRules))
      : new Set<OutputDeclarationScope>()
    const activePromptScopes = new Set(this.selectPromptScopes(ctx))

    const rulesByScope: Record<OutputDeclarationScope, RulePrompt[]> = {
      project: [],
      workspace: [],
      global: []
    }
    for (const rule of allRules) {
      const ruleScope = this.normalizeSourceScope(this.normalizeRuleScope(rule))
      rulesByScope[ruleScope].push(rule)
    }

    for (const project of workspace.projects) {
      const projectDir = project.dirFromWorkspacePath
      if (projectDir == null) continue

      if (this.outputFileName.length > 0 && activePromptScopes.has('project')) {
        if (project.rootMemoryPrompt != null) {
          declarations.push({
            path: this.resolveFullPath(projectDir),
            scope: 'project',
            source: {kind: 'projectRootMemory', content: project.rootMemoryPrompt.content as string}
          })
        }

        if (project.childMemoryPrompts != null) {
          for (const child of project.childMemoryPrompts) {
            declarations.push({
              path: this.resolveFullPath(child.dir),
              scope: 'project',
              source: {kind: 'projectChildMemory', content: child.content as string}
            })
          }
        }
      }

      const basePath = path.join(projectDir.basePath, projectDir.path, this.globalConfigDir)
      const projectConfig = project.projectConfig

      if (selectedCommands.selectedScope === 'project' && selectedCommands.items.length > 0) {
        const filteredCommands = filterByProjectConfig(selectedCommands.items, projectConfig, 'commands')
        for (const cmd of filteredCommands) {
          const fileName = this.transformCommandName(cmd, transformOptions)
          declarations.push({
            path: path.join(basePath, this.commandsConfig.subDir, fileName),
            scope: 'project',
            source: {kind: 'command', command: cmd}
          })
        }
      }

      if (selectedSubAgents.selectedScope === 'project' && selectedSubAgents.items.length > 0) {
        const filteredSubAgents = filterByProjectConfig(selectedSubAgents.items, projectConfig, 'subAgents')
        for (const subAgent of filteredSubAgents) {
          const fileName = this.transformSubAgentName(subAgent)
          declarations.push({
            path: path.join(basePath, this.subAgentsConfig.subDir, fileName),
            scope: 'project',
            source: {kind: 'subAgent', subAgent}
          })
        }
      }

      if (selectedSkills.selectedScope === 'project' && selectedSkills.items.length > 0) {
        const filteredSkills = filterByProjectConfig(selectedSkills.items, projectConfig, 'skills')
        for (const skill of filteredSkills) {
          const skillName = skill.yamlFrontMatter?.name ?? skill.dir.getDirectoryName()
          const skillDir = path.join(basePath, this.skillsConfig.subDir, skillName)

          declarations.push({
            path: path.join(skillDir, 'SKILL.md'),
            scope: 'project',
            source: {kind: 'skillMain', skill}
          })

          if (skill.childDocs != null) {
            for (const childDoc of skill.childDocs) {
              declarations.push({
                path: path.join(skillDir, childDoc.dir.path.replace(/\.mdx$/, '.md')),
                scope: 'project',
                source: {kind: 'skillReference', content: childDoc.content as string}
              })
            }
          }

          if (skill.resources != null) {
            for (const resource of skill.resources) {
              declarations.push({
                path: path.join(skillDir, resource.relativePath),
                scope: 'project',
                source: {kind: 'skillResource', content: resource.content, encoding: resource.encoding}
              })
            }
          }
        }
      }

      if (activeRuleScopes.has('project')) {
        const projectRules = applySubSeriesGlobPrefix(
          filterByProjectConfig(rulesByScope['project'], projectConfig, 'rules'),
          projectConfig
        )
        const rulesDir = path.join(basePath, this.rulesConfig.subDir ?? 'rules')
        for (const rule of projectRules) {
          declarations.push({
            path: path.join(rulesDir, this.buildRuleFileName(rule)),
            scope: 'project',
            source: {kind: 'rule', rule}
          })
        }
      }

      if (
        ignoreOutputPath != null
        && ignoreFile != null
        && project.isPromptSourceProject !== true
      ) {
        declarations.push({
          path: path.join(projectDir.basePath, projectDir.path, ignoreOutputPath),
          scope: 'project',
          source: {kind: 'ignoreFile', content: ignoreFile.content}
        })
      }
    }

    const promptSourceProjectConfig = this.resolvePromptSourceProjectConfig(ctx)
    const resolveScopedBasePath = (scope: OutputDeclarationScope): string => {
      if (scope === 'global') return this.getGlobalConfigDir()
      return this.getWorkspaceConfigDir(ctx)
    }

    if (
      (selectedCommands.selectedScope === 'global' || selectedCommands.selectedScope === 'workspace')
      && selectedCommands.items.length > 0
    ) {
      const filteredCommands = filterByProjectConfig(selectedCommands.items, promptSourceProjectConfig, 'commands')
      const basePath = resolveScopedBasePath(selectedCommands.selectedScope)
      for (const cmd of filteredCommands) {
        const fileName = this.transformCommandName(cmd, transformOptions)
        declarations.push({
          path: path.join(basePath, this.commandsConfig.subDir, fileName),
          scope: selectedCommands.selectedScope,
          source: {kind: 'command', command: cmd}
        })
      }
    }

    if (
      (selectedSubAgents.selectedScope === 'global' || selectedSubAgents.selectedScope === 'workspace')
      && selectedSubAgents.items.length > 0
    ) {
      const filteredSubAgents = filterByProjectConfig(selectedSubAgents.items, promptSourceProjectConfig, 'subAgents')
      const basePath = resolveScopedBasePath(selectedSubAgents.selectedScope)
      for (const subAgent of filteredSubAgents) {
        const fileName = this.transformSubAgentName(subAgent)
        declarations.push({
          path: path.join(basePath, this.subAgentsConfig.subDir, fileName),
          scope: selectedSubAgents.selectedScope,
          source: {kind: 'subAgent', subAgent}
        })
      }
    }

    if (
      (selectedSkills.selectedScope === 'global' || selectedSkills.selectedScope === 'workspace')
      && selectedSkills.items.length > 0
    ) {
      const filteredSkills = filterByProjectConfig(selectedSkills.items, promptSourceProjectConfig, 'skills')
      const basePath = resolveScopedBasePath(selectedSkills.selectedScope)
      for (const skill of filteredSkills) {
        const skillName = skill.yamlFrontMatter?.name ?? skill.dir.getDirectoryName()
        const skillDir = path.join(basePath, this.skillsConfig.subDir, skillName)

        declarations.push({
          path: path.join(skillDir, 'SKILL.md'),
          scope: selectedSkills.selectedScope,
          source: {kind: 'skillMain', skill}
        })

        if (skill.childDocs != null) {
          for (const childDoc of skill.childDocs) {
            declarations.push({
              path: path.join(skillDir, childDoc.dir.path.replace(/\.mdx$/, '.md')),
              scope: selectedSkills.selectedScope,
              source: {kind: 'skillReference', content: childDoc.content as string}
            })
          }
        }

        if (skill.resources != null) {
          for (const resource of skill.resources) {
            declarations.push({
              path: path.join(skillDir, resource.relativePath),
              scope: selectedSkills.selectedScope,
              source: {kind: 'skillResource', content: resource.content, encoding: resource.encoding}
            })
          }
        }
      }
    }

    for (const ruleScope of ['global', 'workspace'] as const) {
      if (!activeRuleScopes.has(ruleScope)) continue
      const basePath = resolveScopedBasePath(ruleScope)
      const filteredRules = applySubSeriesGlobPrefix(
        filterByProjectConfig(rulesByScope[ruleScope], promptSourceProjectConfig, 'rules'),
        promptSourceProjectConfig
      )
      const rulesDir = path.join(basePath, this.rulesConfig.subDir ?? 'rules')
      for (const rule of filteredRules) {
        declarations.push({
          path: path.join(rulesDir, this.buildRuleFileName(rule)),
          scope: ruleScope,
          source: {kind: 'rule', rule}
        })
      }
    }

    if (
      globalMemory != null
      && this.outputFileName.length > 0
      && activePromptScopes.has('global')
    ) {
      declarations.push({
        path: path.join(this.getGlobalConfigDir(), this.outputFileName),
        scope: 'global',
        source: {kind: 'globalMemory', content: globalMemory.content as string}
      })
    }

    return declarations
  }

  protected async buildCommandContent(cmd: CommandPrompt): Promise<string> {
    let compiledContent = cmd.content
    let compiledFrontMatter = cmd.yamlFrontMatter
    let useRecompiledFrontMatter = false

    if (cmd.rawMdxContent != null && this.toolPreset != null) {
      this.log.debug('recompiling command with tool preset', {
        file: cmd.dir.getAbsolutePath(),
        toolPreset: this.toolPreset,
        hasRawContent: true
      })
      // eslint-disable-next-line ts/no-unsafe-assignment
      const scopeCollector = new GlobalScopeCollector({toolPreset: this.toolPreset as any})
      const globalScope = scopeCollector.collect()
      const result = await mdxToMd(cmd.rawMdxContent, {globalScope, extractMetadata: true, basePath: cmd.dir.basePath})
      compiledContent = result.content
      compiledFrontMatter = result.metadata.fields as typeof cmd.yamlFrontMatter
      useRecompiledFrontMatter = true
    }

    const commandFrontMatterTransformer = this.commandsConfig.transformFrontMatter
    if (commandFrontMatterTransformer == null) {
      throw new Error(`commands.transformFrontMatter is required for command output plugin: ${this.name}`)
    }

    const transformedFrontMatter = commandFrontMatterTransformer(cmd, {
      isRecompiled: useRecompiledFrontMatter,
      ...compiledFrontMatter != null && {sourceFrontMatter: compiledFrontMatter as Record<string, unknown>}
    })

    return this.buildMarkdownContent(compiledContent, transformedFrontMatter)
  }

  protected buildSubAgentContent(agent: SubAgentPrompt): string {
    const subAgentFrontMatterTransformer = this.subAgentsConfig.transformFrontMatter
    if (subAgentFrontMatterTransformer != null) {
      const transformedFrontMatter = subAgentFrontMatterTransformer(agent, {
        ...agent.yamlFrontMatter != null && {sourceFrontMatter: agent.yamlFrontMatter as Record<string, unknown>}
      })
      return this.buildMarkdownContent(agent.content, transformedFrontMatter)
    }

    return this.buildMarkdownContentWithRaw(
      agent.content,
      agent.yamlFrontMatter,
      agent.rawFrontMatter
    )
  }

  protected buildSkillMainContent(skill: SkillPrompt): string {
    return this.buildMarkdownContentWithRaw(
      skill.content as string,
      skill.yamlFrontMatter,
      skill.rawFrontMatter
    )
  }
}
