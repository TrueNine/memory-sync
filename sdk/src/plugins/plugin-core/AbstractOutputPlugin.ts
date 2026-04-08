import type {BuildPromptTomlArtifactOptions} from '@truenine/md-compiler'
import type {ToolPresetName} from './GlobalScopeCollector'
import type {RegistryWriter} from './RegistryWriter'
import type {
  CommandPrompt,
  CommandSeriesPluginOverride,
  ILogger,
  OutputCleanContext,
  OutputCleanupDeclarations,
  OutputCleanupPathDeclaration,
  OutputCleanupScope,
  OutputDeclarationScope,
  OutputFileDeclaration,
  OutputPlugin,
  OutputPluginCapabilities,
  OutputPluginContext,
  OutputScopeSelection,
  OutputScopeTopic,
  OutputTopicCapability,
  OutputWriteContext,
  Path,
  Project,
  ProjectConfig,
  RegistryData,
  RegistryOperationResult,
  RulePrompt,
  RuleScope,
  SkillChildDoc,
  SkillPrompt,
  SkillResource,
  SubAgentYAMLFrontMatter,
  SubAgentPrompt,
  WslMirrorFileDeclaration
} from './types'

import {Buffer} from 'node:buffer'
import * as path from 'node:path'
import process from 'node:process'
import {buildPromptTomlArtifact} from '@truenine/md-compiler'
import {buildMarkdownWithFrontMatter, buildMarkdownWithRawFrontMatter} from '@truenine/md-compiler/markdown'
import {buildConfigDiagnostic, diagnosticLines} from '@/diagnostics'
import {getEffectiveHomeDir} from '@/runtime-environment'
import {AbstractPlugin} from './AbstractPlugin'
import {FilePathKind, PluginKind} from './enums'
import {applySubSeriesGlobPrefix, filterByProjectConfig} from './filters'
import {GlobalScopeCollector} from './GlobalScopeCollector'
import {compileRawPromptArtifact} from './PromptArtifactCache'
import {resolveSkillName, resolveSubAgentCanonicalName} from './PromptIdentity'
import {resolveTopicScopes} from './scopePolicy'
import {OUTPUT_SCOPE_TOPICS} from './types'

interface ScopedSourceConfig {
  /** Allowed source scopes for the topic */
  readonly sourceScopes?: readonly OutputDeclarationScope[]
  /** Optional source-scope remap before output selection */
  readonly scopeRemap?: Partial<Record<OutputDeclarationScope, OutputDeclarationScope>>
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
  /** Allowed rule source scopes, default ['project', 'global'] */
  readonly sourceScopes?: readonly OutputDeclarationScope[]
}

/**
 * Command output configuration (declarative)
 */
export interface CommandOutputConfig {
  /** Commands subdirectory, default 'commands' */
  readonly subDir?: string
  /** Custom command frontmatter transformer */
  readonly transformFrontMatter?: (
    cmd: CommandPrompt,
    context: {
      readonly sourceFrontMatter?: Record<string, unknown>
      readonly isRecompiled: boolean
    }
  ) => Record<string, unknown>
  /** Allowed command source scopes, default ['project', 'global'] */
  readonly sourceScopes?: readonly OutputDeclarationScope[]
  /** Optional source-scope remap before output selection */
  readonly scopeRemap?: Partial<Record<OutputDeclarationScope, OutputDeclarationScope>>
}

export type SubAgentArtifactFormat = 'markdown' | 'toml'
export type SubAgentFileNameSource = 'derivedPath' | 'frontMatterName'

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
  /** Output artifact format, default 'markdown' */
  readonly artifactFormat?: SubAgentArtifactFormat
  /** Field name that receives prompt body when artifactFormat='toml' */
  readonly bodyFieldName?: string
  /** Source for output file name, default 'derivedPath' */
  readonly fileNameSource?: SubAgentFileNameSource
  /** Front matter field remap before artifact emission */
  readonly fieldNameMap?: Readonly<Record<string, string>>
  /** Front matter fields to exclude from artifact emission */
  readonly excludedFrontMatterFields?: readonly string[]
  /** Additional fields injected into emitted artifact */
  readonly extraFields?: Readonly<Record<string, unknown>>
  /** Preferred root-level field order for emitted artifact */
  readonly fieldOrder?: readonly string[]
  /** Optional frontmatter transformer */
  readonly transformFrontMatter?: (
    subAgent: SubAgentPrompt,
    context: {
      readonly sourceFrontMatter?: SubAgentYAMLFrontMatter
    }
  ) => Record<string, unknown>
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

  treatWorkspaceRootProjectAsProject?: boolean

  dependsOn?: readonly string[]

  indexignore?: string

  /** Command output configuration (declarative) */
  commands?: CommandOutputConfig

  /** SubAgent output configuration (declarative) */
  subagents?: SubAgentsOutputConfig

  /** Skills output configuration (declarative) */
  skills?: SkillsOutputConfig

  toolPreset?: ToolPresetName

  /** Rule output configuration (declarative) */
  rules?: RuleOutputConfig

  /** Cleanup configuration (declarative) */
  cleanup?: OutputCleanupConfig

  /** Host-home files that should be mirrored into configured WSL instances */
  wslMirrors?: readonly string[]

  /** Explicit output capability matrix for scope override validation */
  capabilities?: OutputPluginCapabilities

  /** Whether this plugin honors the shared blank-line-after-front-matter option */
  supportsBlankLineAfterFrontMatter?: boolean
}

/**
 * Options for combining global content with project content.
 */
export interface CombineOptions {
  separator?: string

  skipIfEmpty?: boolean

  position?: 'before' | 'after'
}

export interface SkillDeclarationOptions {
  readonly skillSubDir?: string
  readonly skillFileName?: string
  readonly resolveSkillDirName?: (skill: SkillPrompt) => string
  readonly resolveChildDocPath?: (
    skillDir: string,
    childDoc: SkillChildDoc
  ) => string
  readonly buildSkillMainSource?: (
    skill: SkillPrompt,
    skillDirName: string
  ) => unknown
  readonly buildSkillReferenceSource?: (childDoc: SkillChildDoc) => unknown
  readonly buildSkillResourceSource?: (resource: SkillResource) => unknown
}

export interface SkillMcpDeclarationOptions {
  readonly skillSubDir?: string
  readonly fileName?: string
  readonly resolveSkillDirName?: (skill: SkillPrompt) => string
  readonly buildSkillMcpSource?: (
    skill: SkillPrompt,
    skillDirName: string
  ) => unknown
}

