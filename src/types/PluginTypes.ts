import type { Logger } from '@/log'
import type { PluginKind } from '@/types/Enums'
import type { RelativePath } from '@/types/FileSystemTypes'
import type {
  CollectedInputContext,
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
}

export interface PluginContext {
  logger: Logger
  fs: typeof import('node:fs')
  path: typeof import('node:path')
  glob: typeof import('fast-glob')
}

export interface InputPluginContext extends PluginContext {
  readonly userConfigOptions: PluginOptions
}

export interface InputPlugin extends Plugin<PluginKind.Input> {
  /**
   * Collect all inputs from all registered input plugins.
   * This is the main entry point for the collect command.
   */
  collect: (ctx: InputPluginContext) => Partial<CollectedInputContext>
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
 * Hooks that output plugins can register.
 * Each hook is optional - plugins only implement what they need.
 */
export interface OutputPluginHooks {
  /**
   * Register project-level output directories created by this plugin.
   * Called during output collection phase.
   */
  readonly registerProjectOutputDirs?: (ctx: OutputPluginContext) => readonly RelativePath[]

  /**
   * Register project-level output files created by this plugin.
   * Called during output collection phase.
   */
  readonly registerProjectOutputFiles?: (ctx: OutputPluginContext) => readonly RelativePath[]

  /**
   * Register global output directories created by this plugin.
   * Called during output collection phase.
   */
  readonly registerGlobalOutputDirs?: (ctx: OutputPluginContext) => readonly RelativePath[]

  /**
   * Register global output files created by this plugin.
   * Called during output collection phase.
   */
  readonly registerGlobalOutputFiles?: (ctx: OutputPluginContext) => readonly RelativePath[]

  /**
   * Called before cleaning project outputs.
   * Return false to prevent cleanup for this plugin.
   */
  readonly canCleanProject?: (ctx: OutputCleanContext) => boolean

  /**
   * Called before cleaning global outputs.
   * Return false to prevent cleanup for this plugin.
   */
  readonly canCleanGlobal?: (ctx: OutputCleanContext) => boolean

  /**
   * Hook called after cleaning completes.
   * Can be used for post-cleanup tasks.
   */
  readonly onCleanComplete?: (ctx: OutputCleanContext) => void
}

/**
 * Output plugin interface with hook-based architecture.
 * Plugins register hooks to participate in different lifecycle phases.
 */
export interface OutputPlugin extends Plugin<PluginKind.Output> {
  readonly hooks: OutputPluginHooks
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
export function collectAllPluginOutputs(
  plugins: readonly OutputPlugin[],
  ctx: OutputPluginContext,
): CollectedOutputs {
  const projectDirs: RelativePath[] = []
  const projectFiles: RelativePath[] = []
  const globalDirs: RelativePath[] = []
  const globalFiles: RelativePath[] = []

  for (const plugin of plugins) {
    const hooks = plugin.hooks

    if (hooks.registerProjectOutputDirs) {
      projectDirs.push(...hooks.registerProjectOutputDirs(ctx))
    }
    if (hooks.registerProjectOutputFiles) {
      projectFiles.push(...hooks.registerProjectOutputFiles(ctx))
    }
    if (hooks.registerGlobalOutputDirs) {
      globalDirs.push(...hooks.registerGlobalOutputDirs(ctx))
    }
    if (hooks.registerGlobalOutputFiles) {
      globalFiles.push(...hooks.registerGlobalOutputFiles(ctx))
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
export function checkCanClean(
  plugins: readonly OutputPlugin[],
  ctx: OutputCleanContext,
): Map<string, CleanPermission> {
  const result = new Map<string, CleanPermission>()

  for (const plugin of plugins) {
    const hooks = plugin.hooks
    result.set(plugin.name, {
      project: hooks.canCleanProject?.(ctx) ?? true,
      global: hooks.canCleanGlobal?.(ctx) ?? true,
    })
  }

  return result
}

/**
 * Execute post-clean hooks for all plugins.
 */
export function executeOnCleanComplete(
  plugins: readonly OutputPlugin[],
  ctx: OutputCleanContext,
): void {
  for (const plugin of plugins) {
    plugin.hooks.onCleanComplete?.(ctx)
  }
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
