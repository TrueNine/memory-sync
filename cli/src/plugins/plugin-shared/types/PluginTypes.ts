import type {ILogger} from '@truenine/logger'
import type {MdxGlobalScope} from '@truenine/md-compiler/globals'
import type {AindexConfig, CommandSeriesOptions} from './ConfigTypes.schema'
import type {PluginKind} from './Enums'
import type {RelativePath} from './FileSystemTypes'
import type {
  CollectedInputContext,
  Project
} from './InputTypes'

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
  readonly dependencyContext: Partial<CollectedInputContext>

  readonly globalScope?: MdxGlobalScope

  readonly scopeRegistry?: ScopeRegistryLike
}

export interface InputPlugin extends Plugin<PluginKind.Input> {
  collect: (ctx: InputPluginContext) => Partial<CollectedInputContext> | Promise<Partial<CollectedInputContext>>
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
  readonly collectedInputContext: CollectedInputContext
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
  readonly path: RelativePath
  readonly success: boolean
  readonly skipped?: boolean
  readonly error?: Error
}

/**
 * Result of executing a side effect.
 * Used for both write and clean effects.
 */
export interface EffectResult {
  /** Whether the effect executed successfully */
  readonly success: boolean
  /** Error details if the effect failed */
  readonly error?: Error
  /** Description of what the effect did (for logging) */
  readonly description?: string
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
 * Handler function for write effects.
 * Receives the write context and returns an effect result.
 */
export type WriteEffectHandler = (ctx: OutputWriteContext) => Awaitable<EffectResult>

/**
 * Handler function for clean effects.
 * Receives the clean context and returns an effect result.
 */
export type CleanEffectHandler = (ctx: OutputCleanContext) => Awaitable<EffectResult>

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
  readonly userConfigOptions: PluginOptions
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
 * Registration entry for an effect.
 */
export interface EffectRegistration<THandler> {
  /** Descriptive name for logging */
  readonly name: string
  /** The effect handler function */
  readonly handler: THandler
}

/**
 * Output plugin interface.
 * Plugins directly implement lifecycle hooks as methods.
 * All hooks support both sync and async implementations.
 */
export interface OutputPlugin extends Plugin<PluginKind.Output> {
  registerProjectOutputDirs?: (ctx: OutputPluginContext) => Awaitable<readonly RelativePath[]>

  registerProjectOutputFiles?: (ctx: OutputPluginContext) => Awaitable<readonly RelativePath[]>

  registerGlobalOutputDirs?: (ctx: OutputPluginContext) => Awaitable<readonly RelativePath[]>

  registerGlobalOutputFiles?: (ctx: OutputPluginContext) => Awaitable<readonly RelativePath[]>

  canCleanProject?: (ctx: OutputCleanContext) => Awaitable<boolean>

  canCleanGlobal?: (ctx: OutputCleanContext) => Awaitable<boolean>

  onCleanComplete?: (ctx: OutputCleanContext) => Awaitable<void>

  canWrite?: (ctx: OutputWriteContext) => Awaitable<boolean>

  writeProjectOutputs?: (ctx: OutputWriteContext) => Awaitable<WriteResults>

  writeGlobalOutputs?: (ctx: OutputWriteContext) => Awaitable<WriteResults>

