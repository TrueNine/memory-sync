import type {
  CodingAgentTools,
  FilePathKind,
  GlobalMemoryPrompt,
  IDEKind,
  PromptKind,
} from '@/types'
import type { FileContent, Path, RelativePath } from '@/types/FileSystemTypes'
import type {
  FastCommandYAMLFrontMatter,
  ProjectChildrenMemoryPrompt,
  ProjectRootMemoryPrompt,
  Prompt,
  SubAgentYAMLFrontMatter,
  YAMLFrontMatter,
} from '@/types/PromptTypes'

export interface Project {
  readonly name?: string
  /**
   * 相较于 workspace 的工作目录
   */
  readonly dirFromWorkspacePath?: RelativePath
  /**
   * 工作于当前项目根部的记忆提示词
   */
  readonly rootMemoryPrompt?: ProjectRootMemoryPrompt
  /**
   * 工作于当前项目子目录的记忆提示词
   */
  readonly childMemoryPrompts?: readonly ProjectChildrenMemoryPrompt[]
  /**
   * Indicates whether this project's configuration originates from the shadow source directory (e.g., aindex/ref/).
   *
   * When true:
   * - The project configuration was discovered from the shadow source directory
   * - `dirFromWorkspacePath` still points to the actual workspace project directory (output target)
   * - Certain output plugins (e.g., AIAgentIgnoreConfigFileOutputPlugin) should skip this project
   *   to avoid overwriting source files in the shadow project
   *
   * When false or undefined:
   * - The project is a regular workspace project or external project
   * - All output plugins should process this project normally
   *
   * Note: This flag does NOT mean the output should go to the shadow source directory.
   * The output target is always determined by `dirFromWorkspacePath`.
   */
  readonly isPromptSourceProject?: boolean
}

export interface Workspace {
  readonly directory: Path
  readonly projects: Project[]
}

/**
 * IDE 配置文件
 */
export interface ProjectIDEConfigFile<I extends IDEKind = IDEKind.Original> extends FileContent<string, FilePathKind, Path> {
  readonly type: I
}

/**
 * AI Agent ignore configuration file
 */
export interface AIAgentIgnoreConfigFile {
  readonly fileName: string
  readonly content: string
}

/**
 * 所有收集到的输出信息，提供给插件系统，作为输出插件的输入
 */
export interface CollectedInputContext {
  readonly workspace: Workspace
  readonly externalProjects?: readonly Project[]
  readonly ideConfigFiles: readonly ProjectIDEConfigFile<IDEKind>[]
  readonly fastCommands?: readonly FastCommandPrompt[]
  readonly subAgents?: readonly SubAgentPrompt[]
  readonly skills?: readonly SkillPrompt[]
  readonly globalMemory?: GlobalMemoryPrompt
  readonly aiAgentIgnoreConfigFiles?: readonly AIAgentIgnoreConfigFile[]
  /**
   * Shadow project directory absolute path
   * Used to identify and skip shadow project during cleanup
   */
  readonly shadowProjectDir?: string
}

/**
 * 快捷命令提示词
 */
export interface FastCommandPrompt extends Prompt<PromptKind.FastCommand, FastCommandYAMLFrontMatter> {
  readonly type: PromptKind.FastCommand
  readonly globalOnly?: true
  /**
   * Series prefix extracted from filename (e.g., 'pe' from 'pe_compile.md')
   * Undefined if filename has no underscore prefix
   */
  readonly series?: string
  /**
   * Command name without series prefix (e.g., 'compile' from 'pe_compile.md')
   */
  readonly commandName: string
}

/**
 * 子代理提示词
 */
export interface SubAgentPrompt extends Prompt<PromptKind.SubAgent, SubAgentYAMLFrontMatter> {
  readonly type: PromptKind.SubAgent
}

/**
 * skill 包含的其他文件
 */
export interface SkillReferenceDocument extends Prompt<PromptKind.SkillReferenceDocument> {
  readonly type: PromptKind.SkillReferenceDocument
  readonly dir: RelativePath
  readonly referenceDocuments?: SkillReferenceDocument[]
}

export interface SkillYAMLFrontMatter extends YAMLFrontMatter {
  readonly name: string
  readonly description: string
  readonly allowTools?: (CodingAgentTools | string)[]
  /**
   * Keywords for skill discovery and matching
   * Used by Kiro Powers for keyword-based activation
   */
  readonly keywords?: readonly string[]
  /**
   * Display name for the skill
   * If not set, defaults to `name`
   */
  readonly displayName?: string
  /**
   * Author of the skill
   */
  readonly author?: string
}

/**
 * skill 主文件（SKILL.md）
 * skill name 从 front matter 当中进行获取
 */
export interface SkillPrompt extends Prompt<PromptKind.Skill, SkillYAMLFrontMatter> {
  readonly type: PromptKind.Skill
  /**
   * skill 是需要一个目录来表示是一组 skill
   */
  readonly dir: RelativePath
  readonly referenceDocuments?: SkillReferenceDocument[]
  readonly yamlFrontMatter: SkillYAMLFrontMatter
}
