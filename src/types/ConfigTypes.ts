/**
 * User configuration file schema (.tnmsc.json)
 * This represents the JSON structure users can provide in config files.
 * All fields are optional - missing fields use default values.
 */
export interface UserConfigFile {
  /**
   * Workspace directory path
   * @default ~/project
   */
  readonly workspaceDir?: string

  /**
   * Shadow project directory path
   * @default $WORKSPACE/aindex
   */
  readonly shadowProjectDir?: string

  /**
   * Shadow skill source directory
   * @default $SHADOW_PROJECT/dist/skills
   */
  readonly shadowSkillSourceDir?: string

  /**
   * Shadow fast command directory
   * @default $SHADOW_PROJECT/dist/commands
   */
  readonly shadowFastCommandDir?: string

  /**
   * Shadow sub-agent directory
   * @default $SHADOW_PROJECT/dist/agents
   */
  readonly shadowSubAgentDir?: string

  /**
   * Global memory file path
   * @default $SHADOW_PROJECT/dist/GLOBAL.md
   */
  readonly globalMemoryFile?: string

  /**
   * Shadow source project directory
   * @default $SHADOW_PROJECT/ref
   */
  readonly shadowSourceProjectDir?: string

  /**
   * External project paths outside workspace
   */
  readonly externalProjects?: readonly string[]

  /**
   * Exclude patterns per project
   */
  readonly excludePatterns?: Record<string, string[]>

  /**
   * Log level
   */
  readonly logLevel?: 'trace' | 'debug' | 'info' | 'warn' | 'error'

  /**
   * Fast command series options for controlling prefix handling in output filenames
   */
  readonly fastCommandSeriesOptions?: FastCommandSeriesOptions
}

/**
 * Result of loading a config file
 */
export interface ConfigLoadResult {
  /**
   * The loaded configuration (empty object if not found)
   */
  readonly config: UserConfigFile

  /**
   * Path where config was found, null if not found
   */
  readonly source: string | null

  /**
   * Whether the config file was found and loaded successfully
   */
  readonly found: boolean
}

/**
 * Per-plugin fast command series override options
 */
export interface FastCommandSeriesPluginOverride {
  /**
   * Whether to include series prefix in output filenames for this plugin
   */
  readonly includeSeriesPrefix?: boolean

  /**
   * Separator between series and command name for this plugin
   */
  readonly seriesSeparator?: string
}

/**
 * Fast command series configuration options
 */
export interface FastCommandSeriesOptions {
  /**
   * Whether to include series prefix in output filenames
   * @default true
   */
  readonly includeSeriesPrefix?: boolean

  /**
   * Per-plugin overrides for series handling
   * Key is the plugin name
   */
  readonly pluginOverrides?: Record<string, FastCommandSeriesPluginOverride>
}

/**
 * Options for ConfigLoader
 */
export interface ConfigLoaderOptions {
  /**
   * Custom config file name
   * @default .tnmsc.json
   */
  readonly configFileName?: string

  /**
   * Custom search paths (in priority order, first found wins for each level)
   * Supports ~ for home directory
   */
  readonly searchPaths?: readonly string[]

  /**
   * Whether to search in cwd
   * @default true
   */
  readonly searchCwd?: boolean

  /**
   * Whether to search in global location (~/.aindex)
   * @default true
   */
  readonly searchGlobal?: boolean
}