  onWriteComplete?: (ctx: OutputWriteContext, results: WriteResults) => Awaitable<void>
}

/**
 * Collected outputs from all plugins.
 * Used by the clean command to gather all artifacts for cleanup.
 */
export interface CollectedOutputs {
  readonly projectDirs: readonly RelativePath[]
  readonly projectFiles: readonly RelativePath[]
  readonly globalDirs: readonly RelativePath[]
  readonly globalFiles: readonly RelativePath[]
}

/**
 * Collect all outputs from all registered output plugins.
 * This is the main entry point for the clean command.
 */
export async function collectAllPluginOutputs(
  plugins: readonly OutputPlugin[],
  ctx: OutputPluginContext
): Promise<CollectedOutputs> {
  const projectDirs: RelativePath[] = []
  const projectFiles: RelativePath[] = []
  const globalDirs: RelativePath[] = []
  const globalFiles: RelativePath[] = []

  for (const plugin of plugins) {
    if (plugin.registerProjectOutputDirs) projectDirs.push(...await plugin.registerProjectOutputDirs(ctx))
    if (plugin.registerProjectOutputFiles) projectFiles.push(...await plugin.registerProjectOutputFiles(ctx))
    if (plugin.registerGlobalOutputDirs) globalDirs.push(...await plugin.registerGlobalOutputDirs(ctx))
    if (plugin.registerGlobalOutputFiles) globalFiles.push(...await plugin.registerGlobalOutputFiles(ctx))
  }

  return {
    projectDirs,
    projectFiles,
    globalDirs,
    globalFiles
  }
}

/**
 * Result of checking if a plugin allows cleaning.
 */
export interface CleanPermission {
  readonly project: boolean
  readonly global: boolean
}

/**
 * Check if all plugins allow cleaning.
 * Returns a map of plugin name to whether cleaning is allowed.
 */
export async function checkCanClean(
  plugins: readonly OutputPlugin[],
  ctx: OutputCleanContext
): Promise<Map<string, CleanPermission>> {
  const result = new Map<string, CleanPermission>()

  for (const plugin of plugins) {
    result.set(plugin.name, {project: await plugin.canCleanProject?.(ctx) ?? true, global: await plugin.canCleanGlobal?.(ctx) ?? true})
  }

  return result
}

/**
 * Execute post-clean hooks for all plugins.
 */
export async function executeOnCleanComplete(
  plugins: readonly OutputPlugin[],
  ctx: OutputCleanContext
): Promise<void> {
  for (const plugin of plugins) await plugin.onCleanComplete?.(ctx)
}

/**
 * Result of checking if a plugin allows writing.
 */
export interface WritePermission {
  readonly project: boolean
  readonly global: boolean
}

/**
 * Check if all plugins allow writing.
 * Returns a map of plugin name to whether writing is allowed.
 */
export async function checkCanWrite(
  plugins: readonly OutputPlugin[],
  ctx: OutputWriteContext
): Promise<Map<string, WritePermission>> {
  const result = new Map<string, WritePermission>()

  for (const plugin of plugins) {
    const canWrite = await plugin.canWrite?.(ctx) ?? true
    result.set(plugin.name, {project: canWrite, global: canWrite})
  }

  return result
}

/**
 * Execute write operations for all plugins.
 * Respects dry-run mode in context.
 */
export async function executeWriteOutputs(
  plugins: readonly OutputPlugin[],
  ctx: OutputWriteContext
): Promise<Map<string, WriteResults>> {
  const results = new Map<string, WriteResults>()

  for (const plugin of plugins) {
    const projectResults = await plugin.writeProjectOutputs?.(ctx) ?? {files: [], dirs: []}
    const globalResults = await plugin.writeGlobalOutputs?.(ctx) ?? {files: [], dirs: []}

    const merged: WriteResults = {
      files: [...projectResults.files, ...globalResults.files],
      dirs: [...projectResults.dirs, ...globalResults.dirs]
    }

    results.set(plugin.name, merged)
    await plugin.onWriteComplete?.(ctx, merged)
  }

  return results
}

/**
 * Configuration to be processed by plugin.config.ts
 * Interpreted by plugin system as collection context
 * Path placeholder `~` resolves to the user home directory.
 *
 * @see CollectedInputContext - Collected context
 */
export interface PluginOptions {
  readonly version?: string

  readonly workspaceDir?: string

  readonly aindex?: AindexConfig

  readonly commandSeriesOptions?: CommandSeriesOptions

  plugins?: Plugin[]
  logLevel?: 'trace' | 'debug' | 'info' | 'warn' | 'error'
}
