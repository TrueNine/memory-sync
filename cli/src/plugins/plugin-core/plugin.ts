import type {ILogger} from '@truenine/logger'
import type {MdxGlobalScope} from '@truenine/md-compiler/globals'
import type {
  AindexConfig,
  CleanupProtectionOptions,
  CommandSeriesOptions,
  OutputScopeOptions,
  OutputScopeSelection,
  PluginOutputScopeTopics,
  ProtectionMode
} from './ConfigTypes.schema'
import type {PluginKind} from './enums'
import type {
  InputCollectedContext,
  OutputCollectedContext,
  Project
} from './InputTypes'
import {Buffer} from 'node:buffer'

export type FastGlobType = typeof import('fast-glob')

/**
 * Opaque type for ScopeRegistry.
 * Concrete implementation lives in plugin-input-shared.
 */
export interface ScopeRegistryLike {
  resolve: (expression: string) => string
}

export interface Plugin<T extends PluginKind = PluginKind> {
  readonly type: T
  readonly name: string
  readonly log: ILogger
  readonly dependsOn?: readonly string[]
}

export interface PluginContext {
  logger: ILogger
  fs: typeof import('node:fs')
  path: typeof import('node:path')
  glob: FastGlobType
}

export interface InputPluginContext extends PluginContext {
  readonly userConfigOptions: Required<PluginOptions>
  readonly dependencyContext: Partial<InputCollectedContext>

  readonly globalScope?: MdxGlobalScope

  readonly scopeRegistry?: ScopeRegistryLike
}

export interface InputPlugin extends Plugin<PluginKind.Input> {
  collect: (ctx: InputPluginContext) => Partial<InputCollectedContext> | Promise<Partial<InputCollectedContext>>
}

/**
 * Plugin that can enhance projects after all projects are collected.
 * This is useful for plugins that need to add data to projects
 * that were collected by other plugins.
 */
export interface ProjectEnhancerPlugin extends InputPlugin {
  enhanceProjects: (ctx: InputPluginContext, projects: readonly Project[]) => Project[]
}

/**
 * Context for output plugin operations
 */
export interface OutputPluginContext extends PluginContext {
  readonly collectedOutputContext: OutputCollectedContext
  readonly pluginOptions?: PluginOptions
}

/**
 * Context for output cleaning operations
 */
export interface OutputCleanContext extends OutputPluginContext {
  readonly dryRun?: boolean
}

/**
 * Context for output writing operations
 */
export interface OutputWriteContext extends OutputPluginContext {
  readonly dryRun?: boolean

  readonly registeredPluginNames?: readonly string[]
}

/**
 * Result of a single write operation
 */
export interface WriteResult {
  readonly path: string
  readonly success: boolean
  readonly skipped?: boolean
  readonly error?: Error
}

/**
 * Collected results from write operations
 */
export interface WriteResults {
  readonly files: readonly WriteResult[]
  readonly dirs: readonly WriteResult[]
}

/**
 * Awaitable type for sync/async flexibility
 */
export type Awaitable<T> = T | Promise<T>

/**
 * Result of executing an input effect.
 * Used for preprocessing/cleaning input sources before collection.
 */
export interface InputEffectResult {
  /** Whether the effect executed successfully */
  readonly success: boolean
  /** Error details if the effect failed */
  readonly error?: Error
  /** Description of what the effect did (for logging) */
  readonly description?: string
  /** Files that were modified/created */
  readonly modifiedFiles?: readonly string[]
  /** Files that were deleted */
  readonly deletedFiles?: readonly string[]
}

/**
 * Context provided to input effect handlers.
 * Contains utilities and configuration for effect execution.
 */
export interface InputEffectContext {
  /** Logger instance */
  readonly logger: ILogger
  /** File system module */
  readonly fs: typeof import('node:fs')
  /** Path module */
  readonly path: typeof import('node:path')
  /** Glob module for file matching */
  readonly glob: FastGlobType
  /** Child process spawn function */
  readonly spawn: typeof import('node:child_process').spawn
  /** User configuration options */
  readonly userConfigOptions: Required<PluginOptions>
  /** Resolved workspace directory */
  readonly workspaceDir: string
  /** Resolved aindex directory */
  readonly aindexDir: string
  /** Whether running in dry-run mode */
  readonly dryRun?: boolean
}

/**
 * Handler function for input effects.
 * Receives the effect context and returns an effect result.
 */
export type InputEffectHandler = (ctx: InputEffectContext) => Awaitable<InputEffectResult>

/**
 * Registration entry for an input effect.
 */
export interface InputEffectRegistration {
  /** Descriptive name for logging */
  readonly name: string
  /** The effect handler function */
  readonly handler: InputEffectHandler
  /** Priority for execution order (lower = earlier, default: 0) */
  readonly priority?: number
}

/**
 * Result of resolving base paths from plugin options.
 */
export interface ResolvedBasePaths {
  /** The resolved workspace directory path */
  readonly workspaceDir: string
  /** The resolved aindex directory path */
  readonly aindexDir: string
}

/**
 * Represents a registered scope entry from a plugin.
 */
