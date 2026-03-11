import type {ProjectConfig} from './ConfigTypes.schema'
import type {
  FilePathKind,
  IDEKind,
  PromptKind,
  RuleScope
} from './enums'
import type {
  CommandYAMLFrontMatter,
  FileContent,
  GlobalMemoryPrompt,
  Path,
  ProjectChildrenMemoryPrompt,
  ProjectRootMemoryPrompt,
  Prompt,
  RelativePath,
  RuleYAMLFrontMatter,
  SeriName,
  SkillYAMLFrontMatter,
  SubAgentYAMLFrontMatter
} from './PromptTypes'

export interface Project {
  readonly name?: string
  readonly dirFromWorkspacePath?: RelativePath
  readonly rootMemoryPrompt?: ProjectRootMemoryPrompt
  readonly childMemoryPrompts?: readonly ProjectChildrenMemoryPrompt[]
  readonly isPromptSourceProject?: boolean
  readonly projectConfig?: ProjectConfig
}

export interface Workspace {
  readonly directory: Path
  readonly projects: Project[]
}

/**
 * IDE configuration file
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
  readonly sourcePath?: string
}

/**
 * Shared context fields across input aggregation and output execution.
 */
interface CollectedContextData {
  readonly workspace: Workspace

  /** Flat prompt projections used by current output plugins */
  readonly skills?: readonly SkillPrompt[]
  readonly commands?: readonly CommandPrompt[]
  readonly subAgents?: readonly SubAgentPrompt[]
  readonly rules?: readonly RulePrompt[]
  readonly readmePrompts?: readonly ReadmePrompt[]
  readonly globalMemory?: GlobalMemoryPrompt

  /** Other non-prompt fields */
  readonly vscodeConfigFiles?: readonly ProjectIDEConfigFile<IDEKind.VSCode>[]
  readonly jetbrainsConfigFiles?: readonly ProjectIDEConfigFile<IDEKind.IntellijIDEA>[]
  readonly editorConfigFiles?: readonly ProjectIDEConfigFile<IDEKind.EditorConfig>[]
  readonly aiAgentIgnoreConfigFiles?: readonly AIAgentIgnoreConfigFile[]
  readonly globalGitIgnore?: string
  readonly shadowGitExclude?: string
  readonly aindexDir?: string
}

/**
 * Input-side collected context.
 * Built incrementally by input plugins through dependency-aware merging.
 */
export interface InputCollectedContext extends CollectedContextData {}

/**
 * Output-side collected context.
 * Produced once from input context and consumed by output plugins only.
 */
export interface OutputCollectedContext extends CollectedContextData {}

/**
 * Convert input context to output context boundary object.
 * This keeps input and output stages decoupled while preserving data shape.
 */
export function toOutputCollectedContext(input: InputCollectedContext): OutputCollectedContext {
  return {
    workspace: {
      directory: input.workspace.directory,
      projects: [...input.workspace.projects]
    },
    ...input.skills != null && {skills: [...input.skills]},
    ...input.commands != null && {commands: [...input.commands]},
    ...input.subAgents != null && {subAgents: [...input.subAgents]},
    ...input.rules != null && {rules: [...input.rules]},
    ...input.readmePrompts != null && {readmePrompts: [...input.readmePrompts]},
    ...input.globalMemory != null && {globalMemory: input.globalMemory},
    ...input.vscodeConfigFiles != null && {vscodeConfigFiles: [...input.vscodeConfigFiles]},
    ...input.jetbrainsConfigFiles != null && {jetbrainsConfigFiles: [...input.jetbrainsConfigFiles]},
    ...input.editorConfigFiles != null && {editorConfigFiles: [...input.editorConfigFiles]},
    ...input.aiAgentIgnoreConfigFiles != null && {aiAgentIgnoreConfigFiles: [...input.aiAgentIgnoreConfigFiles]},
    ...input.globalGitIgnore != null && {globalGitIgnore: input.globalGitIgnore},
    ...input.shadowGitExclude != null && {shadowGitExclude: input.shadowGitExclude},
    ...input.aindexDir != null && {aindexDir: input.aindexDir}
  }
}