type DeclarativeOutputSource
  = | {readonly kind: 'projectRootMemory', readonly content: string}
    | {readonly kind: 'projectChildMemory', readonly content: string}
    | {readonly kind: 'globalMemory', readonly content: string}
    | {readonly kind: 'command', readonly command: CommandPrompt}
    | {readonly kind: 'subAgent', readonly subAgent: SubAgentPrompt}
    | {readonly kind: 'skillMain', readonly skill: SkillPrompt}
    | {readonly kind: 'skillReference', readonly content: string}
    | {
      readonly kind: 'skillResource'
      readonly content: string
      readonly encoding: 'text' | 'base64'
    }
    | {readonly kind: 'rule', readonly rule: RulePrompt}
    | {readonly kind: 'ignoreFile', readonly content: string}

export abstract class AbstractOutputPlugin extends AbstractPlugin implements OutputPlugin {
  readonly declarativeOutput = true as const

  readonly outputCapabilities: OutputPluginCapabilities

  protected readonly globalConfigDir: string

  protected readonly outputFileName: string

  protected readonly treatWorkspaceRootProjectAsProject: boolean

  protected readonly indexignore: string | undefined

  protected readonly commandsConfig: {
    readonly subDir: string
    readonly transformFrontMatter?: (
      cmd: CommandPrompt,
      context: {
        readonly sourceFrontMatter?: Record<string, unknown>
        readonly isRecompiled: boolean
      }
    ) => Record<string, unknown>
    readonly sourceScopes: readonly OutputDeclarationScope[]
    readonly scopeRemap?: Partial<Record<OutputDeclarationScope, OutputDeclarationScope>>
  }

  protected readonly subAgentsConfig: {
    readonly subDir: string
    readonly sourceScopes: readonly OutputDeclarationScope[]
    readonly includePrefix: boolean
    readonly linkSymbol: string
    readonly ext: string
    readonly artifactFormat: SubAgentArtifactFormat
    readonly bodyFieldName?: string
    readonly fileNameSource: SubAgentFileNameSource
    readonly fieldNameMap?: Readonly<Record<string, string>>
    readonly excludedFrontMatterFields?: readonly string[]
    readonly extraFields?: Readonly<Record<string, unknown>>
    readonly fieldOrder?: readonly string[]
    readonly scopeRemap?: Partial<Record<OutputDeclarationScope, OutputDeclarationScope>>
    readonly transformFrontMatter?: (
      subAgent: SubAgentPrompt,
      context: {
        readonly sourceFrontMatter?: SubAgentYAMLFrontMatter
      }
    ) => Record<string, unknown>
  }

  protected readonly commandOutputEnabled: boolean

  protected readonly subAgentOutputEnabled: boolean

  protected readonly skillsConfig: {
    readonly subDir: string
    readonly sourceScopes: readonly OutputDeclarationScope[]
    readonly scopeRemap?: Partial<Record<OutputDeclarationScope, OutputDeclarationScope>>
  }

  protected readonly skillOutputEnabled: boolean

  protected readonly toolPreset: ToolPresetName | undefined

  /** Rule output configuration */
  protected readonly rulesConfig: RuleOutputConfig

  protected readonly ruleOutputEnabled: boolean

  protected readonly cleanupConfig: OutputCleanupConfig

  protected readonly wslMirrorPaths: readonly string[]

  protected readonly supportsBlankLineAfterFrontMatter: boolean

  private readonly registryWriterCache: Map<string, RegistryWriter<unknown>> = new Map()

  private warnedDeprecatedSubAgentFileNameSource = false

  protected constructor(name: string, options?: AbstractOutputPluginOptions) {
    super(name, PluginKind.Output, options?.dependsOn)
    this.globalConfigDir = options?.globalConfigDir ?? ''
    this.outputFileName = options?.outputFileName ?? ''
    this.treatWorkspaceRootProjectAsProject = options?.treatWorkspaceRootProjectAsProject ?? false
    this.indexignore = options?.indexignore

    this.commandOutputEnabled = options?.commands != null
    this.commandsConfig = this.createCommandsConfig(options?.commands)
    this.subAgentOutputEnabled = options?.subagents != null
    this.subAgentsConfig = this.createSubAgentsConfig(options?.subagents)
    this.skillOutputEnabled = options?.skills != null
    this.skillsConfig = this.createSkillsConfig(options?.skills)
    this.toolPreset = options?.toolPreset

    this.ruleOutputEnabled = options?.rules != null
    this.rulesConfig = {
      ...options?.rules,
      sourceScopes: options?.rules?.sourceScopes ?? ['project', 'global']
    } // Initialize rule output config with defaults
    this.cleanupConfig = options?.cleanup ?? {}
    this.wslMirrorPaths = options?.wslMirrors ?? []
    this.supportsBlankLineAfterFrontMatter = options?.supportsBlankLineAfterFrontMatter ?? true

    this.outputCapabilities = options?.capabilities != null ? this.normalizeCapabilities(options.capabilities) : this.buildInferredCapabilities()
  }

  private createCommandsConfig(config?: CommandOutputConfig): AbstractOutputPlugin['commandsConfig'] {
    return {
      subDir: config?.subDir ?? 'commands',
      sourceScopes: config?.sourceScopes ?? ['project', 'global'],
      ...config?.scopeRemap != null && {scopeRemap: config.scopeRemap},
      ...config?.transformFrontMatter != null && {
        transformFrontMatter: config.transformFrontMatter
      }
    }
  }

  private createSubAgentsConfig(config?: SubAgentsOutputConfig): AbstractOutputPlugin['subAgentsConfig'] {
    return {
      subDir: config?.subDir ?? 'agents',
      sourceScopes: config?.sourceScopes ?? ['project', 'global'],
      includePrefix: config?.includePrefix ?? true,
      linkSymbol: config?.linkSymbol ?? '-',
      ext: config?.ext ?? '.md',
      artifactFormat: config?.artifactFormat ?? 'markdown',
      fileNameSource: config?.fileNameSource ?? 'derivedPath',
      ...config?.bodyFieldName != null && {
        bodyFieldName: config.bodyFieldName
      },
      ...config?.fieldNameMap != null && {
        fieldNameMap: config.fieldNameMap
      },
      ...config?.excludedFrontMatterFields != null && {
        excludedFrontMatterFields: config.excludedFrontMatterFields
      },
      ...config?.extraFields != null && {extraFields: config.extraFields},
      ...config?.fieldOrder != null && {fieldOrder: config.fieldOrder},
      ...config?.scopeRemap != null && {scopeRemap: config.scopeRemap},
      ...config?.transformFrontMatter != null && {
        transformFrontMatter: config.transformFrontMatter
      }
    }
  }