export interface PluginScopeRegistration {
  /** The namespace name (e.g., 'myPlugin') */
  readonly namespace: string
  /** Key-value pairs registered under this namespace */
  readonly values: Record<string, unknown>
}

/**
 * Output plugin interface.
 * Declarative write model only:
 * - Plugins declare target files
 * - Plugins convert source metadata to content
 * - Core runtime performs all file system operations
 */
export interface OutputPlugin extends Plugin<PluginKind.Output> {
  readonly declarativeOutput: true
  readonly outputCapabilities: OutputPluginCapabilities

  declareOutputFiles: (ctx: OutputWriteContext) => Awaitable<readonly OutputFileDeclaration[]>

  convertContent: (declaration: OutputFileDeclaration, ctx: OutputWriteContext) => Awaitable<string | Buffer>

  declareCleanupPaths?: (ctx: OutputCleanContext) => Awaitable<OutputCleanupDeclarations>
}

/**
 * Scope of a declared output file target.
 */
export type OutputDeclarationScope = 'project' | 'workspace' | 'global'

/**
 * Supported output scope override topics.
 */
export const OUTPUT_SCOPE_TOPICS = ['prompt', 'rules', 'commands', 'subagents', 'skills', 'mcp'] as const

/**
 * Topic key for output scope override and capability declarations.
 */
export type OutputScopeTopic = (typeof OUTPUT_SCOPE_TOPICS)[number]

/**
 * Capability declaration for one output topic.
 * - scopes: allowed source scopes for selection/override
 * - singleScope: whether the topic resolves to a single scope by priority
 */
export interface OutputTopicCapability {
  readonly scopes: readonly OutputDeclarationScope[]
  readonly singleScope: boolean
}

/**
 * Per-plugin capability matrix for output topics.
 */
export type OutputPluginCapabilities = Partial<Record<OutputScopeTopic, OutputTopicCapability>>

/**
 * Declarative output file declaration.
 * Output plugins only declare target paths and source metadata.
 * Core runtime performs all file system write operations.
 */
export interface OutputFileDeclaration {
  /** Absolute target file path */
  readonly path: string
  /** Target scope classification for cleanup/routing */
  readonly scope?: OutputDeclarationScope
  /** Plugin-defined source descriptor for content conversion */
  readonly source: unknown
  /** Optional label for logging */
  readonly label?: string
}

/**
 * Scope of declarative cleanup targets.
 */
export type OutputCleanupScope = OutputDeclarationScope | 'xdgConfig'

/**
 * Kind of cleanup target.
 */
export type OutputCleanupTargetKind = 'file' | 'directory' | 'glob'

/**
 * Declarative cleanup target.
 */
export interface OutputCleanupPathDeclaration {
  /** Absolute path or glob pattern */
  readonly path: string
  /** Target kind */
  readonly kind: OutputCleanupTargetKind
  /** Protection mode to apply when used in protect declarations */
  readonly protectionMode?: ProtectionMode
  /** Optional scope label for logging/trace */
  readonly scope?: OutputCleanupScope
  /** Optional label for diagnostics */
  readonly label?: string
}

/**
 * Optional cleanup declaration set for one output plugin.
 */
export interface OutputCleanupDeclarations {
  /** Paths/patterns that should be cleaned */
  readonly delete?: readonly OutputCleanupPathDeclaration[]
  /** Paths/patterns that must be protected from cleanup */
  readonly protect?: readonly OutputCleanupPathDeclaration[]
  /** Glob ignore patterns when expanding delete/protect globs */
  readonly excludeScanGlobs?: readonly string[]
}

function isNodeBufferLike(value: unknown): value is Buffer {
  return Buffer.isBuffer(value)
}

function normalizeScopeSelection(selection: OutputScopeSelection): readonly OutputDeclarationScope[] {
  if (typeof selection === 'string') return [selection]

  const unique: OutputDeclarationScope[] = []
  for (const scope of selection) {
    if (!unique.includes(scope)) unique.push(scope)
  }
  return unique
}

function getPluginScopeOverrides(
  pluginName: string,
  pluginOptions?: PluginOptions
): PluginOutputScopeTopics | undefined {
  return pluginOptions?.outputScopes?.plugins?.[pluginName]
}

export function validateOutputPluginCapabilities(plugin: OutputPlugin): void {
  for (const topic of OUTPUT_SCOPE_TOPICS) {
    const capability = plugin.outputCapabilities[topic]
    if (capability == null) continue
    if (capability.scopes.length === 0) throw new Error(`Plugin ${plugin.name} declares empty scopes for topic "${topic}"`)
  }
}

