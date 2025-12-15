import type { Logger } from '@/log'
import type { PluginKind } from '@/types/Enums'
import type { RelativePath } from '@/types/FileSystemTypes'
import type {
  CollectedInputContext,
  Project,
} from '@/types/InputTypes'

export interface Plugin<T extends PluginKind = PluginKind> {
  readonly type: T
  /**
   * Plugin name (also serves as plugin id)
   */
  readonly name: string
  /**
   * Logger for the plugin
   */
  readonly log: Logger
  /**
   * Plugin names this plugin depends on.
   * Dependencies will be executed before this plugin.
   */
  readonly dependsOn?: readonly string[]
}

export interface PluginContext {
  logger: Logger
  fs: typeof import('node:fs')
  path: typeof import('node:path')
  glob: typeof import('fast-glob')
}

export interface InputPluginContext extends PluginContext {
  readonly userConfigOptions: PluginOptions
  /**
   * Accumulated context from all executed dependencies.
   * Contains merged outputs from plugins that this plugin depends on.
   */
  readonly dependencyContext: Partial<CollectedInputContext>
}

export interface InputPlugin extends Plugin<PluginKind.Input> {
  /**
   * Collect all inputs from all registered input plugins.
   * This is the main entry point for the collect command.
   */
  collect: (ctx: InputPluginContext) => Partial<CollectedInputContext>
}

/**
 * Plugin that can enhance projects after all projects are collected.
 * This is useful for plugins that need to add data to projects
 * that were collected by other plugins.
 */
export interface ProjectEnhancerPlugin extends InputPlugin {
  /**
   * Enhance projects with additional data.
   * Called after all projects are collected from all input plugins.
   */
  enhanceProjects: (ctx: InputPluginContext, projects: readonly Project[]) => Project[]
}

/**
 * Context for output plugin operations
 */
export interface OutputPluginContext extends PluginContext {
  readonly collectedInputContext: CollectedInputContext
}

/**
 * Context for output cleaning operations
 */
export interface OutputCleanContext extends OutputPluginContext {
  /**
   * Whether running in dry-run mode (no actual deletion)
   */
  readonly dryRun?: boolean
}

/**
 * Context for output writing operations
 */
export interface OutputWriteContext extends OutputPluginContext {
  /**
   * Whether running in dry-run mode (no actual file writes)
   */
  readonly dryRun?: boolean
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
 * Output plugin interface.
 * Plugins directly implement lifecycle hooks as methods.
 * All hooks support both sync and async implementations.
 */
export interface OutputPlugin extends Plugin<PluginKind.Output> {
  /**
   * Register project-level output directories created by this plugin.
   * Called during output collection phase.
   */
  registerProjectOutputDirs?: (ctx: OutputPluginContext) => Awaitable<readonly RelativePath[]>

  /**
   * Register project-level output files created by this plugin.
   * Called during output collection phase.
   */
  registerProjectOutputFiles?: (ctx: OutputPluginContext) => Awaitable<readonly RelativePath[]>

  /**
   * Register global output directories created by this plugin.
   * Called during output collection phase.
   */
  registerGlobalOutputDirs?: (ctx: OutputPluginContext) => Awaitable<readonly RelativePath[]>

  /**
   * Register global output files created by this plugin.
   * Called during output collection phase.
   */
  registerGlobalOutputFiles?: (ctx: OutputPluginContext) => Awaitable<readonly RelativePath[]>

  /**
   * Called before cleaning project outputs.
   * Return false to prevent cleanup for this plugin.
   */
  canCleanProject?: (ctx: OutputCleanContext) => Awaitable<boolean>

  /**
   * Called before cleaning global outputs.
   * Return false to prevent cleanup for this plugin.
   */
  canCleanGlobal?: (ctx: OutputCleanContext) => Awaitable<boolean>

  /**
   * Hook called after cleaning completes.
   * Can be used for post-cleanup tasks.
   */
  onCleanComplete?: (ctx: OutputCleanContext) => Awaitable<void>

  /**
   * Called before writing outputs.
   * Return false to skip writing for this plugin.
   */
  canWrite?: (ctx: OutputWriteContext) => Awaitable<boolean>

  /**
   * Write project-level outputs.
   * In dry-run mode, should only collect what would be written without actual I/O.
   */
  writeProjectOutputs?: (ctx: OutputWriteContext) => Awaitable<WriteResults>

  /**
   * Write global-level outputs.
   * In dry-run mode, should only collect what would be written without actual I/O.
   */
  writeGlobalOutputs?: (ctx: OutputWriteContext) => Awaitable<WriteResults>

