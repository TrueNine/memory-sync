import type {Root, RootContent} from 'mdast'
import type {ClaudeCodeCLISubAgentColors, CodingAgentTools, FilePathKind, NamingCaseKind, PromptKind} from '@/types/Enums'
import type {FileContent, Path, RelativePath, RootPath} from '@/types/FileSystemTypes'
import type {GlobalConfigDirectory} from '@/types/OutputTypes'

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
 * Base YAML front matter for all skill types
 */
export interface SkillsYAMLFrontMatter extends YAMLFrontMatter {
  readonly name: string
  readonly description: string
}

export interface SkillYAMLFrontMatter extends SkillsYAMLFrontMatter {
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
  /**
   * Semantic version number
   * @example '1.0.0'
   */
  readonly version?: string
}

/**
 * Codex skill metadata field
 * Follows Agent Skills specification: https://agentskills.io/specification
 *
 * The metadata field is an arbitrary key-value mapping for additional metadata.
 * Common fields include displayName, version, author, keywords, etc.
 */
export interface CodexSkillMetadata {
  /**
   * Short description for the skill (user-facing)
   */
  readonly 'short-description'?: string
  /**
   * Display name for the skill
   */
  readonly 'displayName'?: string
  /**
   * Semantic version number
   * @example '1.0.0'
   */
  readonly 'version'?: string
  /**
   * Author of the skill
   */
  readonly 'author'?: string
  /**
   * Keywords for skill discovery and matching
   */
  readonly 'keywords'?: readonly string[]
  /**
   * Category tag for the skill
   */
  readonly 'category'?: string
  /**
   * Repository URL for the skill
   */
  readonly 'repository'?: string
  /**
   * Allow arbitrary additional metadata
   */
  readonly [key: string]: unknown
}

/**
 * Codex CLI skill YAML front matter definition
 * Follows Agent Skills specification: https://agentskills.io/specification
 * @see https://developers.openai.com/codex/skills/create-skill
 *
 * Required fields:
 * - name: Max 64 characters. Lowercase letters, numbers, and hyphens only.
 *         Must not start or end with a hyphen.
 * - description: Max 1024 characters. Describes what the skill does and when to use it.
 *
 * Optional fields:
 * - license: License name or reference to a bundled license file.
 * - compatibility: Max 500 characters. Environment requirements.
 * - metadata: Arbitrary key-value mapping for additional metadata.
 * - allowed-tools: Space-delimited list of pre-approved tools (experimental).
 *
 * Codex only supports global skills at ~/.codex/skills/
 */
export interface CodexSkillYAMLFrontMatter extends SkillsYAMLFrontMatter {
  /**
   * License name or reference to a bundled license file
   * @example 'MIT', 'LICENSE.md'
   */
  readonly 'license'?: string
  /**
   * Environment requirements (max 500 characters)
   * Indicates intended product, system packages, network access, etc.
   * @example 'Requires Python 3.10+, network access for API calls.'
   */
  readonly 'compatibility'?: string
  /**
   * Optional metadata for the skill
   * Arbitrary key-value mapping for additional metadata like displayName, version, author, keywords
   */
  readonly 'metadata'?: CodexSkillMetadata
  /**
   * Space-delimited list of pre-approved tools the skill may use (experimental)
   * @example 'Bash Read Write'
   */
  readonly 'allowed-tools'?: string
}

/**
 * Kiro steering file front matter
 * @see https://kiro.dev/docs/steering
 */
export interface KiroSteeringYAMLFrontMatter extends YAMLFrontMatter {
  /**
   * Inclusion mode for steering file
   * - 'always': Always included (default)
   * - 'fileMatch': Conditionally included when matching file is read
   * - 'manual': Manually included via context key ('#' in chat)
   */
  readonly inclusion?: 'always' | 'fileMatch' | 'manual'
  /**
   * Glob pattern for fileMatch inclusion mode
   * @example 'README*', '*.ts', 'src/**'
   */
  readonly fileMatchPattern?: string
}

/**
 * Kiro Power POWER.md front matter
 * @see https://kiro.dev/docs/powers
 */
export interface KiroPowerYAMLFrontMatter extends SkillsYAMLFrontMatter {
  /**
   * Display name for the power
   * If not set, defaults to `name`
   */
  readonly displayName?: string
  /**
   * Keywords for power discovery and matching
   * Used by Kiro Powers for keyword-based activation
   */
  readonly keywords?: readonly string[]
  /**
   * Author of the power
   */
  readonly author?: string
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