export function validateOutputScopeOverridesForPlugin(
  plugin: OutputPlugin,
  pluginOptions?: PluginOptions
): void {
  const overrides = getPluginScopeOverrides(plugin.name, pluginOptions)
  if (overrides == null) return

  for (const topic of OUTPUT_SCOPE_TOPICS) {
    const requestedSelection = overrides[topic]
    if (requestedSelection == null) continue

    const capability = plugin.outputCapabilities[topic]
    if (capability == null) {
      throw new Error(
        `Invalid outputScopes configuration: outputScopes.plugins.${plugin.name}.${topic} is set, but plugin ${plugin.name} does not support topic "${topic}".`
      )
    }

    const requestedScopes = normalizeScopeSelection(requestedSelection)
    if (capability.singleScope && requestedScopes.length > 1) {
      const requested = requestedScopes.join(', ')
      throw new Error(
        `Invalid outputScopes configuration: outputScopes.plugins.${plugin.name}.${topic} is single-scope and cannot request multiple scopes [${requested}].`
      )
    }

    const allowedScopes = new Set(capability.scopes)
    const unsupportedScopes = requestedScopes.filter(scope => !allowedScopes.has(scope))

    if (unsupportedScopes.length > 0) {
      const allowed = capability.scopes.join(', ')
      const requested = unsupportedScopes.join(', ')
      throw new Error(
        `Invalid outputScopes configuration: outputScopes.plugins.${plugin.name}.${topic} requests unsupported scopes [${requested}]. Allowed scopes: [${allowed}].`
      )
    }
  }
}

export function validateOutputScopeOverridesForPlugins(
  plugins: readonly OutputPlugin[],
  pluginOptions?: PluginOptions
): void {
  for (const plugin of plugins) {
    validateOutputPluginCapabilities(plugin)
    validateOutputScopeOverridesForPlugin(plugin, pluginOptions)
  }
}

/**
 * Execute declarative write operations for output plugins.
 * Core runtime owns file system writes; plugins only declare and convert content.
 */
export async function executeDeclarativeWriteOutputs(
  plugins: readonly OutputPlugin[],
  ctx: OutputWriteContext
): Promise<Map<string, WriteResults>> {
  const results = new Map<string, WriteResults>()

  validateOutputScopeOverridesForPlugins(plugins, ctx.pluginOptions)

  for (const plugin of plugins) {
    const declarations = await plugin.declareOutputFiles(ctx)
    const fileResults: WriteResult[] = []

    for (const declaration of declarations) {
      if (ctx.dryRun === true) {
        fileResults.push({path: declaration.path, success: true, skipped: false})
        continue
      }

      try {
        const content = await plugin.convertContent(declaration, ctx)
        const parentDir = ctx.path.dirname(declaration.path)
        ctx.fs.mkdirSync(parentDir, {recursive: true})
        if (isNodeBufferLike(content)) ctx.fs.writeFileSync(declaration.path, content)
        else ctx.fs.writeFileSync(declaration.path, content, 'utf8')
        fileResults.push({path: declaration.path, success: true})
      }
      catch (error) {
        fileResults.push({path: declaration.path, success: false, error: error as Error})
      }
    }

    const pluginResult: WriteResults = {files: fileResults, dirs: []}
    results.set(plugin.name, pluginResult)
  }

  return results
}

/**
 * Collected outputs from all plugins.
 * Used by the clean command to gather all artifacts for cleanup.
 */
export interface CollectedOutputs {
  readonly projectDirs: readonly string[]
  readonly projectFiles: readonly string[]
  readonly workspaceDirs: readonly string[]
  readonly workspaceFiles: readonly string[]
  readonly globalDirs: readonly string[]
  readonly globalFiles: readonly string[]
}

/**
 * Collect all outputs from all registered output plugins.
 * This is the main entry point for the clean command.
 */
export async function collectAllPluginOutputs(
  plugins: readonly OutputPlugin[],
  ctx: OutputPluginContext
): Promise<CollectedOutputs> {
  const projectDirs: string[] = []
  const projectFiles: string[] = []
  const workspaceDirs: string[] = []
  const workspaceFiles: string[] = []
  const globalDirs: string[] = []
  const globalFiles: string[] = []

  validateOutputScopeOverridesForPlugins(plugins, ctx.pluginOptions)

  for (const plugin of plugins) {
    const declarations = await plugin.declareOutputFiles({...ctx, dryRun: true})
    for (const declaration of declarations) {
      if (declaration.scope === 'global') globalFiles.push(declaration.path)
      else if (declaration.scope === 'workspace') workspaceFiles.push(declaration.path)
      else projectFiles.push(declaration.path)
    }
  }

  return {
    projectDirs,
    projectFiles,
    workspaceDirs,
    workspaceFiles,
    globalDirs,
    globalFiles
  }
}

/**
 * Configuration to be processed by plugin.config.ts
 * Interpreted by plugin system as collection context
 * Path placeholder `~` resolves to the user home directory.
 *
 * @see InputCollectedContext - Input-side collected context
 * @see OutputCollectedContext - Output-side collected context
 */
export interface PluginOptions {
  readonly version?: string

  readonly workspaceDir?: string

  readonly aindex?: AindexConfig

  readonly commandSeriesOptions?: CommandSeriesOptions

  readonly outputScopes?: OutputScopeOptions

  readonly cleanupProtection?: CleanupProtectionOptions

  plugins?: Plugin[]
  logLevel?: 'trace' | 'debug' | 'info' | 'warn' | 'error'
}