/**
 * Rule prompt with glob patterns for file-scoped rule application
 */
export interface RulePrompt extends Prompt<PromptKind.Rule, RuleYAMLFrontMatter, FilePathKind.Relative, RelativePath, string> {
  readonly type: PromptKind.Rule
  readonly prefix: string
  readonly ruleName: string
  readonly globs: readonly string[]
  readonly scope: RuleScope
  readonly seriName?: SeriName
  readonly rawMdxContent?: string
}

/**
 * Command prompt
 */
export interface CommandPrompt extends Prompt<PromptKind.Command, CommandYAMLFrontMatter, FilePathKind.Relative, RelativePath, string> {
  readonly type: PromptKind.Command
  readonly globalOnly?: true
  readonly commandPrefix?: string
  readonly commandName: string
  readonly seriName?: SeriName
  readonly rawMdxContent?: string
}

/**
 * Sub-agent prompt
 */
export interface SubAgentPrompt extends Prompt<PromptKind.SubAgent, SubAgentYAMLFrontMatter, FilePathKind.Relative, RelativePath, string> {
  readonly type: PromptKind.SubAgent
  readonly agentPrefix?: string
  readonly agentName: string
  readonly seriName?: SeriName
  readonly rawMdxContent?: string
}

/**
 * Skill child document (.md files in skill directory or any subdirectory)
 * Excludes skill.md which is the main skill file
 */
export interface SkillChildDoc extends Prompt<PromptKind.SkillChildDoc> {
  readonly type: PromptKind.SkillChildDoc
  readonly relativePath: string
}

/**
 * Resource content encoding type
 */
export type SkillResourceEncoding = 'text' | 'base64'

/**
 * Skill resource file for AI on-demand access
 * Any non-.md file in skill directory or subdirectories
 *
 * Supports:
 * - Code files: .kt, .java, .py, .ts, .js, .go, .rs, .c, .cpp, etc.
 * - Data files: .sql, .json, .xml, .yaml, .csv, etc.
 * - Documents: .txt, .rtf, .docx, .pdf, etc.
 * - Config files: .ini, .conf, .properties, etc.
 * - Scripts: .sh, .bash, .ps1, .bat, etc.
 * - Images: .png, .jpg, .gif, .svg, .webp, etc.
 * - Binary files: .exe, .dll, .wasm, etc.
 */
export interface SkillResource {
  readonly type: PromptKind.SkillResource
  readonly extension: string
  readonly fileName: string
  readonly relativePath: string
  readonly sourcePath?: string
  readonly content: string
  readonly encoding: SkillResourceEncoding
  readonly length: number
  readonly mimeType?: string
}

/**
 * MCP server configuration entry
 */
export interface McpServerConfig {
  readonly command: string
  readonly args?: readonly string[]
  readonly env?: Readonly<Record<string, string>>
  readonly disabled?: boolean
  readonly autoApprove?: readonly string[]
}

/**
 * Skill MCP configuration (mcp.json)
 * - Kiro: supports per-power MCP configuration natively
 * - Others: may support lazy loading in the future
 */
export interface SkillMcpConfig {
  readonly type: PromptKind.SkillMcpConfig
  readonly mcpServers: Readonly<Record<string, McpServerConfig>>
  readonly rawContent: string
}

export interface SkillPrompt extends Prompt<PromptKind.Skill, SkillYAMLFrontMatter> {
  readonly type: PromptKind.Skill
  readonly dir: RelativePath
  readonly yamlFrontMatter: SkillYAMLFrontMatter
  readonly mcpConfig?: SkillMcpConfig
  readonly childDocs?: SkillChildDoc[]
  readonly resources?: SkillResource[]
  readonly seriName?: SeriName
}

/**
 * Readme-family source file kind
 *
 * - Readme: rdm.mdx → README.md
 * - CodeOfConduct: coc.mdx → CODE_OF_CONDUCT.md
 * - Security: security.mdx → SECURITY.md
 */