  private createSkillsConfig(config?: SkillsOutputConfig): AbstractOutputPlugin['skillsConfig'] {
    return {
      subDir: config?.subDir ?? 'skills',
      sourceScopes: config?.sourceScopes ?? ['project', 'global'],
      ...config?.scopeRemap != null && {scopeRemap: config.scopeRemap}
    }
  }

  private buildInferredCapabilities(): OutputPluginCapabilities {
    const capabilities: OutputPluginCapabilities = {}

    if (this.outputFileName.length > 0) {
      capabilities.prompt = {
        scopes: ['project', 'global'],
        singleScope: false
      }
    }

    if (this.ruleOutputEnabled) {
      capabilities.rules = {
        scopes: this.rulesConfig.sourceScopes ?? ['project', 'global'],
        singleScope: false
      }
    }

    if (this.commandOutputEnabled) {
      capabilities.commands = {
        scopes: this.commandsConfig.sourceScopes,
        singleScope: true
      }
    }

    if (this.subAgentOutputEnabled) {
      capabilities.subagents = {
        scopes: this.subAgentsConfig.sourceScopes,
        singleScope: true
      }
    }

    if (this.skillOutputEnabled) {
      capabilities.skills = {
        scopes: this.skillsConfig.sourceScopes,
        singleScope: true
      }
    }

    return capabilities
  }

  private normalizeCapabilities(capabilities: OutputPluginCapabilities): OutputPluginCapabilities {
    const normalizedCapabilities: OutputPluginCapabilities = {}
    for (const topic of OUTPUT_SCOPE_TOPICS) {
      const capability = capabilities[topic]
      if (capability == null) continue

      const normalized = this.normalizeCapability(capability)
      if (normalized != null) normalizedCapabilities[topic] = normalized
    }
    return normalizedCapabilities
  }

  private normalizeCapability(capability: OutputTopicCapability): OutputTopicCapability | undefined {
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
    const projects = this.getConcreteProjects(ctx)
    const promptSource = projects.find(p => p.isPromptSourceProject === true)
    return promptSource?.projectConfig ?? projects[0]?.projectConfig
  }

  protected getConcreteProjects(ctx: OutputPluginContext | OutputWriteContext): Project[] {
    return ctx.collectedOutputContext.workspace.projects.filter(project => project.isWorkspaceRootProject !== true)
  }

  protected isProjectPromptOutputTarget(project: Project): boolean {
    return project.isPromptSourceProject !== true
  }

  protected getProjectOutputProjects(ctx: OutputPluginContext | OutputWriteContext): Project[] {
    const projects = [...this.getConcreteProjects(ctx)]
    if (!this.treatWorkspaceRootProjectAsProject) return projects

    const workspaceRootProject = this.getWorkspaceRootProject(ctx)
    if (workspaceRootProject != null) projects.push(workspaceRootProject)
    return projects
  }

  protected getProjectPromptOutputProjects(ctx: OutputPluginContext | OutputWriteContext): Project[] {
    return this.getProjectOutputProjects(ctx).filter(project => this.isProjectPromptOutputTarget(project))
  }

  protected getWorkspaceRootProject(ctx: OutputPluginContext | OutputWriteContext): Project | undefined {
    return ctx.collectedOutputContext.workspace.projects.find(project => project.isWorkspaceRootProject === true)
  }

  protected resolveProjectRootDir(ctx: OutputPluginContext | OutputWriteContext, project: Project): string | undefined {
    if (project.isWorkspaceRootProject === true) {
      return this.resolveDirectoryPath(ctx.collectedOutputContext.workspace.directory)
    }

    const projectDir = project.dirFromWorkspacePath
    if (projectDir == null) return void 0
    return this.resolveDirectoryPath(projectDir)
  }

  protected resolveProjectConfigDir(ctx: OutputPluginContext | OutputWriteContext, project: Project): string | undefined {
    const projectRootDir = this.resolveProjectRootDir(ctx, project)
    if (projectRootDir == null) return void 0
    if (this.globalConfigDir.length === 0) return projectRootDir
    return path.join(projectRootDir, this.globalConfigDir)
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
    if ('basePath' in targetPath) {
      return path.resolve(targetPath.basePath as string, targetPath.path)
    }
    return path.resolve(process.cwd(), targetPath.path)
  }

  protected getWorkspaceConfigDir(ctx: OutputWriteContext): string {
    const workspaceDir = this.resolveDirectoryPath(ctx.collectedOutputContext.workspace.directory)
    return path.join(workspaceDir, this.globalConfigDir)
  }

  protected createRelativePath(pathStr: string, basePath: string, dirNameFn: () => string): string {
    void dirNameFn
    return path.join(basePath, pathStr)
  }

  protected createFileRelativePath(dir: string, fileName: string): string {
    return path.join(dir, fileName)
  }

  protected getGlobalConfigDir(): string {
    return path.join(this.getHomeDir(), this.globalConfigDir)
  }

  protected getXdgConfigHomeDir(): string {
    const xdgConfigHome = process.env['XDG_CONFIG_HOME']?.trim()
    if (xdgConfigHome != null && xdgConfigHome.length > 0) {
      return xdgConfigHome
    }
    return path.join(this.getHomeDir(), '.config')
  }

