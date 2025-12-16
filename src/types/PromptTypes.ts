import type { Root, RootContent } from 'mdast'
import type { ClaudeCodeCLISubAgentColors, CodingAgentTools, FilePathKind, NamingCaseKind, PromptKind } from '@/types/Enums'
import type { FileContent, Path, RelativePath, RootPath } from '@/types/FileSystemTypes'
import type { GlobalConfigDirectory } from '@/types/OutputTypes'

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

export interface YAMLFrontMatter<N extends NamingCaseKind = NamingCaseKind.KebabCase> extends Record<string, unknown> {
  readonly namingCase: N
}

/**
 * 工作于项目根目录的记忆提示词
 */
export interface ProjectRootMemoryPrompt extends Prompt<
  PromptKind.ProjectRootMemory,
  YAMLFrontMatter,
  FilePathKind.Relative,
  RootPath
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
export interface SubAgentYAMLFrontMatter extends YAMLFrontMatter {
  readonly name: string
  readonly description: string
  readonly model?: string
  readonly color?: ClaudeCodeCLISubAgentColors | string
  readonly argumentHint?: string
  readonly allowTools?: (CodingAgentTools | string)[]
}
export interface FastCommandYAMLFrontMatter extends YAMLFrontMatter {
  readonly description: string
  readonly argumentHint?: string
  readonly allowTools?: (CodingAgentTools | string)[]
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