export type ReadmeFileKind = 'Readme' | 'CodeOfConduct' | 'Security'

/**
 * Mapping from ReadmeFileKind to source/output file names
 */
export const README_FILE_KIND_MAP: Readonly<Record<ReadmeFileKind, {readonly src: string, readonly out: string}>> = {
  Readme: {src: 'rdm.mdx', out: 'README.md'},
  CodeOfConduct: {src: 'coc.mdx', out: 'CODE_OF_CONDUCT.md'},
  Security: {src: 'security.mdx', out: 'SECURITY.md'}
}

/**
 * README-family prompt data structure (README.md, CODE_OF_CONDUCT.md, SECURITY.md)
 */
export interface ReadmePrompt extends Prompt<PromptKind.Readme> {
  readonly type: PromptKind.Readme
  readonly projectName: string
  readonly targetDir: RelativePath
  readonly isRoot: boolean
  readonly fileKind: ReadmeFileKind
}

/**
 * Supported locale codes
 */
export type Locale = 'zh' | 'en'

export type LocalizedFileExtension = string | readonly string[]

/**
 * Localized content wrapper for a single locale
 * Contains both compiled content and raw MDX source
 */
export interface LocalizedContent<T extends Prompt = Prompt> {
  /** Compiled/processed content */
  readonly content: string

  /** Original MDX source (before compilation) */
  readonly rawMdx?: string

  /** Extracted front matter */
  readonly frontMatter?: Record<string, unknown>

  /** File last modified timestamp */
  readonly lastModified: Date

  /** Full prompt object (optional, for extended access) */
  readonly prompt?: T

  /** Absolute file path */
  readonly filePath: string
}

/**
 * Source content container for all locales
 */
export interface LocalizedSource<T extends Prompt = Prompt> {
  /** Default source content (.src.mdx) */
  readonly zh?: LocalizedContent<T>

  /** English content (.mdx) */
  readonly en?: LocalizedContent<T>

  /** Default locale content (typically zh) */
  readonly default: LocalizedContent<T>

  /** Which locale is the default */
  readonly defaultLocale: Locale
}

/** Universal localized prompt wrapper */
export interface LocalizedPrompt<T extends Prompt = Prompt, K extends PromptKind = PromptKind> {
  readonly name: string // Prompt identifier name
  readonly type: K // Prompt type kind
  readonly src: LocalizedSource<T> // Source files content (src directory)
  readonly dist?: LocalizedContent<T> // Compiled/dist content (dist directory, optional)

  /** Metadata flags */
  readonly metadata: {
    readonly hasDist: boolean // Whether dist content exists
    readonly hasMultipleLocales: boolean // Whether multiple locales exist in src
    readonly isDirectoryStructure: boolean // Whether this is a directory-based prompt (like skills)

    /** Available child items (for directory structures) */
    readonly children?: string[]
  }

  /** File paths for all variants */
  readonly paths: {
    readonly zh?: string
    readonly en?: string
    readonly dist?: string
  }
}

/**
 * Options for reading localized prompts from different structures
 */
export interface LocalizedReadOptions<T extends Prompt, K extends PromptKind> {
  /** File extensions for each locale */
  readonly localeExtensions: {
    readonly zh: LocalizedFileExtension
    readonly en: LocalizedFileExtension
  }

  /** Entry file name (without extension, e.g., 'skill' for skills) */
  readonly entryFileName?: string

  /** Create prompt from content */
  readonly createPrompt: (content: string, locale: Locale, name: string, metadata?: Record<string, unknown>) => T | Promise<T>

  /** Prompt kind */
  readonly kind: K

  /** Whether this is a directory-based structure */
  readonly isDirectoryStructure: boolean
}

/**
 * Result of reading a directory structure (like skills)
 */
export interface DirectoryReadResult<T extends Prompt, K extends PromptKind> {
  readonly prompts: LocalizedPrompt<T, K>[]
  readonly errors: ReadError[]
}

/**
 * Error during reading
 */
export interface ReadError {
  readonly path: string
  readonly error: Error
  readonly phase: 'scan' | 'read' | 'compile'
}