  protected getHomeDir(): string {
    return getEffectiveHomeDir()
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

  protected buildProjectPromptCleanupTargets(ctx: OutputCleanContext, fileName: string = this.outputFileName): readonly OutputCleanupPathDeclaration[] {
    if (fileName.length === 0) return []

    const declarations: OutputCleanupPathDeclaration[] = []
    const seenPaths = new Set<string>()

    const pushCleanupFile = (targetPath: string, label: string): void => {
      if (seenPaths.has(targetPath)) return
      seenPaths.add(targetPath)
      declarations.push({
        path: targetPath,
        kind: 'file',
        scope: 'project',
        label
      })
    }

    for (const project of this.getProjectOutputProjects(ctx)) {
      const projectRootDir = this.resolveProjectRootDir(ctx, project)
      if (projectRootDir == null) continue

      // Add glob pattern to match all files with the given name in the project directory
      // This ensures files in subdirectories not explicitly tracked as childMemoryPrompts are also cleaned up
      declarations.push({
        path: this.resolvePath(projectRootDir, '**', fileName),
        kind: 'glob',
        scope: 'project',
        label: 'delete.project.glob'
      })

      pushCleanupFile(this.resolvePath(projectRootDir, fileName), 'delete.project')

      if (project.childMemoryPrompts == null) continue
      for (const child of project.childMemoryPrompts) {
        pushCleanupFile(this.resolveFullPath(child.dir, fileName), 'delete.project.child')
      }
    }

    return declarations
  }

  protected basename(p: string, ext?: string): string {
    return path.basename(p, ext)
  }

  protected getIgnoreOutputPath(): string | undefined {
    if (this.indexignore == null) return void 0
    return this.indexignore
  }

  private resolveCleanupScopeBasePaths(scope: OutputCleanupScope, ctx: OutputCleanContext): readonly string[] {
    if (scope === 'global') return [this.getHomeDir()]
    if (scope === 'xdgConfig') return [this.getXdgConfigHomeDir()]

    const projectBasePaths: string[] = []
    for (const project of this.getProjectOutputProjects(ctx)) {
      const projectBasePath = this.resolveProjectRootDir(ctx, project)
      if (projectBasePath == null) continue
      projectBasePaths.push(projectBasePath)
    }
    return projectBasePaths
  }

  private resolveCleanupDeclaredPath(basePath: string, declaredPath: string): string {
    if (path.isAbsolute(declaredPath)) return path.resolve(declaredPath)
    if (declaredPath === '~') return this.getHomeDir()
    if (declaredPath.startsWith('~/') || declaredPath.startsWith('~\\')) {
      return path.resolve(this.getHomeDir(), declaredPath.slice(2))
    }
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
    const scopes: readonly OutputCleanupScope[] = ['project', 'global', 'xdgConfig']

    const pushTargets = (scope: OutputCleanupScope, targetKind: 'file' | 'directory' | 'glob', entries: readonly string[] | undefined): void => {
      if (entries == null || entries.length === 0) return
      const basePaths = this.resolveCleanupScopeBasePaths(scope, ctx)

      for (const entry of entries) {
        for (const basePath of basePaths) {
          const resolved = path.isAbsolute(entry) ? path.resolve(entry) : this.resolveCleanupDeclaredPath(basePath, entry)

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

  protected resolveFrontMatterBlankLineAfter(ctx?: OutputPluginContext): boolean {
    if (!this.supportsBlankLineAfterFrontMatter) return true
    return ctx?.pluginOptions?.frontMatter?.blankLineAfter ?? true
  }

  protected buildMarkdownContent(content: string, frontMatter?: Record<string, unknown>, ctx?: OutputPluginContext): string {
    return buildMarkdownWithFrontMatter(frontMatter, content, {
      blankLineAfter: this.resolveFrontMatterBlankLineAfter(ctx)
    })
  }

  protected buildMarkdownContentWithRaw(content: string, frontMatter?: Record<string, unknown>, rawFrontMatter?: string, ctx?: OutputPluginContext): string {
    if (frontMatter != null && Object.keys(frontMatter).length > 0) {
      return this.buildMarkdownContent(content, frontMatter, ctx)
    } // If we have parsed front matter, use it

    if (rawFrontMatter != null && rawFrontMatter.length > 0) {
      return buildMarkdownWithRawFrontMatter(rawFrontMatter, content, {
        blankLineAfter: this.resolveFrontMatterBlankLineAfter(ctx)
      })
    } // If we have raw front matter but parsing failed, use raw

    return content // No front matter
  }

  protected buildTomlContent(options: BuildPromptTomlArtifactOptions): string {
    return buildPromptTomlArtifact(options)
  }

  protected extractGlobalMemoryContent(ctx: OutputWriteContext): string | undefined {
    return ctx.collectedOutputContext.globalMemory?.content as string | undefined
  }

  protected combineGlobalWithContent(globalContent: string | undefined, projectContent: string, options?: CombineOptions): string {
    const {separator = '\n\n', skipIfEmpty = true, position = 'before'} = options ?? {}

    if (skipIfEmpty && (globalContent == null || globalContent.trim().length === 0)) {
      return projectContent
    } // Skip if global content is undefined/null or empty/whitespace when skipIfEmpty is true

    const effectiveGlobalContent = globalContent ?? '' // If global content is null/undefined but skipIfEmpty is false, treat as empty string

    if (position === 'after') {
      return `${projectContent}${separator}${effectiveGlobalContent}`
    } // Combine based on position

    return `${effectiveGlobalContent}${separator}${projectContent}` // Default: 'before'
  }

  protected getSkillName(skill: SkillPrompt): string {
    return resolveSkillName(skill)
  }

  protected getSubAgentCanonicalName(subAgent: SubAgentPrompt): string {
    return resolveSubAgentCanonicalName(subAgent)
  }

  protected transformCommandName(cmd: CommandPrompt, options?: CommandNameTransformOptions): string {
    const {includeSeriesPrefix = true, seriesSeparator = '-'} = options ?? {}

    if (!includeSeriesPrefix || cmd.commandPrefix == null) {
      return `${cmd.commandName}.md`
    } // If prefix should not be included or prefix is not present, return just commandName

    return `${cmd.commandPrefix}${seriesSeparator}${cmd.commandName}.md`
  }

  protected transformSubAgentName(subAgent: SubAgentPrompt, options?: SubAgentNameTransformOptions): string {
    const {fileNameSource} = this.subAgentsConfig
    const includePrefix = options?.includePrefix ?? this.subAgentsConfig.includePrefix
    const linkSymbol = options?.linkSymbol ?? this.subAgentsConfig.linkSymbol
    const ext = options?.ext ?? this.subAgentsConfig.ext
    const normalizedExt = ext.startsWith('.') ? ext : `.${ext}`
    if (fileNameSource === 'frontMatterName') {
      this.warnDeprecatedSubAgentFileNameSource()
    }

    const hasPrefix = includePrefix && subAgent.agentPrefix != null && subAgent.agentPrefix.length > 0
    if (!hasPrefix) return `${subAgent.agentName}${normalizedExt}`
    return `${subAgent.agentPrefix}${linkSymbol}${subAgent.agentName}${normalizedExt}`
  }

  protected normalizeOutputFileStem(value: string): string {
    const sanitizedCharacters = Array.from(value.trim(), character => {
      const codePoint = character.codePointAt(0) ?? 0
      if (codePoint <= 31 || '<>:"/\\|?*'.includes(character)) return '-'
      return character
    })
    let normalized = sanitizedCharacters.join('')

    while (normalized.endsWith('.') || normalized.endsWith(' ')) {
      normalized = normalized.slice(0, -1)
    }

    if (normalized.length === 0) {
      throw new Error(`Cannot derive a valid output file name from "${value}"`)
    }

    return normalized
  }

  private warnDeprecatedSubAgentFileNameSource(): void {
    if (this.warnedDeprecatedSubAgentFileNameSource) return
    this.warnedDeprecatedSubAgentFileNameSource = true

    this.log.warn(
      buildConfigDiagnostic({
        code: 'SUBAGENT_FRONTMATTER_NAME_SOURCE_DEPRECATED',
        title: 'Sub-agent fileNameSource="frontMatterName" now resolves from derived names',
        reason: diagnosticLines(
          `The ${this.name} plugin no longer reads authored sub-agent front matter names.`,
          'tnmsc now derives sub-agent names from the sub-agent path.'
        ),
        exactFix: diagnosticLines(
          'Remove authored `name` fields from sub-agent sources.',
          'Keep using `fileNameSource="frontMatterName"` only as a temporary alias for the derived-path naming behavior.'
        ),
        details: {
          plugin: this.name
        }
      })
    )
  }

  protected appendSubAgentDeclarations(
    declarations: OutputFileDeclaration[],
    basePath: string,
    scope: OutputDeclarationScope,
    scopedSubAgents: readonly SubAgentPrompt[]
  ): void {
    const seenPaths = new Map<string, string>()

    for (const subAgent of scopedSubAgents) {
      const fileName = this.transformSubAgentName(subAgent)
      const targetPath = path.join(basePath, this.subAgentsConfig.subDir, fileName)
      const existingAgentName = seenPaths.get(targetPath)

      if (existingAgentName != null) {
        throw new Error(
          `Sub-agent output collision in ${this.name}: "${this.getSubAgentCanonicalName(subAgent)}" and "${existingAgentName}" both resolve to ${targetPath}`
        )
      }

      seenPaths.set(targetPath, this.getSubAgentCanonicalName(subAgent))
      declarations.push({
        path: targetPath,
        scope,
        source: {kind: 'subAgent', subAgent}
      })
    }
  }

  protected appendCommandDeclarations(
    declarations: OutputFileDeclaration[],
    basePath: string,
    scope: OutputDeclarationScope,
    commands: readonly CommandPrompt[],
    transformOptions: CommandNameTransformOptions
  ): void {
    for (const cmd of commands) {
      const fileName = this.transformCommandName(cmd, transformOptions)
      declarations.push({
        path: path.join(basePath, this.commandsConfig.subDir, fileName),
        scope,
        source: {kind: 'command', command: cmd}
      })
    }
  }

  protected appendSkillDeclarations(
    declarations: OutputFileDeclaration[],
    basePath: string,
    scope: OutputDeclarationScope,
    scopedSkills: readonly SkillPrompt[],
    options: SkillDeclarationOptions = {}
  ): void {
    const skillSubDir = options.skillSubDir ?? this.skillsConfig.subDir
    const skillFileName = options.skillFileName ?? 'SKILL.md'
    const resolveSkillDirName
      = options.resolveSkillDirName ?? (skill => this.getSkillName(skill))
    const resolveChildDocPath
      = options.resolveChildDocPath
        ?? ((skillDir, childDoc) =>
          path.join(skillDir, childDoc.relativePath.replace(/\.mdx$/, '.md')))
    const buildSkillMainSource
      = options.buildSkillMainSource ?? (skill => ({kind: 'skillMain', skill}))
    const buildSkillReferenceSource
      = options.buildSkillReferenceSource
        ?? (childDoc => ({
          kind: 'skillReference',
          content: childDoc.content as string
        }))
    const buildSkillResourceSource
      = options.buildSkillResourceSource
        ?? (resource => ({
          kind: 'skillResource',
          content: resource.content,
          encoding: resource.encoding
        }))

    for (const skill of scopedSkills) {
      const skillDirName = resolveSkillDirName(skill)
      const skillDir = path.join(basePath, skillSubDir, skillDirName)

      declarations.push({
        path: path.join(skillDir, skillFileName),
        scope,
        source: buildSkillMainSource(skill, skillDirName)
      })

      if (skill.childDocs != null) {
        for (const childDoc of skill.childDocs) {
          declarations.push({
            path: resolveChildDocPath(skillDir, childDoc),
            scope,
            source: buildSkillReferenceSource(childDoc)
          })
        }
      }

      if (skill.resources != null) {
        for (const resource of skill.resources) {
          declarations.push({
            path: path.join(skillDir, resource.relativePath),
            scope,
            source: buildSkillResourceSource(resource)
          })
        }
      }
    }
  }

  protected appendSkillMcpDeclarations(
    declarations: OutputFileDeclaration[],
    basePath: string,
    scope: OutputDeclarationScope,
    scopedSkills: readonly SkillPrompt[],
    options: SkillMcpDeclarationOptions = {}
  ): void {
    const skillSubDir = options.skillSubDir ?? this.skillsConfig.subDir
    const fileName = options.fileName ?? 'mcp.json'
    const resolveSkillDirName
      = options.resolveSkillDirName ?? (skill => this.getSkillName(skill))
    const buildSkillMcpSource
      = options.buildSkillMcpSource
        ?? (skill => ({
          kind: 'skillMcpConfig',
          rawContent: skill.mcpConfig?.rawContent ?? ''
        }))

    for (const skill of scopedSkills) {
      if (skill.mcpConfig == null) continue

      const skillDirName = resolveSkillDirName(skill)
      declarations.push({
        path: path.join(basePath, skillSubDir, skillDirName, fileName),
        scope,
        source: buildSkillMcpSource(skill, skillDirName)
      })
    }
  }

  protected appendRuleDeclarations(declarations: OutputFileDeclaration[], basePath: string, scope: OutputDeclarationScope, rules: readonly RulePrompt[]): void {
    const rulesDir = path.join(basePath, this.rulesConfig.subDir ?? 'rules')

    for (const rule of rules) {
      declarations.push({
        path: path.join(rulesDir, this.buildRuleFileName(rule)),
        scope,
        source: {kind: 'rule', rule}
      })
    }
  }

  protected buildSubAgentTomlContent(agent: SubAgentPrompt, frontMatter: Record<string, unknown> | undefined): string {
    const {bodyFieldName} = this.subAgentsConfig
    if (bodyFieldName == null || bodyFieldName.length === 0) {
      throw new Error(`subagents.bodyFieldName is required when artifactFormat="toml" for ${this.name}`)
    }

    return this.buildTomlContent({
      content: agent.content,
      bodyFieldName,
      ...frontMatter != null && {frontMatter},
      ...this.subAgentsConfig.fieldNameMap != null && {
        fieldNameMap: this.subAgentsConfig.fieldNameMap
      },
      ...this.subAgentsConfig.excludedFrontMatterFields != null && {
        excludedKeys: this.subAgentsConfig.excludedFrontMatterFields
      },
      ...this.subAgentsConfig.extraFields != null && {
        extraFields: this.subAgentsConfig.extraFields
      },
      ...this.subAgentsConfig.fieldOrder != null && {
        fieldOrder: this.subAgentsConfig.fieldOrder
      }
    })
  }

  protected getCommandSeriesOptions(): CommandSeriesPluginOverride {
    return {}
  }

  protected getTransformOptionsFromContext(_ctx: OutputWriteContext, additionalOptions?: CommandNameTransformOptions): CommandNameTransformOptions {
    if (additionalOptions?.includeSeriesPrefix != null) {
      return {includeSeriesPrefix: additionalOptions.includeSeriesPrefix}
    }
    return {}
  }

  protected shouldSkipDueToPlugin(ctx: OutputWriteContext, precedingPluginName: string): boolean {
    const registeredPlugins = ctx.registeredPluginNames
    if (registeredPlugins == null) return false
    return registeredPlugins.includes(precedingPluginName)
  }

  protected getRegistryWriter<TEntry, TRegistry extends RegistryData, T extends RegistryWriter<TEntry, TRegistry>>(WriterClass: new (logger: ILogger) => T): T {
    const cacheKey = WriterClass.name

    const cached = this.registryWriterCache.get(cacheKey) // Check cache first
    if (cached != null) return cached as T

    const writer = new WriterClass(this.log) // Create new instance and cache it
    this.registryWriterCache.set(cacheKey, writer as RegistryWriter<unknown>)
    return writer
  }

  protected async registerInRegistry<TEntry, TRegistry extends RegistryData>(
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
    if (scope === 'global' || scope === 'project') return scope
    return 'project'
  }

  protected remapDeclarationScope(
    scope: OutputDeclarationScope,
    remap?: Partial<Record<OutputDeclarationScope, OutputDeclarationScope>>
  ): OutputDeclarationScope {
    return remap?.[scope] ?? scope
  }

  protected resolveCommandSourceScope(cmd: CommandPrompt): OutputDeclarationScope {
    if (cmd.globalOnly === true) return 'global'
    const scope = (cmd.yamlFrontMatter as {scope?: RuleScope} | undefined)?.scope
    return this.remapDeclarationScope(this.normalizeSourceScope(scope), this.commandsConfig.scopeRemap)
  }

  protected resolveSubAgentSourceScope(subAgent: SubAgentPrompt): OutputDeclarationScope {
    const scope = (subAgent.yamlFrontMatter as {scope?: RuleScope} | undefined)?.scope
    return this.remapDeclarationScope(this.normalizeSourceScope(scope), this.subAgentsConfig.scopeRemap)
  }

  protected resolveSkillSourceScope(skill: SkillPrompt): OutputDeclarationScope {
    const scope = (skill.yamlFrontMatter as {scope?: RuleScope} | undefined)?.scope
    return this.remapDeclarationScope(this.normalizeSourceScope(scope), this.skillsConfig.scopeRemap)
  }

  protected selectSingleScopeItems<T>(
    items: readonly T[],
    sourceScopes: readonly OutputDeclarationScope[],
    resolveScope: (item: T) => OutputDeclarationScope,
    requestedScopes?: OutputScopeSelection
  ): {
    readonly selectedScope?: OutputDeclarationScope
    readonly items: readonly T[]
  } {
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

  protected selectRuleScopes(ctx: OutputWriteContext, rules: readonly RulePrompt[]): readonly OutputDeclarationScope[] {
    const availableScopes = [...new Set(rules.map(rule => this.normalizeSourceScope(this.normalizeRuleScope(rule))))]
    return resolveTopicScopes({
      requestedScopes: this.getTopicScopeOverride(ctx, 'rules'),
      defaultScopes: this.rulesConfig.sourceScopes ?? ['project', 'global'],
      supportedScopes: this.rulesConfig.sourceScopes ?? ['project', 'global'],
      singleScope: false,
      availableScopes
    }).filter(scope => availableScopes.includes(scope))
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

  protected getTopicScopeOverride(_ctx: OutputPluginContext | OutputWriteContext, _topic: OutputScopeTopic): OutputScopeSelection | undefined {
    void _ctx
    void _topic
    return void 0
  }

  protected buildSkillFrontMatter(skill: SkillPrompt, options?: SkillFrontMatterOptions): Record<string, unknown> {
    const fm = skill.yamlFrontMatter
    const result: Record<string, unknown> = {
      name: this.getSkillName(skill),
      description: fm.description
    }

    if ('displayName' in fm && fm.displayName != null) {
      // Conditionally add optional fields
      result['displayName'] = fm.displayName
    }
    if ('keywords' in fm && fm.keywords != null && fm.keywords.length > 0) {
      result['keywords'] = fm.keywords
    }
    if ('author' in fm && fm.author != null) result['author'] = fm.author
    if ('version' in fm && fm.version != null) result['version'] = fm.version

    const includeTools = options?.includeTools ?? true // Handle tools based on options
    if (includeTools && 'allowTools' in fm && fm.allowTools != null && fm.allowTools.length > 0) {
      const toolFormat = options?.toolFormat ?? 'array'
      result['allowTools'] = toolFormat === 'string' ? fm.allowTools.join(',') : fm.allowTools
    }

    if (options?.additionalFields != null) {
      // Add any additional custom fields
      Object.assign(result, options.additionalFields)
    }

    return result
  }

  protected buildRuleContent(rule: RulePrompt, ctx?: OutputPluginContext): string {
    const fmData = this.rulesConfig.transformFrontMatter ? this.rulesConfig.transformFrontMatter(rule) : {globs: rule.globs.join(', ')}

    const sanitizedFmData = fmData == null || Object.keys(fmData).length === 0 ? void 0 : fmData

    return this.buildMarkdownContent(rule.content, sanitizedFmData, ctx)
  }

  protected buildRuleFileName(rule: RulePrompt): string {
    const prefix = `${this.rulesConfig.prefix ?? 'rule'}${this.rulesConfig.linkSymbol ?? '-'}`
    const fileName = `${prefix}${rule.prefix}${this.rulesConfig.linkSymbol ?? '-'}${rule.ruleName}${this.rulesConfig.ext ?? '.md'}`
    return fileName
  }

  async declareOutputFiles(ctx: OutputWriteContext): Promise<OutputFileDeclaration[]> {
    return this.buildDefaultOutputDeclarations(ctx)
  }

  async declareCleanupPaths(ctx: OutputCleanContext): Promise<OutputCleanupDeclarations> {
    const cleanupDelete = [...this.buildCleanupTargetsFromScopeConfig(this.cleanupConfig.delete, 'delete', ctx)]
    const cleanupProtect = [...this.buildCleanupTargetsFromScopeConfig(this.cleanupConfig.protect, 'protect', ctx)]
    const {excludeScanGlobs} = this.cleanupConfig

    // Add indexignore files to cleanup targets if this plugin has an indexignore configured
    const ignoreOutputPath = this.getIgnoreOutputPath()
    if (ignoreOutputPath != null) {
      for (const project of this.getProjectOutputProjects(ctx)) {
        // Skip workspace root and prompt source projects
        if (project.isWorkspaceRootProject === true || project.isPromptSourceProject === true) continue
        const projectRootDir = this.resolveProjectRootDir(ctx, project)
        if (projectRootDir == null) continue

        cleanupDelete.push({
          path: path.join(projectRootDir, ignoreOutputPath),
          kind: 'file',
          scope: 'project',
          label: 'delete.indexignore'
        })
      }
    }

    if (cleanupDelete.length === 0 && cleanupProtect.length === 0 && (excludeScanGlobs == null || excludeScanGlobs.length === 0)) {
      return {}
    }

    return {
      ...cleanupDelete.length > 0 && {delete: cleanupDelete},
      ...cleanupProtect.length > 0 && {protect: cleanupProtect},
      ...excludeScanGlobs != null && excludeScanGlobs.length > 0 && {excludeScanGlobs}
    }
  }

  async declareWslMirrorFiles(ctx: OutputWriteContext): Promise<readonly WslMirrorFileDeclaration[]> {
    void ctx
    return this.wslMirrorPaths.map(sourcePath => ({sourcePath}))
  }

  async convertContent(declaration: OutputFileDeclaration, ctx: OutputWriteContext): Promise<string | Buffer> {
    const source = declaration.source as DeclarativeOutputSource

    switch (source.kind) {
      case 'projectRootMemory':
      case 'projectChildMemory':
      case 'globalMemory':
      case 'skillReference':
      case 'ignoreFile':
        return source.content
      case 'command':
        return this.buildCommandContent(source.command, ctx)
      case 'subAgent':
        return this.buildSubAgentContent(source.subAgent, ctx)
      case 'skillMain':
        return this.buildSkillMainContent(source.skill, ctx)
      case 'skillResource':
        return source.encoding === 'base64' ? Buffer.from(source.content, 'base64') : source.content
      case 'rule':
        return this.buildRuleContent(source.rule, ctx)
      default:
        throw new Error(`Unsupported declaration source for plugin ${this.name}`)
    }
  }

  protected async buildDefaultOutputDeclarations(ctx: OutputWriteContext): Promise<OutputFileDeclaration[]> {
    const declarations: OutputFileDeclaration[] = []
    const {globalMemory, commands, subAgents, skills, rules, aiAgentIgnoreConfigFiles} = ctx.collectedOutputContext
    const transformOptions = this.getTransformOptionsFromContext(ctx)
    const ignoreOutputPath = this.getIgnoreOutputPath()
    const ignoreFile = this.indexignore == null ? void 0 : aiAgentIgnoreConfigFiles?.find(file => file.fileName === this.indexignore)
    const selectedCommands
      = this.commandOutputEnabled && commands != null
        ? this.selectSingleScopeItems(
            commands,
            this.commandsConfig.sourceScopes,
            cmd => this.resolveCommandSourceScope(cmd),
            this.getTopicScopeOverride(ctx, 'commands')
          )
        : {items: [] as readonly CommandPrompt[]}

    const selectedSubAgents
      = this.subAgentOutputEnabled && subAgents != null
        ? this.selectSingleScopeItems(
            subAgents,
            this.subAgentsConfig.sourceScopes,
            subAgent => this.resolveSubAgentSourceScope(subAgent),
            this.getTopicScopeOverride(ctx, 'subagents')
          )
        : {items: [] as readonly SubAgentPrompt[]}

    const selectedSkills
      = this.skillOutputEnabled && skills != null
        ? this.selectSingleScopeItems(
            skills,
            this.skillsConfig.sourceScopes,
            skill => this.resolveSkillSourceScope(skill),
            this.getTopicScopeOverride(ctx, 'skills')
          )
        : {items: [] as readonly SkillPrompt[]}

    const allRules = rules ?? []
    const activeRuleScopes = this.ruleOutputEnabled && allRules.length > 0 ? new Set(this.selectRuleScopes(ctx, allRules)) : new Set<OutputDeclarationScope>()
    const activePromptScopes = new Set(this.selectPromptScopes(ctx, this.outputCapabilities.prompt?.scopes ?? ['project', 'global']))

    const rulesByScope: Record<OutputDeclarationScope, RulePrompt[]> = {
      project: [],
      global: []
    }
    for (const rule of allRules) {
      const ruleScope = this.normalizeSourceScope(this.normalizeRuleScope(rule))
      rulesByScope[ruleScope].push(rule)
    }

    for (const project of this.getProjectOutputProjects(ctx)) {
      const projectRootDir = this.resolveProjectRootDir(ctx, project)
      const basePath = this.resolveProjectConfigDir(ctx, project)
      if (projectRootDir == null || basePath == null) continue

      if (this.outputFileName.length > 0 && activePromptScopes.has('project') && this.isProjectPromptOutputTarget(project)) {
        if (project.rootMemoryPrompt != null) {
          declarations.push({
            path: path.join(projectRootDir, this.outputFileName),
            scope: 'project',
            source: {
              kind: 'projectRootMemory',
              content: project.rootMemoryPrompt.content as string
            }
          })
        }

        if (project.childMemoryPrompts != null) {
          for (const child of project.childMemoryPrompts) {
            declarations.push({
              path: this.resolveFullPath(child.dir),
              scope: 'project',
              source: {
                kind: 'projectChildMemory',
                content: child.content as string
              }
            })
          }
        }
      }

      const {projectConfig} = project

      if (selectedCommands.selectedScope === 'project' && selectedCommands.items.length > 0) {
        const filteredCommands = filterByProjectConfig(selectedCommands.items, projectConfig, 'commands')
        this.appendCommandDeclarations(declarations, basePath, 'project', filteredCommands, transformOptions)
      }

      if (selectedSubAgents.selectedScope === 'project' && selectedSubAgents.items.length > 0) {
        const filteredSubAgents = filterByProjectConfig(selectedSubAgents.items, projectConfig, 'subAgents')
        this.appendSubAgentDeclarations(declarations, basePath, 'project', filteredSubAgents)
      }

      if (selectedSkills.selectedScope === 'project' && selectedSkills.items.length > 0) {
        const filteredSkills = filterByProjectConfig(selectedSkills.items, projectConfig, 'skills')
        this.appendSkillDeclarations(declarations, basePath, 'project', filteredSkills)
      }

      if (activeRuleScopes.has('project')) {
        const projectRules = applySubSeriesGlobPrefix(filterByProjectConfig(rulesByScope.project, projectConfig, 'rules'), projectConfig)
        this.appendRuleDeclarations(declarations, basePath, 'project', projectRules)
      }

      if (
        ignoreOutputPath != null
        && ignoreFile != null
        && project.isWorkspaceRootProject !== true
        && project.isPromptSourceProject !== true
        && project.dirFromWorkspacePath != null
      ) {
        declarations.push({
          path: path.join(project.dirFromWorkspacePath.basePath, project.dirFromWorkspacePath.path, ignoreOutputPath),
          scope: 'project',
          source: {kind: 'ignoreFile', content: ignoreFile.content}
        })
      }
    }

    const promptSourceProjectConfig = this.resolvePromptSourceProjectConfig(ctx)

    if (selectedCommands.selectedScope === 'global' && selectedCommands.items.length > 0) {
      const filteredCommands = filterByProjectConfig(selectedCommands.items, promptSourceProjectConfig, 'commands')
      const basePath = this.getGlobalConfigDir()
      this.appendCommandDeclarations(declarations, basePath, 'global', filteredCommands, transformOptions)
    }

    if (selectedSubAgents.selectedScope === 'global' && selectedSubAgents.items.length > 0) {
      const filteredSubAgents = filterByProjectConfig(selectedSubAgents.items, promptSourceProjectConfig, 'subAgents')
      const basePath = this.getGlobalConfigDir()
      this.appendSubAgentDeclarations(declarations, basePath, 'global', filteredSubAgents)
    }

    if (selectedSkills.selectedScope === 'global' && selectedSkills.items.length > 0) {
      const filteredSkills = filterByProjectConfig(selectedSkills.items, promptSourceProjectConfig, 'skills')
      const basePath = this.getGlobalConfigDir()
      this.appendSkillDeclarations(declarations, basePath, 'global', filteredSkills)
    }

    for (const ruleScope of ['global'] as const) {
      if (!activeRuleScopes.has(ruleScope)) continue
      const basePath = this.getGlobalConfigDir()
      const filteredRules = applySubSeriesGlobPrefix(
        filterByProjectConfig(rulesByScope[ruleScope], promptSourceProjectConfig, 'rules'),
        promptSourceProjectConfig
      )
      this.appendRuleDeclarations(declarations, basePath, ruleScope, filteredRules)
    }

    if (globalMemory != null && this.outputFileName.length > 0 && activePromptScopes.has('global')) {
      declarations.push({
        path: path.join(this.getGlobalConfigDir(), this.outputFileName),
        scope: 'global',
        source: {
          kind: 'globalMemory',
          content: globalMemory.content as string
        }
      })
    }

    return declarations
  }

  protected async buildCommandContent(cmd: CommandPrompt, ctx?: OutputPluginContext): Promise<string> {
    let compiledContent = cmd.content
    let compiledFrontMatter = cmd.yamlFrontMatter
    let useRecompiledFrontMatter = false

    if (cmd.rawMdxContent != null && this.toolPreset != null) {
      this.log.debug('recompiling command with tool preset', {
        file: cmd.dir.getAbsolutePath(),
        toolPreset: this.toolPreset,
        hasRawContent: true
      })
      const scopeCollector = new GlobalScopeCollector({
        toolPreset: this.toolPreset
      })
      const globalScope = scopeCollector.collect()
      const result = await compileRawPromptArtifact({
        filePath: cmd.dir.getAbsolutePath(),
        globalScope,
        rawMdx: cmd.rawMdxContent
      })
      compiledContent = result.content
      compiledFrontMatter = result.metadata as typeof cmd.yamlFrontMatter
      useRecompiledFrontMatter = true
    }

    const commandFrontMatterTransformer = this.commandsConfig.transformFrontMatter
    if (commandFrontMatterTransformer == null) {
      throw new Error(`commands.transformFrontMatter is required for command output plugin: ${this.name}`)
    }

    const transformedFrontMatter = commandFrontMatterTransformer(cmd, {
      isRecompiled: useRecompiledFrontMatter,
      ...compiledFrontMatter != null && {
        sourceFrontMatter: compiledFrontMatter as Record<string, unknown>
      }
    })

    return this.buildMarkdownContent(compiledContent, transformedFrontMatter, ctx)
  }

  protected buildSubAgentContent(agent: SubAgentPrompt, ctx?: OutputPluginContext): string {
    const subAgentFrontMatterTransformer = this.subAgentsConfig.transformFrontMatter
    const transformedFrontMatter = subAgentFrontMatterTransformer?.(agent, {
      ...agent.yamlFrontMatter != null && {
        sourceFrontMatter: agent.yamlFrontMatter
      }
    })

    if (this.subAgentsConfig.artifactFormat === 'toml') {
      const sourceFrontMatter = transformedFrontMatter ?? agent.yamlFrontMatter
      return this.buildSubAgentTomlContent(agent, sourceFrontMatter)
    }

    if (transformedFrontMatter != null) {
      return this.buildMarkdownContent(agent.content, transformedFrontMatter, ctx)
    }

    return this.buildMarkdownContentWithRaw(agent.content, agent.yamlFrontMatter, agent.rawFrontMatter, ctx)
  }

  protected buildSkillMainContent(skill: SkillPrompt, ctx?: OutputPluginContext): string {
    return this.buildMarkdownContentWithRaw(skill.content as string, skill.yamlFrontMatter, skill.rawFrontMatter, ctx)
  }
}
