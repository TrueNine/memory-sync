import type { Root, RootContent } from 'mdast'

/**
 * 目录路径类型
 */
export enum FilePathKind {
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
export interface Path<K extends FilePathKind = FilePathKind> {
  readonly pathKind: K
  readonly path: string
  readonly getDirectoryName: () => string
}

/**
 * 相对路径目录
 */
export interface RelativePath extends Path<FilePathKind.Relative> {
  /**
   * 相对路径的基准目录，使用 `/` 进行分割
   */
  readonly basePath: string
}

/**
 * 绝对路径目录
 */
export type AbsolutePath = Path<FilePathKind.Absolute>

export type EmptyPath = Path<FilePathKind.Empty>

export interface FileContent<
  C = unknown,
  FK extends FilePathKind = FilePathKind.Relative,
  F extends Path = RelativePath,
> {
  content: C
  length: number
  filePathKind: FK
  dir: F
  charsetEncoding?: BufferEncoding
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
export const PathPlaceholders = {
  USER_HOME: '~',
  WORKSPACE: '$WORKSPACE',
  SHADOW_PROJECT: '$SHADOW_PROJECT',
}

/**
 * 输出插件需要处理的配置
 * 由插件系统解读为收集上下文
 * 插件路径自动解析以下展位符为特殊符号
 * - `$WORKSPACE`: 工作目录
 * - `$SHADOW_PROJECT`: 抽取源提示词工作目录（它是一个特殊的 project，方便存放于 git，单独进行管理提示词）
 * - `~`: 用户主目录
 *
 * @see CollectedInputContext - 被收集的上下文
 * @see PathPlaceholders - 路径占位符
 */
export interface InputPluginOptions {
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
}

export interface Workspace {
  readonly directory: Path
  readonly projects: Project[]
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

export interface ProjectIDEConfigDirectory {
  readonly directory: Path
  readonly ideKind: IDEKind
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

export enum PromptKind {
  GlobalMemory = 'GlobalMemory',
  ProjectRootMemory = 'ProjectRootMemory',
  ProjectChildrenMemory = 'ProjectChildrenMemory',
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
  DK extends FilePathKind = FilePathKind.Relative,
  D extends Path = RelativePath,
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
export interface SkillReferenceDocument extends Prompt<PromptKind.SkillReferenceDocument, YAMLFrontMatter, FilePathKind.Relative, RelativePath> {
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
  readonly frontMatter: SkillYAMLFrontMatter
}
