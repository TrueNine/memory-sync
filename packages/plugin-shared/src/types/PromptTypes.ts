import type {Root, RootContent} from '@truenine/md-compiler'
import type {ClaudeCodeCLISubAgentColors, CodingAgentTools, FilePathKind, NamingCaseKind, PromptKind, RuleScope} from './Enums'
import type {FileContent, Path, RelativePath, RootPath} from './FileSystemTypes'
import type {GlobalConfigDirectory} from './OutputTypes'

/**
 * Prompt
 */
export interface Prompt<
  T extends PromptKind = PromptKind,
  Y extends YAMLFrontMatter = YAMLFrontMatter,
  DK extends FilePathKind = FilePathKind.Relative,
  D extends Path = RelativePath,
  C = unknown
> extends FileContent<C, DK, D> {
  readonly type: T
  readonly yamlFrontMatter?: Y
  readonly rawFrontMatter?: string
  readonly markdownAst?: Root
  readonly markdownContents: readonly RootContent[]
  readonly dir: D
}

export interface YAMLFrontMatter<N extends NamingCaseKind = NamingCaseKind.KebabCase> extends Record<string, unknown> {
  readonly namingCase: N
}

export interface CommonYAMLFrontMatter<N extends NamingCaseKind = NamingCaseKind.KebabCase> extends YAMLFrontMatter<N> {
  readonly description: string
}

export interface ToolAwareYAMLFrontMatter<N extends NamingCaseKind = NamingCaseKind.KebabCase> extends CommonYAMLFrontMatter<N> {
  readonly allowTools?: (CodingAgentTools | string)[]
  readonly argumentHint?: string
}

/**
 * Memory prompt working on project root directory
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
 * Memory prompt working on project subdirectory
 */
export interface ProjectChildrenMemoryPrompt extends Prompt<PromptKind.ProjectChildrenMemory> {
  readonly type: PromptKind.ProjectChildrenMemory
  readonly workingChildDirectoryPath: RelativePath
}

export interface SubAgentYAMLFrontMatter extends ToolAwareYAMLFrontMatter {
  readonly name: string
  readonly model?: string
  readonly color?: ClaudeCodeCLISubAgentColors | string
  readonly seriName?: string | string[] | null
}

export interface FastCommandYAMLFrontMatter extends ToolAwareYAMLFrontMatter {
  readonly seriName?: string | string[] | null
} // description, argumentHint, allowTools inherited from ToolAwareYAMLFrontMatter

/**
 * Base YAML front matter for all skill types
 */
export interface SkillsYAMLFrontMatter extends CommonYAMLFrontMatter {
  readonly name: string
}

export interface SkillYAMLFrontMatter extends SkillsYAMLFrontMatter {
  readonly allowTools?: (CodingAgentTools | string)[]
  readonly keywords?: readonly string[]
  readonly displayName?: string
  readonly author?: string
  readonly version?: string
  readonly seriName?: string | string[] | null
}

/**
 * Codex skill metadata field
 * Follows Agent Skills specification: https://agentskills.io/specification
 *
 * The metadata field is an arbitrary key-value mapping for additional metadata.
 * Common fields include displayName, version, author, keywords, etc.
 */
export interface CodexSkillMetadata {
  readonly 'short-description'?: string
  readonly 'displayName'?: string
  readonly 'version'?: string
  readonly 'author'?: string
  readonly 'keywords'?: readonly string[]
  readonly 'category'?: string
  readonly 'repository'?: string
  readonly [key: string]: unknown
}

export interface CodexSkillYAMLFrontMatter extends SkillsYAMLFrontMatter {
  readonly 'license'?: string
  readonly 'compatibility'?: string
  readonly 'metadata'?: CodexSkillMetadata
  readonly 'allowed-tools'?: string
}

/**
 * Kiro steering file front matter
 * @see https://kiro.dev/docs/steering
 */
export interface KiroSteeringYAMLFrontMatter extends YAMLFrontMatter {
  readonly inclusion?: 'always' | 'fileMatch' | 'manual'
  readonly fileMatchPattern?: string
}

/**
 * Kiro Power POWER.md front matter
 * @see https://kiro.dev/docs/powers
 */
export interface KiroPowerYAMLFrontMatter extends SkillsYAMLFrontMatter {
  readonly displayName?: string
  readonly keywords?: readonly string[]
  readonly author?: string
}

/**
 * Rule YAML front matter with glob patterns and scope
 */
export interface RuleYAMLFrontMatter extends CommonYAMLFrontMatter {
  readonly globs: readonly string[]
  readonly scope?: RuleScope
  readonly seriName?: string | string[] | null
}

/**
 * Global memory prompt
 * Single output target
 */
export interface GlobalMemoryPrompt extends Prompt<
  PromptKind.GlobalMemory
> {
  readonly type: PromptKind.GlobalMemory
  readonly parentDirectoryPath: GlobalConfigDirectory
}
