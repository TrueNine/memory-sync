/**
 * // These types are available to users when writing MDX templates. // Global type declarations for MDX expression scope. // src/globals/index.ts
 * User profile information
 * @example {profile.name}, {profile.username}
 */
export interface UserProfile {
  [key: string]: unknown
  name?: string
  username?: string
  gender?: string
  birthday?: string
}

/**
 * User code style preferences
 * @example {codeStyles.indent}, {codeStyles.tabSize}
 */
export interface CodeStylePreferences {
  [key: string]: unknown
  indent?: 'tab' | 'space'
  tabSize?: number
}

/**
 * Tool references for AI assistants
 * @example {tool.websearch}, {tool.webfetch}, {tool.readFile}
 */
export interface ToolReferences {
  /** Allow custom tool references */
  [key: string]: string | undefined
  /** Web search tool name */
  websearch?: string
  /** Web fetch tool name */
  webfetch?: string
  /** Read file tool name */
  readFile?: string
  /** Write file tool name */
  writeFile?: string
  /** Execute command/shell tool name */
  executeCommand?: string
  /** Todolist write tool name */
  todolistWrite?: string
  /** Grep/search tool name */
  grep?: string
  /** List directory tool name */
  listDirectory?: string
}

/**
 * Tool name presets for different AI tools.
 * Each preset provides tool name mappings specific to that AI tool.
 */
export const ToolPresets = {
  /** Default tool names (snake_case) */
  default: {
    websearch: 'web_search',
    webfetch: 'web_fetch',
    readFile: 'read_file',
    writeFile: 'write_file',
    executeCommand: 'execute_command',
    todolistWrite: 'todolist_write',
    grep: 'grep',
    listDirectory: 'list_directory'
  },
  /** Claude Code CLI tool names (PascalCase) */
  claudeCode: {
    readFile: 'Read',
    writeFile: 'Write',
    executeCommand: 'Execute',
    todolistWrite: 'TodoWrite',
    listDirectory: 'List'
  },
  /** Kiro tool names */
  kiro: {
    websearch: 'remote_web_search',
    webfetch: 'webFetch',
    readFile: 'readFile',
    writeFile: 'fsWrite',
    executeCommand: 'executeBash',
    todolistWrite: 'todolistWrite',
    grep: 'grepSearch',
    listDirectory: 'listDir'
  }
} as const satisfies Record<string, Partial<ToolReferences>>

/**
 * Environment context
 * @example {env.NODE_ENV}, {env.DEBUG}
 */
export interface EnvironmentContext {
  [key: string]: unknown
}

/**
 * Shell kind enumeration
 */
export enum ShellKind {
  Bash = 'bash',
  Zsh = 'zsh',
  Fish = 'fish',
  Sh = 'sh',
  PowerShell = 'powershell',
  Pwsh = 'pwsh',
  Cmd = 'cmd',
  Unknown = 'unknown'
}

export enum OsKind {
  Win = 'win',
  Mac = 'mac',
  Linux = 'linux',
  Unknown = 'unknown'
}

/**
 * Operating system information
 * @example {os.platform}, {os.arch}, {os.shellKind}, {os.kind}
 */
export interface OsInfo {
  [key: string]: string | ShellKind | OsKind | undefined
  platform?: string
  arch?: string
  hostname?: string
  homedir?: string
  tmpdir?: string
  type?: string
  release?: string
  shellKind?: ShellKind
  kind?: OsKind
}

export interface MdProps {
  /** Condition for rendering content. If omitted, content always renders. */
  when?: boolean
  /** Child content to render when condition is met */
  children?: unknown
}

export interface MdLineProps {
  /** Condition for rendering content. If omitted, content always renders. */
  when?: boolean
  /** Inline text content to render when condition is met */
  children?: unknown
}

/**
 * Md component type with Line sub-component
 */
export interface MdComponent {
  (props: MdProps): unknown
  Line: (props: MdLineProps) => unknown
}

/**
 * Global scope available in MDX expressions
 */
export interface MdxGlobalScope {
  /** User profile information */
  profile: UserProfile
  /** User code style preferences */
  codeStyles: CodeStylePreferences
  /** Tool name references for AI assistants */
  tool: ToolReferences
  /** Environment variables context */
  env: EnvironmentContext
  /** Operating system information */
  os: OsInfo
  /** Conditional Markdown component with Line sub-component */
  Md: MdComponent
}

declare global {
  /** User profile information */
  const profile: UserProfile,
    /** User code style preferences */
    codeStyles: CodeStylePreferences,
    /** Tool name references for AI assistants */
    tool: ToolReferences,
    /** Environment variables context */
    env: EnvironmentContext,
    /** Operating system information */
    os: OsInfo,
    /** Conditional Markdown component with Line sub-component */
    Md: MdComponent

  // eslint-disable-next-line ts/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'Md': MdProps
      'Md.Line': MdLineProps
    }
  }
}

export { }
