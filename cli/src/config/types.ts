/**
 * Configuration types for the TNMSC configuration system.
 *
 * This module defines TypeScript interfaces that match the exact JSON
 * configuration structure located at ~/.aindex/.tnmsc.json
 */

/**
 * Module path pair containing source and distribution paths.
 * Both paths are relative to the workspace directory.
 */
export interface ModulePaths {
  /** Source path (human-authored files) */
  readonly src: string
  /** Output/compiled path (read by the system) */
  readonly dist: string
}

/**
 * Aindex configuration containing all module paths.
 * This replaces the previous shadowSourceProject configuration.
 */
export interface AindexConfig {
  /** Name of the aindex configuration */
  readonly name: string
  /** Skills module paths */
  readonly skills: ModulePaths
  /** Commands module paths */
  readonly commands: ModulePaths
  /** Sub-agents module paths */
  readonly subAgents: ModulePaths
  /** Rules module paths */
  readonly rules: ModulePaths
  /** Global prompt file paths */
  readonly globalPrompt: ModulePaths
  /** Workspace prompt file paths */
  readonly workspacePrompt: ModulePaths
  /** Application module paths */
  readonly app: ModulePaths
  /** Extension module paths */
  readonly ext: ModulePaths
  /** Architecture module paths */
  readonly arch: ModulePaths
}

/**
 * User profile information.
 */
export interface Profile {
  /** Display name of the user */
  readonly name: string
  /** Username/login identifier */
  readonly username: string
  /** Gender of the user */
  readonly gender: string
  readonly birthday: string
}

/**
 * Log level options for the application.
 */
export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error'

/**
 * Main TNMSC configuration interface.
 * This matches the structure of ~/.aindex/.tnmsc.json
 */
export interface TnmscConfig {
  readonly version: string
  /** Workspace directory path (supports ~ for home directory) */
  readonly workspaceDir: string
  /** Aindex module configuration */
  readonly aindex: AindexConfig
  /** Log level setting */
  readonly logLevel: LogLevel
  /** User profile information */
  readonly profile: Profile
}

/**
 * Configuration load result containing the config and metadata.
 */
export interface ConfigLoadResult {
  /** The loaded configuration */
  readonly config: TnmscConfig
  /** Path to the configuration file */
  readonly source: string
  /** Whether the configuration was found and loaded */
  readonly found: boolean
}

/**
 * Configuration service options.
 */
export interface ConfigServiceOptions {
  /** Custom path to the configuration file */
  readonly configPath?: string
  /** Whether to cache the configuration after loading */
  readonly enableCache?: boolean
}

/**
 * Resolved paths for an aindex module.
 */
export interface ResolvedModulePaths {
  /** Absolute source path */
  readonly absoluteSrc: string
  /** Absolute distribution path */
  readonly absoluteDist: string
  /** Source path relative to workspace */
  readonly relativeSrc: string
  /** Distribution path relative to workspace */
  readonly relativeDist: string
}
