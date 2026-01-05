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
 * Global scope available in MDX expressions
 */
export interface MdxGlobalScope {
  profile: UserProfile
  tool: ToolReferences
  env: EnvironmentContext
  os: OsInfo
}

declare global {
  const profile: UserProfile
  const tool: ToolReferences
  const env: EnvironmentContext
  const os: OsInfo
}

export { }
