import type {
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
  SkillYAMLFrontMatter,
  SubAgentYAMLFrontMatter,
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
  /**
   * Indicates whether this project's configuration originates from the shadow source directory (e.g., aindex/ref/).
   *
   * When true:
   * - The project configuration was discovered from the shadow source directory
   * - `dirFromWorkspacePath` still points to the actual workspace project directory (output target)
   * - Certain output plugins (e.g., AIAgentIgnoreConfigFileOutputPlugin) should skip this project
   *   to avoid overwriting source files in the shadow project
   *
   * When false or undefined:
   * - The project is a regular workspace project or external project
   * - All output plugins should process this project normally
   *
   * Note: This flag does NOT mean the output should go to the shadow source directory.
   * The output target is always determined by `dirFromWorkspacePath`.
   */
  readonly isPromptSourceProject?: boolean
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
 * AI Agent ignore configuration file
 */
export interface AIAgentIgnoreConfigFile {
  readonly fileName: string
  readonly content: string
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
  readonly aiAgentIgnoreConfigFiles?: readonly AIAgentIgnoreConfigFile[]
  /**
   * Shadow source project directory absolute path
   * Used to identify and skip shadow source project during cleanup
   */
  readonly shadowSourceProjectDir?: string
  /**
   * README.md prompts collected from shadow project
   */
  readonly readmePrompts?: readonly ReadmePrompt[]
}

/**
 * 快捷命令提示词
 */
export interface FastCommandPrompt extends Prompt<PromptKind.FastCommand, FastCommandYAMLFrontMatter> {
  readonly type: PromptKind.FastCommand
  readonly globalOnly?: true
  /**
   * Series prefix extracted from filename (e.g., 'pe' from 'pe_compile.md')
   * Undefined if filename has no underscore prefix
   */
  readonly series?: string
  /**
   * Command name without series prefix (e.g., 'compile' from 'pe_compile.md')
   */
  readonly commandName: string
}

/**
 * 子代理提示词
 */
export interface SubAgentPrompt extends Prompt<PromptKind.SubAgent, SubAgentYAMLFrontMatter> {
  readonly type: PromptKind.SubAgent
}

/**
 * Skill child document (.md files in skill directory or any subdirectory)
 * Excludes skill.md which is the main skill file
 */
export interface SkillChildDoc extends Prompt<PromptKind.SkillChildDoc> {
  readonly type: PromptKind.SkillChildDoc
  /**
   * Relative path from skill directory (e.g., 'docs/guide.md', 'examples/basic.md')
   */
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
  /**
   * File extension (e.g., '.kt', '.java', '.sql', '.docx', '.png')
   */
  readonly extension: string
  /**
   * File name without directory path
   */
  readonly fileName: string
  /**
   * Relative path from skill directory (e.g., 'helper.kt', 'assets/logo.png', 'data/schema.sql')
   */
  readonly relativePath: string
  /**
   * File content
   * - For text files: UTF-8 encoded string
   * - For binary files: base64 encoded string
   */
  readonly content: string
  /**
   * Content encoding type
   */
  readonly encoding: SkillResourceEncoding
  /**
   * Resource category for classification
   */
  readonly category: SkillResourceCategory
  /**
   * Content length in bytes (original size for binary files)
   */
  readonly length: number
  /**
   * MIME type if detectable
   */
  readonly mimeType?: string
}

/**
 * Text file extensions that should be read as UTF-8
 */
export const SKILL_RESOURCE_TEXT_EXTENSIONS = [
  // Code files
  '.kt',
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
  // Data files
  '.sql',
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
  // Document files
  '.txt',
  '.text',
  '.rtf',
  '.log',
  // Config files
  '.ini',
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
  // Script files
  '.sh',
  '.bash',
  '.zsh',
  '.fish',
  '.ps1',
  '.psm1',
  '.psd1',
  '.bat',
  '.cmd',
  // Web files
  '.html',
  '.htm',
  '.xhtml',
  '.css',
  '.scss',
  '.sass',
  '.less',
  '.styl',
  '.svg',
  // Template files
  '.ejs',
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
  // Declaration files
  '.d.ts',
  '.d.mts',
  '.d.cts',
  // Other text formats
  '.diff',
  '.patch',
  '.asm',
  '.s',
  '.makefile',
  '.mk',
  '.dockerfile',
  '.tf',
  // Terraform
  '.tfvars',
  // Prisma
  '.prisma',
  // MDX (but not .md which is handled separately)
  '.mdx',
] as const

/**
 * Binary file extensions that should be read as base64
 */
export const SKILL_RESOURCE_BINARY_EXTENSIONS = [
  // Documents
  '.docx',
  '.doc',
  '.xlsx',
  '.xls',
  '.pptx',
  '.ppt',
  '.pdf',
  '.odt',
  '.ods',
  '.odp',
  // Images
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.ico',
  '.bmp',
  '.tiff',
  // Archives
  '.zip',
  '.tar',
  '.gz',
  '.bz2',
  '.7z',
  '.rar',
  // Compiled
  '.pyd',
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
  // Fonts
  '.ttf',
  '.otf',
  '.woff',
  '.woff2',
  '.eot',
  // Audio/Video (usually not needed but for completeness)
  '.mp3',
  '.wav',
  '.ogg',
  '.mp4',
  '.webm',
  // Database
  '.db',
  '.sqlite',
  '.sqlite3',
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
  /**
   * MCP servers configuration
   */
  readonly mcpServers: Readonly<Record<string, McpServerConfig>>
  /**
   * Raw JSON content
   */
  readonly rawContent: string
}

/**
 * skill 主文件（skill.md）
 * skill name 从 front matter 当中进行获取
 *
 * Skill structure:
 * - skill.md: Main skill definition file (required)
 * - mcp.json: MCP server configuration (optional)
 *   - Kiro: supports per-power MCP configuration
 *   - Others: may support lazy loading
 * - childDocs: All .md files in skill directory or subdirectories (optional)
 * - resources: All non-.md files for AI on-demand access (optional)
 *   - Code, data, documents, images, binary files, etc.
 *   - Can be in any subdirectory
 */
export interface SkillPrompt extends Prompt<PromptKind.Skill, SkillYAMLFrontMatter> {
  readonly type: PromptKind.Skill
  /**
   * skill 是需要一个目录来表示是一组 skill
   */
  readonly dir: RelativePath
  readonly yamlFrontMatter: SkillYAMLFrontMatter
  /**
   * MCP configuration (mcp.json)
   * - Kiro: supports per-power MCP configuration
   * - Others: may support lazy loading
   */
  readonly mcpConfig?: SkillMcpConfig
  /**
   * Child documents (.md files in skill directory or subdirectories)
   * Excludes skill.md
   */
  readonly childDocs?: SkillChildDoc[]
  /**
   * Resource files for AI on-demand access
   * All non-.md files in skill directory or subdirectories
   * Includes code, data, documents, images, binary files, etc.
   */
  readonly resources?: SkillResource[]
}

/**
 * README.md prompt data structure
 */
export interface ReadmePrompt extends Prompt<PromptKind.Readme> {
  readonly type: PromptKind.Readme
  /**
   * Project name this README belongs to
   */
  readonly projectName: string
  /**
   * Target output directory relative to workspace
   */
  readonly targetDir: RelativePath
  /**
   * Whether this is a root README (in project root) or child README (in subdirectory)
   */
  readonly isRoot: boolean
}
