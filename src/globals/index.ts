// src/globals/index.ts
// Global type declarations for MDX expression scope.
// These types are available to users when writing MDX templates.

/**
 * User profile information
 * @example {profile.name}, {profile.username}
 */
export interface UserProfile {
  name?: string
  username?: string
  gender?: string
  birthday?: string
  [key: string]: unknown
}

/**
 * Tool references for AI assistants
 * @example {tool.websearch}, {tool.webfetch}, {tool.readFile}
 */
export interface ToolReferences {
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
  /** Allow custom tool references */
  [key: string]: string | undefined
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
  },
  /** Claude Code CLI tool names (PascalCase) */
  claudeCode: {
    readFile: 'Read',
    writeFile: 'Write',
    executeCommand: 'Execute',
    todolistWrite: 'TodoWrite',
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
  },
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
  Unknown = 'unknown',
}

/**
 * Operating system kind enumeration
 * Simplified OS type for conditional logic in templates
 * @example {os.kind === 'mac' ? 'macOS specific' : 'other'}
 */
export enum OsKind {
  Win = 'win',
  Mac = 'mac',
  Linux = 'linux',
  Unknown = 'unknown',
}

/**
 * Operating system information
 * @example {os.platform}, {os.arch}, {os.shellKind}, {os.kind}
 */
export interface OsInfo {
  platform?: string
  arch?: string
  hostname?: string
  homedir?: string
  tmpdir?: string
  type?: string
  release?: string
  shellKind?: ShellKind
  kind?: OsKind
  [key: string]: string | ShellKind | OsKind | undefined
}

/**
 * Md component props - wrapper for conditional Markdown content
 * @example <Md when={os.kind === 'mac'}>macOS specific content</Md>
 */
export interface MdProps {
  /** Condition for rendering content. If omitted, content always renders. */
  when?: boolean
  /** Child content to render when condition is met */
  children?: unknown
}

/**
 * Md.Line component props - inline conditional text
 * @example <Md.Line when={os.kind === 'win'}>PowerShell</Md.Line>
 */
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
  /**
   * Block-level conditional Markdown wrapper
   * @param props - Component props including optional `when` condition
   * @returns Rendered content or nothing if condition is false
   */
  (props: MdProps): unknown
  /**
   * Inline conditional text component
   * @param props - Component props including optional `when` condition
   * @returns Inline text or nothing if condition is false
   */
  Line: (props: MdLineProps) => unknown
}

/**
 * Global scope available in MDX expressions
 */
export interface MdxGlobalScope {
  /** User profile information */
  profile: UserProfile
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
  const profile: UserProfile
  /** Tool name references for AI assistants */
  const tool: ToolReferences
  /** Environment variables context */
  const env: EnvironmentContext
  /** Operating system information */
  const os: OsInfo
  /** Conditional Markdown component with Line sub-component */
  const Md: MdComponent
}

export { }
