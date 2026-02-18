import type {UserProfile} from '@truenine/md-compiler/globals'

/**
 * A source/dist path pair for a shadow source project resource.
 * Both paths are relative to the shadow source project root.
 */
export interface ShadowSourceProjectDirPair {
  /** Source path (human-authored .cn.mdx files) */
  readonly src: string
  /** Output/compiled path (read by input plugins) */
  readonly dist: string
}

/**
 * Nested configuration for the shadow source project.
 * All paths are relative to `<workspaceDir>/<name>`.
 */
export interface ShadowSourceProjectConfig {
  readonly name: string
  readonly skill: ShadowSourceProjectDirPair
  readonly fastCommand: ShadowSourceProjectDirPair
  readonly subAgent: ShadowSourceProjectDirPair
  readonly rule: ShadowSourceProjectDirPair
  readonly globalMemory: ShadowSourceProjectDirPair
  readonly workspaceMemory: ShadowSourceProjectDirPair
  readonly project: ShadowSourceProjectDirPair
}

/**
 * User configuration file schema (.tnmsc.json)
 * This represents the JSON structure users can provide in config files.
 * All fields are optional - missing fields use default values.
 */
export interface UserConfigFile {
  readonly version?: string

  readonly workspaceDir?: string

  readonly shadowSourceProject?: ShadowSourceProjectConfig

  readonly logLevel?: 'trace' | 'debug' | 'info' | 'warn' | 'error'

  readonly fastCommandSeriesOptions?: FastCommandSeriesOptions

  readonly profile?: UserProfile
}

/**
 * Result of loading a config file
 */
export interface ConfigLoadResult {
  readonly config: UserConfigFile

  readonly source: string | null

  readonly found: boolean
}

/**
 * Per-plugin fast command series override options
 */
export interface FastCommandSeriesPluginOverride {
  readonly includeSeriesPrefix?: boolean

  readonly seriesSeparator?: string
}

/**
 * Fast command series configuration options
 */
export interface FastCommandSeriesOptions {
  readonly includeSeriesPrefix?: boolean

  readonly pluginOverrides?: Record<string, FastCommandSeriesPluginOverride>
}

/**
 * Options for ConfigLoader
 */
export interface ConfigLoaderOptions {
  readonly configFileName?: string

  readonly searchPaths?: readonly string[]

  readonly searchCwd?: boolean

  readonly searchGlobal?: boolean
}
