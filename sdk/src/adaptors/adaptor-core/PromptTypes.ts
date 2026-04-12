import type {ClaudeCodeCLISubAgentColors, CodingAgentTools, FilePathKind, NamingCaseKind, PromptKind, RuleScope} from './enums'
import type {GlobalConfigDirectory} from './OutputTypes'
import type {Root, RootContent} from '@/md-compiler'

/** Common directory representation */
export interface Path<K extends FilePathKind = FilePathKind> {
  readonly pathKind: K
  readonly path: string
  readonly getDirectoryName: () => string
}

/** Relative path directory */
export interface RelativePath extends Path<FilePathKind.Relative> {
  readonly basePath: string
  getAbsolutePath: () => string
}

/** Absolute path directory */
export type AbsolutePath = Path<FilePathKind.Absolute>

/** Root path directory */
export type RootPath = Path<FilePathKind.Root>

export interface FileContent<
  C = unknown,
  FK extends FilePathKind = FilePathKind.Relative,
  F extends Path = RelativePath
> {
  content: C
  length: number
  filePathKind: FK
  dir: F
  charsetEncoding?: BufferEncoding
}

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

/**
 * Series name type - used across multiple prompt types
 * Extracted to avoid repetition and ensure consistency
 */
export type SeriName = string | string[] | null

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
  readonly model?: string
  readonly color?: ClaudeCodeCLISubAgentColors | string
  readonly seriName?: SeriName
  readonly scope?: RuleScope
}

export interface CommandYAMLFrontMatter extends ToolAwareYAMLFrontMatter {
  readonly seriName?: SeriName
  readonly scope?: RuleScope
} // description, argumentHint, allowTools inherited from ToolAwareYAMLFrontMatter

/**
 * Base YAML front matter for all skill types
 */
export interface SkillsYAMLFrontMatter extends CommonYAMLFrontMatter {
  readonly name?: string
}

export interface SkillYAMLFrontMatter extends SkillsYAMLFrontMatter {
  readonly allowTools?: (CodingAgentTools | string)[]
  readonly keywords?: readonly string[]
  readonly displayName?: string
  readonly author?: string
  readonly version?: string
  readonly seriName?: SeriName
  readonly scope?: RuleScope
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
  readonly seriName?: SeriName
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
