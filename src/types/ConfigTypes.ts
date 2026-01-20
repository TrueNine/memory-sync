import type {UserProfile} from '@/globals'

/**
 * User configuration file schema (.tnmsc.json)
 * This represents the JSON structure users can provide in config files.
 * All fields are optional - missing fields use default values.
 */
export interface UserConfigFile {
  readonly workspaceDir?: string

  readonly shadowSourceProjectDir?: string

  readonly shadowSkillSourceDir?: string

  readonly shadowFastCommandDir?: string

  readonly shadowSubAgentDir?: string

  readonly globalMemoryFile?: string

  readonly shadowProjectsDir?: string

  readonly externalProjects?: readonly string[]

  readonly excludePatterns?: Record<string, string[]>

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
