import type { Root, RootContent } from 'mdast'

/**
 * 目录路径类型
 */
export enum DirectoryPathKind {
  /**
   * 相对于某个基准的路径
   */
  Relative = 'Relative',
  /**
   * 绝对路径
   */
  Absolute = 'Absolute',
  /**
   * 空路径，表示当前工作目录
   */
  Empty = 'Empty',
}

/**
 * 命名方式
 */
export enum NamingCaseKind {
  CamelCase = 'CamelCase',
  PascalCase = 'PascalCase',
  SnakeCase = 'SnakeCase',
  KebabCase = 'KebabCase',
  UpperCase = 'UpperCase',
  LowerCase = 'LowerCase',
  Original = 'Original',
}

export interface YAMLFrontMatter<N extends NamingCaseKind = NamingCaseKind.KebabCase> extends Record<string, unknown> {
  readonly namingCase: N
}

/**
 * 通用目录表示
 */
export interface Directory<K extends DirectoryPathKind = DirectoryPathKind> {
  readonly pathKind: K
  readonly path: string
  readonly getDirectoryName: () => string
}

/**
 * 相对路径目录
 */
export interface RelativeDirectory extends Directory<DirectoryPathKind.Relative> {
  /**
   * 相对路径的基准目录，使用 `/` 进行分割
   */
  readonly basePath: string
}

/**
 * 绝对路径目录
 */
export type AbsoluteDirectory = Directory<DirectoryPathKind.Absolute>

export type EmptyDirectory = Directory<DirectoryPathKind.Empty>

export interface FileContent<
  F = unknown,
  DK extends DirectoryPathKind = DirectoryPathKind.Relative,
  D extends Directory = RelativeDirectory,
> {
  content: F
  length: number
  directoryKind: DK
  directory: D
  charsetEncoding?: BufferEncoding
}

export interface Workspace {
  readonly projectName?: string
  /**
   * 相较于 workspaceGroup 的工作目录
   */
  readonly directoryFormWorkspaceGroupDirectory?: RelativeDirectory
  /**
   * 工作于当前项目根部的记忆提示词
   */
  readonly rootMemoryPrompt?: WorkspaceRootMemoryPrompt
  /**
   * 工作于当前项目子目录的记忆提示词
   */
  readonly childrenMemoryPrompts?: readonly WorkspaceChildrenMemoryPrompt[]
}

export interface WorkspaceGroup {
  readonly directory: Directory
  readonly workspaces: Workspace[]
}

export enum GlobalConfigDirectoryType {
  UserHome = 'UserHome',
  External = 'External',
}

export enum IDEKind {
  VSCode = 'VSCode',
  IntellijIDEA = 'IntellijIDEA',
  Git = 'Git',
  EditorConfig = 'EditorConfig',
  /**
   * 通用类型
   */
  Original = 'Original',
}

export interface WorkspaceIDEConfigDirectory {
  readonly directory: Directory
  readonly ideKind: IDEKind
}

/**
 * ide 配置文件
 */
export interface WorkspaceIDEConfigFile<I extends IDEKind = IDEKind.Original> extends FileContent<string> {
  readonly type: I
}

/**
 * 所有收集到的 输出信息，提供给插件系统，作为输出插件的输入
 */
export interface CollectedInputContext {
  readonly workspaceGroup: WorkspaceGroup
  readonly externalWorkspaces?: readonly Workspace[]
  readonly ideConfigFiles: readonly WorkspaceIDEConfigFile[]
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
  readonly directory: RelativeDirectory
}

/**
 * 特殊的，绝对路径的全局记忆提示词
 */
export interface GlobalConfigDirectoryInOther<K = GlobalConfigDirectoryType.External> {
  readonly type: K
  readonly directory: AbsoluteDirectory
}

export type GlobalConfigDirectory<K = GlobalConfigDirectoryType> = GlobalConfigDirectoryInUserHome<K> | GlobalConfigDirectoryInOther<K>

export enum PromptKind {
  GlobalMemory = 'GlobalMemory',
  WorkspaceRootMemory = 'WorkspaceRootMemory',
  WorkspaceChildrenMemory = 'WorkspaceChildrenMemory',
  FastCommand = 'FastCommand',
  SubAgent = 'SubAgent',
  Skill = 'Skill',
  SkillReferenceDocument = 'SkillReferenceDocument',
}

/**
 * 提示词
 */
export interface Prompt<
  P extends PromptKind = PromptKind,
  Y extends YAMLFrontMatter = YAMLFrontMatter,
  DK extends DirectoryPathKind = DirectoryPathKind.Relative,
  D extends Directory = RelativeDirectory,
  C = unknown,
> extends FileContent<C, DK, D>
{
  readonly type: P
  /**
   * title YAML front matter
   */
  readonly frontMatter?: Y
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
  readonly directory: D
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
 * 工作于项目子目录的记忆提示词
 */
export interface WorkspaceRootMemoryPrompt extends Prompt<
  PromptKind.WorkspaceRootMemory,
  YAMLFrontMatter,
  DirectoryPathKind.Relative,
  EmptyDirectory
> {
  readonly type: PromptKind.WorkspaceRootMemory
}

/**
 * 工作于整个项目根目录的记忆提示词
 */
export interface WorkspaceChildrenMemoryPrompt extends Prompt<PromptKind.WorkspaceChildrenMemory> {
  readonly type: PromptKind.WorkspaceChildrenMemory
  readonly workingChildDirectoryPath: RelativeDirectory
}

export enum ClaudeCodeCLISubAgentColors {
  Red = 'Red',
  Green = 'Green',
  Blue = 'Blue',
  Yellow = 'Yellow',
}

/**
 * AI Agent 可调用的工具
 */
export enum CodingAgentTools {
  Read = 'Read',
  Write = 'Write',
  Edit = 'Edit',
  Grep = 'Grep',
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
export interface SkillReferenceDocument extends Prompt<PromptKind.SkillReferenceDocument, YAMLFrontMatter, DirectoryPathKind.Relative, RelativeDirectory> {
  readonly type: PromptKind.SkillReferenceDocument
  readonly directory: RelativeDirectory
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
  readonly directory: RelativeDirectory
  readonly referenceDocuments?: SkillReferenceDocument[]
  readonly frontMatter: SkillYAMLFrontMatter
}
