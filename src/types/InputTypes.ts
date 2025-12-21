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
