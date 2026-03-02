import type {ProjectConfig} from './ConfigTypes.schema'
import type {
  FilePathKind,
  IDEKind,
  PromptKind,
  RuleScope
} from './Enums'
import type {FileContent, Path, RelativePath} from './FileSystemTypes'
import type {LocalizedPrompt, PromptsContext} from './LocalizedTypes'
import type {
  FastCommandYAMLFrontMatter,
  GlobalMemoryPrompt,
  ProjectChildrenMemoryPrompt,
  ProjectRootMemoryPrompt,
  Prompt,
  RuleYAMLFrontMatter,
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
  readonly fastCommands?: readonly FastCommandPrompt[]
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
  readonly shadowSourceProjectDir?: string
}

/**
 * Rule prompt with glob patterns for file-scoped rule application
 */
export interface RulePrompt extends Prompt<PromptKind.Rule, RuleYAMLFrontMatter, FilePathKind.Relative, RelativePath, string> {
  readonly type: PromptKind.Rule
  readonly series: string
  readonly ruleName: string
  readonly globs: readonly string[]
  readonly scope: RuleScope
  readonly seriName?: string | string[] | null
  readonly rawMdxContent?: string
}

/**
 * Fast command prompt
 */
export interface FastCommandPrompt extends Prompt<PromptKind.FastCommand, FastCommandYAMLFrontMatter, FilePathKind.Relative, RelativePath, string> {
  readonly type: PromptKind.FastCommand
  readonly globalOnly?: true
  readonly series?: string
  readonly commandName: string
  readonly seriName?: string | string[] | null
  readonly rawMdxContent?: string
}

/**
 * Sub-agent prompt
 */
export interface SubAgentPrompt extends Prompt<PromptKind.SubAgent, SubAgentYAMLFrontMatter, FilePathKind.Relative, RelativePath, string> {
  readonly type: PromptKind.SubAgent
  readonly series?: string
  readonly agentName: string
  readonly seriName?: string | string[] | null
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
 * Resource category for classification
 *
 * Categories:
 * - code: .kt, .java, .py, .ts, .js, .go, .rs, etc.
 * - data: .sql, .json, .xml, .yaml, .csv, etc.
 * - document: .txt, .rtf, .docx, .pdf, etc.
 * - config: .ini, .conf, .properties, etc.
 * - script: .sh, .bash, .ps1, .bat, etc.
 * - image: .png, .jpg, .gif, .svg, .webp, etc.
 * - binary: .exe, .dll, .so, .wasm, etc.
 * - other: anything else
 */
export type SkillResourceCategory
  = | 'code'
    | 'data'
    | 'document'
    | 'config'
    | 'script'
    | 'image'
    | 'binary'
    | 'other'

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
  readonly category: SkillResourceCategory
  readonly length: number
  readonly mimeType?: string
}

/**
 * Text file extensions that should be read as UTF-8
 */
export const SKILL_RESOURCE_TEXT_EXTENSIONS = [
  '.kt', // Code files
  '.java',
  '.py',
  '.pyi',
  '.pyx',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.go',
  '.rs',
  '.c',
  '.cpp',
  '.cc',
  '.h',
  '.hpp',
  '.hxx',
  '.cs',
  '.fs',
  '.fsx',
  '.vb',
  '.rb',
  '.php',
  '.swift',
  '.scala',
  '.groovy',
  '.lua',
  '.r',
  '.R',
  '.jl',
  '.ex',
  '.exs',
  '.erl',
  '.clj',
  '.cljs',
  '.hs',
  '.ml',
  '.mli',
  '.nim',
  '.zig',
  '.v',
  '.dart',
  '.vue',
  '.svelte',
  '.sql', // Data files
  '.json',
  '.jsonc',
  '.json5',
  '.xml',
  '.xsd',
  '.xsl',
  '.xslt',
  '.yaml',
  '.yml',
  '.toml',
  '.csv',
  '.tsv',
  '.graphql',
  '.gql',
  '.proto',
  '.txt', // Document files
  '.text',
  '.rtf',
  '.log',
  '.ini', // Config files
  '.conf',
  '.cfg',
  '.config',
  '.properties',
  '.env',
  '.envrc',
  '.editorconfig',
  '.gitignore',
  '.gitattributes',
  '.npmrc',
  '.nvmrc',
  '.npmignore',
  '.eslintrc',
  '.prettierrc',
  '.stylelintrc',
  '.babelrc',
  '.browserslistrc',
  '.sh', // Script files
  '.bash',
  '.zsh',
  '.fish',
  '.ps1',
  '.psm1',
  '.psd1',
  '.bat',
  '.cmd',
  '.html', // Web files
  '.htm',
  '.xhtml',
  '.css',
  '.scss',
  '.sass',
  '.less',
  '.styl',
  '.svg',
  '.ejs', // Template files
  '.hbs',
  '.mustache',
  '.pug',
  '.jade',
  '.jinja',
  '.jinja2',
  '.j2',
  '.erb',
  '.haml',
  '.slim',
  '.d.ts', // Declaration files
  '.d.mts',
  '.d.cts',
  '.diff', // Other text formats
  '.patch',
  '.asm',
  '.s',
  '.makefile',
  '.mk',
  '.dockerfile',
  '.tf',
  '.tfvars', // Terraform
  '.prisma', // Prisma
  '.mdx' // MDX (but not .md which is handled separately)
] as const

/**
 * Binary file extensions that should be read as base64
 */
export const SKILL_RESOURCE_BINARY_EXTENSIONS = [
  '.docx', // Documents
  '.doc',
  '.xlsx',
  '.xls',
  '.pptx',
  '.ppt',
  '.pdf',
  '.odt',
  '.ods',
  '.odp',
  '.png', // Images
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.ico',
  '.bmp',
  '.tiff',
  '.zip', // Archives
  '.tar',
  '.gz',
  '.bz2',
  '.7z',
  '.rar',
  '.pyd', // Compiled
  '.pyc',
  '.pyo',
  '.class',
  '.jar',
  '.war',
  '.dll',
  '.so',
  '.dylib',
  '.exe',
  '.bin',
  '.wasm',
  '.ttf', // Fonts
  '.otf',
  '.woff',
  '.woff2',
  '.eot',
  '.mp3', // Audio/Video (usually not needed but for completeness)
  '.wav',
  '.ogg',
  '.mp4',
  '.webm',
  '.db', // Database
  '.sqlite',
  '.sqlite3'
] as const

export type SkillResourceTextExtension = typeof SKILL_RESOURCE_TEXT_EXTENSIONS[number]
export type SkillResourceBinaryExtension = typeof SKILL_RESOURCE_BINARY_EXTENSIONS[number]

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
  readonly seriName?: string | string[] | null
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
