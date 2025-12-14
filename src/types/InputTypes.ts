import type { Root, RootContent } from 'mdast'
import type {
  ClaudeCodeCLISubAgentColors,
  CodingAgentTools,
  FilePathKind,
  GlobalConfigDirectoryType,
  IDEKind,
  NamingCaseKind,
  PromptKind,
} from '@/types'
import type { AbsolutePath, EmptyPath, FileContent, Path, RelativePath } from '@/types/FileSystemTypes'

export interface YAMLFrontMatter<N extends NamingCaseKind = NamingCaseKind.KebabCase> extends Record<string, unknown> {
  readonly namingCase: N
}

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
}

export interface Workspace {
  readonly directory: Path
  readonly projects: Project[]
}

/**
 * IDE 配置文件
 */
export interface ProjectIDEConfigFile<I extends IDEKind = IDEKind.Original> extends FileContent<string> {
  readonly type: I
}

/**
 * 所有收集到的输出信息，提供给插件系统，作为输出插件的输入
 */
export interface CollectedInputContext {
  readonly workspace: Workspace
  readonly externalProjects?: readonly Project[]
  readonly ideConfigFiles: readonly ProjectIDEConfigFile[]
  readonly fastCommands?: readonly FastCommandPrompt[]
  readonly subAgents?: readonly SubAgentPrompt[]
  readonly skills?: readonly SkillPrompt[]
  readonly globalMemory?: GlobalMemoryPrompt
}

/**
 * 基于 user_home 根目录的全局配置
 */
export interface GlobalConfigDirectoryInUserHome<K = GlobalConfigDirectoryType.UserHome> {
  readonly type: K
  readonly directory: RelativePath
}

/**
 * 特殊的，绝对路径的全局记忆提示词
 */
export interface GlobalConfigDirectoryInOther<K = GlobalConfigDirectoryType.External> {
  readonly type: K
  readonly directory: AbsolutePath
}

export type GlobalConfigDirectory<K = GlobalConfigDirectoryType> = GlobalConfigDirectoryInUserHome<K> | GlobalConfigDirectoryInOther<K>

/**
 * 提示词
 */
export interface Prompt<
  T extends PromptKind = PromptKind,
  Y extends YAMLFrontMatter = YAMLFrontMatter,
  DK extends FilePathKind = FilePathKind.Relative,
  D extends Path = RelativePath,
  C = unknown,
> extends FileContent<C, DK, D> {
  readonly type: T

  /**
   * title YAML front matter
   */
  readonly yamlFrontMatter?: Y
  /**
   * YAML front matter as raw string
   * @example ```yaml
   * ---
   * title: 'Hello World'
   * length: 0
   * ---
   * ```
   */
  readonly rawFrontMatter?: string
  readonly markdownAst?: Root
  readonly markdownContents: readonly RootContent[]
  readonly dir: D
}

/**
 * 全局提示词
 * 单一输出目标
 */
export interface GlobalMemoryPrompt extends Prompt<
  PromptKind.GlobalMemory
> {
  readonly type: PromptKind.GlobalMemory
  readonly parentDirectoryPath: GlobalConfigDirectory
}

/**
 * 工作于项目根目录的记忆提示词
 */
export interface ProjectRootMemoryPrompt extends Prompt<
  PromptKind.ProjectRootMemory,
  YAMLFrontMatter,
  FilePathKind.Relative,
  EmptyPath
> {
  readonly type: PromptKind.ProjectRootMemory
}

/**
 * 工作于项目子目录的记忆提示词
 */
export interface ProjectChildrenMemoryPrompt extends Prompt<PromptKind.ProjectChildrenMemory> {
  readonly type: PromptKind.ProjectChildrenMemory
  readonly workingChildDirectoryPath: RelativePath
}

export interface FastCommandYAMLFrontMatter extends YAMLFrontMatter {
  readonly description: string
  readonly argumentHint?: string
  readonly allowTools?: (CodingAgentTools | string)[]
}

/**
 * 快捷命令提示词
 */
export interface FastCommandPrompt extends Prompt<PromptKind.FastCommand, FastCommandYAMLFrontMatter> {
  readonly type: PromptKind.FastCommand
  readonly globalOnly?: true
}

export interface SubAgentYAMLFrontMatter extends YAMLFrontMatter {
  readonly name: string
  readonly description: string
  readonly model?: string
  readonly color?: ClaudeCodeCLISubAgentColors | string
  readonly argumentHint?: string
  readonly allowTools?: (CodingAgentTools | string)[]
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