  /**
   * Hook called after writing completes.
   * Can be used for post-write tasks like validation.
   */
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
  ctx: OutputPluginContext,
): Promise<CollectedOutputs> {
  const projectDirs: RelativePath[] = []
  const projectFiles: RelativePath[] = []
  const globalDirs: RelativePath[] = []
  const globalFiles: RelativePath[] = []

  for (const plugin of plugins) {
    if (plugin.registerProjectOutputDirs) {
      projectDirs.push(...await plugin.registerProjectOutputDirs(ctx))
    }
    if (plugin.registerProjectOutputFiles) {
      projectFiles.push(...await plugin.registerProjectOutputFiles(ctx))
    }
    if (plugin.registerGlobalOutputDirs) {
      globalDirs.push(...await plugin.registerGlobalOutputDirs(ctx))
    }
    if (plugin.registerGlobalOutputFiles) {
      globalFiles.push(...await plugin.registerGlobalOutputFiles(ctx))
    }
  }

  return {
    projectDirs,
    projectFiles,
    globalDirs,
    globalFiles,
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
  ctx: OutputCleanContext,
): Promise<Map<string, CleanPermission>> {
  const result = new Map<string, CleanPermission>()

  for (const plugin of plugins) {
    result.set(plugin.name, {
      project: (await plugin.canCleanProject?.(ctx)) ?? true,
      global: (await plugin.canCleanGlobal?.(ctx)) ?? true,
    })
  }

  return result
}

/**
 * Execute post-clean hooks for all plugins.
 */
export async function executeOnCleanComplete(
  plugins: readonly OutputPlugin[],
  ctx: OutputCleanContext,
): Promise<void> {
  for (const plugin of plugins) {
    await plugin.onCleanComplete?.(ctx)
  }
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
  ctx: OutputWriteContext,
): Promise<Map<string, WritePermission>> {
  const result = new Map<string, WritePermission>()

  for (const plugin of plugins) {
    const canWrite = (await plugin.canWrite?.(ctx)) ?? true
    result.set(plugin.name, {
      project: canWrite,
      global: canWrite,
    })
  }

  return result
}

/**
 * Execute write operations for all plugins.
 * Respects dry-run mode in context.
 */
export async function executeWriteOutputs(
  plugins: readonly OutputPlugin[],
  ctx: OutputWriteContext,
): Promise<Map<string, WriteResults>> {
  const results = new Map<string, WriteResults>()

  for (const plugin of plugins) {
    const projectResults = await plugin.writeProjectOutputs?.(ctx) ?? { files: [], dirs: [] }
    const globalResults = await plugin.writeGlobalOutputs?.(ctx) ?? { files: [], dirs: [] }

    const merged: WriteResults = {
      files: [...projectResults.files, ...globalResults.files],
      dirs: [...projectResults.dirs, ...globalResults.dirs],
    }

    results.set(plugin.name, merged)
    await plugin.onWriteComplete?.(ctx, merged)
  }

  return results
}

/**
 * plugin.config.ts 需要处理的配置
 * 由插件系统解读为收集上下文
 * 插件路径自动解析以下展位符为特殊符号
 * - `$WORKSPACE`: 工作目录
 * - `$SHADOW_PROJECT`: 抽取源提示词工作目录（它是一个特殊的 project，方便存放于 git，单独进行管理提示词）
 * - `~`: 用户主目录
 *
 * @see CollectedInputContext - 被收集的上下文
 * @see PathPlaceholders - 路径占位符
 */
export interface PluginOptions {
  /**
   * 插件自动扫描其 directChildrenDirectory 为 project
   * @default ~/project
   */
  readonly workspaceDir?: string

  /**
   * @default $WORKSPACE/aindex
   */
  readonly shadowProjectDir?: string

  /**
   * @default $SHADOW_PROJECT/dist/skills
   */
  readonly shadowSkillSourceDir?: string

  /**
   * @default $SHADOW_PROJECT/dist/commands
   */
  readonly shadowFastCommandDir?: string

  /**
   * @default $SHADOW_PROJECT/dist/agents
   */
  readonly shadowSubAgentDir?: string

  /**
   * @default $SHADOW_PROJECT/dist/GLOBAL.md
   */
  readonly globalMemoryFile?: string

  /**
   * 插件自动扫描其 directChildrenDirectory 为 shadow project，
   * 只有同时识别为
   * @default $SHADOW_PROJECT/ref
   */
  readonly shadowSourceProjectDir?: string

  /**
   * 一些用户定义的脱离 workspace 的项目，
   * 如果 shadow project 和 任何 project 重叠，则会：
   * - 保留 shadow project
   * - 剔除 同名的 project
   */
  readonly externalProjects?: readonly string[]

  /**
   * 不被处理的文件
   * projectName and excludePatterns
   */
  readonly excludePatterns?: Record<string, string[]>
  plugins?: Plugin[]
  logLevel?: 'trace' | 'debug' | 'info' | 'warn' | 'error'
}
