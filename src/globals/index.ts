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
 * @example {tool.websearch}, {tool.webfetch}
 */
export interface ToolReferences {
  websearch?: string
  webfetch?: string
  [key: string]: string | undefined
}

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
 * Operating system information
 * @example {os.platform}, {os.arch}, {os.shellKind}
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
  [key: string]: string | ShellKind | undefined
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

export {}
