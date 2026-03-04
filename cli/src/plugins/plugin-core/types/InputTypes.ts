import type {ProjectConfig} from './ConfigTypes.schema'
import type {
  FilePathKind,
  IDEKind,
  PromptKind,
  RuleScope
} from './enums'
import type {FileContent, Path, RelativePath} from './FileSystemTypes'
import type {LocalizedPrompt, PromptsContext} from './LocalizedTypes'
import type {
  CommandYAMLFrontMatter,
  GlobalMemoryPrompt,
  ProjectChildrenMemoryPrompt,
  ProjectRootMemoryPrompt,
  Prompt,
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
}

/**
 * All collected output information, provided to plugin system as input for output plugins
 */
export interface CollectedInputContext {
  readonly workspace: Workspace
  readonly prompts?: PromptsContext // New unified prompts container with localization support
  readonly promptIndex?: Map<string, LocalizedPrompt> // Quick lookup index for all localized prompts

  /** Legacy fields (deprecated, kept for backward compatibility) */
  /** @deprecated Use prompts.skills instead */
  readonly skills?: readonly SkillPrompt[]
  /** @deprecated Use prompts.commands instead */
  readonly commands?: readonly CommandPrompt[]
  /** @deprecated Use prompts.subAgents instead */
  readonly subAgents?: readonly SubAgentPrompt[]
  /** @deprecated Use prompts.rules instead */
  readonly rules?: readonly RulePrompt[]
  /** @deprecated Use prompts.readme instead */
  readonly readmePrompts?: readonly ReadmePrompt[]
  /** @deprecated Use prompts.globalMemory instead */
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
