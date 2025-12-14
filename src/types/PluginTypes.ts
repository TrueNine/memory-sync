import type { PluginKind } from '@/types/Enums'
import type {
  CollectedInputContext,
} from '@/types/InputTypes'

export interface Plugin<T extends PluginKind = PluginKind> {
  readonly type: T
  /**
   * 插件名称（亦是插件id）
   */
  readonly name: string
}

export interface OutputPlugin extends Plugin<PluginKind.Output> {
}

export interface InputPluginContext extends CollectedInputContext {
  resolvePlaceholderPath: (path: string) => string
}

export interface InputPlugin extends Plugin<PluginKind.Input> {
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
