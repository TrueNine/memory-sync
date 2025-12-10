/**
 * ConfigLoader - Loads plugin configuration with priority-based merging
 * Supports: user config > workspace config > default config
 *
 * @see Requirements 11.1, 11.2, 11.3, 11.4
 */

import type { InputPlugin, InputPluginFactory, OutputPlugin, OutputPluginFactory, PluginGlobalOptions } from './types'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import fs from 'fs-extra'
import { ValidationError } from './types'
import { applyDefaultOptions, DEFAULT_PLUGIN_OPTIONS, validatePluginGlobalOptions } from './validation'

/**
 * Extended plugin configuration with input/output plugin separation
 */
export interface ExtendedPluginConfig {
  /**
   * Input plugins (Phase 1)
   */
  inputPlugins?: (InputPlugin | InputPluginFactory)[] | undefined
  /**
   * Output plugins (Phase 2)
   */
  outputPlugins?: (OutputPlugin | OutputPluginFactory)[] | undefined
  /**
   * Global options
   */
  options?: PluginGlobalOptions | undefined
  /**
   * Output target configuration
   */
  outputTargets?: {
    workspaceGroups?: Record<string, string>
    workspaces?: Record<string, WorkspaceConfig>
    globalConfigs?: Record<string, string>
  } | undefined
  /**
   * Exclusion patterns
   */
  excludePatterns?: string[] | undefined
}

/**
 * Workspace configuration
 */
export interface WorkspaceConfig {
  path: string
  editorConfig?: EditorConfigMapping[]
  agenticConfig?: AgenticConfigOptions
}

/**
 * Editor config mapping
 */
export interface EditorConfigMapping {
  source: string
  target: string
}

/**
 * Agentic config options
 */
export interface AgenticConfigOptions {
  markdown?: {
    frontMatterType?: string
    contentInjection?: ContentInjectionOptions
  }
  nonMarkdown?: {
    copyOnly: boolean
  }
  subCategories?: {
    fastCommand?: string
    subAgent?: string
    powerSkill?: string
  }
}

/**
 * Content injection options
 */
export interface ContentInjectionOptions {
  prepend?: string
  append?: string
  priority?: number
}

/**
 * Configuration source with priority
 */
export interface ConfigSource {
  /**
   * Source type identifier
   */
  type: 'user' | 'workspace' | 'default'
  /**
   * File path (null for default config)
   */
  path: string | null
  /**
   * Priority (lower = higher priority)
   * user: 0, workspace: 1, default: 2
   */
  priority: number
}

/**
 * Options for ConfigLoader
 */
export interface ConfigLoaderOptions {
  /**
   * Root directory to search for workspace config
   * Default: process.cwd()
   */
  root?: string
  /**
   * Config file name
   * Default: plugins.config.ts
   */
  configFile?: string
  /**
   * User config directory
   * Default: ~/.aindex
   */
  userConfigDir?: string
  /**
   * Default input plugins to use when config file is missing
   */
  defaultInputPlugins?: (InputPlugin | InputPluginFactory)[]
  /**
   * Default output plugins to use when config file is missing
   */
  defaultOutputPlugins?: (OutputPlugin | OutputPluginFactory)[]
  /**
   * Default global options
   */
  defaultOptions?: PluginGlobalOptions
}

/**
 * Result of config loading
 */
export interface ConfigLoadResult {
  /**
   * Merged configuration
   */
  config: ExtendedPluginConfig
  /**
   * Sources that were loaded (in priority order)
   */
  sources: ConfigSource[]
  /**
   * Whether using default config only
   */
  isDefault: boolean
  /**
   * Errors encountered during loading (non-fatal)
   */
  errors: ConfigLoadError[]
}

/**
 * Error encountered during config loading
 * @see Requirement 11.3
 */
export interface ConfigLoadError {
  /**
   * File path where error occurred
   */
  filePath: string
  /**
   * Error message
   */
  message: string
  /**
   * Original error
   */
  cause?: Error | undefined
}

/**
 * Default config file name (TypeScript)
 */
const DEFAULT_CONFIG_FILE = 'plugins.config.ts'

/**
 * JSON config file name (for code-free configuration changes)
 * @see Requirement 2.5
 */
const JSON_CONFIG_FILE = 'plugins.config.json'

/**
 * Default user config directory
 */
const DEFAULT_USER_CONFIG_DIR = '.aindex'

/**
 * Default global options for plugin execution (Requirement 2.2)
 * Uses centralized defaults from validation module
 */
const DEFAULT_GLOBAL_OPTIONS: PluginGlobalOptions = DEFAULT_PLUGIN_OPTIONS

/**
 * Config module interface for type safety
 */
interface ConfigModule {
  default?: ExtendedPluginConfig
  inputPlugins?: (InputPlugin | InputPluginFactory)[]
  outputPlugins?: (OutputPlugin | OutputPluginFactory)[]
  options?: PluginGlobalOptions
  outputTargets?: ExtendedPluginConfig['outputTargets']
  excludePatterns?: string[]
}

/**
 * Deep merge two objects, with source taking precedence
 * Arrays are replaced, not merged
 */
function deepMerge<T extends Record<string, unknown>>(
  target: T,
  source: Partial<T>,
): T {
  const result = { ...target }

  for (const key of Object.keys(source) as Array<keyof T>) {
    const sourceValue = source[key]
    const targetValue = target[key]

    // Skip null or undefined values
    if (sourceValue == null) {
      continue
    }

    // Check if both values are non-null objects (not arrays)
    const isSourceObject = typeof sourceValue === 'object' && !Array.isArray(sourceValue)
    const isTargetObject = targetValue != null && typeof targetValue === 'object' && !Array.isArray(targetValue)

    if (isSourceObject && isTargetObject) {
      // Recursively merge objects
      result[key] = deepMerge(
        targetValue as Record<string, unknown>,
        sourceValue as Record<string, unknown>,
      ) as T[keyof T]
    } else {
      // Replace value (including arrays)
      result[key] = sourceValue as T[keyof T]
    }
  }

  return result
}

/**
 * ConfigLoader class for loading plugin configuration
 * Supports priority-based loading: user config > workspace config > default config
 *
 * @see Requirements 11.1, 11.2, 11.3, 11.4
 */
export class ConfigLoader {
  private options: Required<Omit<ConfigLoaderOptions, 'defaultInputPlugins' | 'defaultOutputPlugins' | 'defaultOptions'>> & {
    defaultInputPlugins: (InputPlugin | InputPluginFactory)[]
    defaultOutputPlugins: (OutputPlugin | OutputPluginFactory)[]
    defaultOptions: PluginGlobalOptions
  }

  constructor(options: ConfigLoaderOptions = {}) {
    this.options = {
      root: options.root ?? process.cwd(),
      configFile: options.configFile ?? DEFAULT_CONFIG_FILE,
      userConfigDir: options.userConfigDir ?? DEFAULT_USER_CONFIG_DIR,
      defaultInputPlugins: options.defaultInputPlugins ?? [],
      defaultOutputPlugins: options.defaultOutputPlugins ?? [],
      defaultOptions: options.defaultOptions ?? DEFAULT_GLOBAL_OPTIONS,
    }
  }

  /**
   * Get the user config file path
   * @see Requirement 11.1
   */
  getUserConfigPath(): string {
    return path.join(os.homedir(), this.options.userConfigDir, this.options.configFile)
  }

  /**
   * Get the workspace config file path
   * @see Requirement 11.1
   */
  getWorkspaceConfigPath(): string {
    return path.join(this.options.root, this.options.configFile)
  }

  /**
   * Check if user config file exists
   */
  async userConfigExists(): Promise<boolean> {
    return fs.pathExists(this.getUserConfigPath())
  }

  /**
   * Check if workspace config file exists
   */
  async workspaceConfigExists(): Promise<boolean> {
    return fs.pathExists(this.getWorkspaceConfigPath())
  }

  /**
   * Get default configuration
   * @see Requirement 11.4
   */
  getDefaultConfig(): ExtendedPluginConfig {
    return {
      inputPlugins: this.options.defaultInputPlugins,
      outputPlugins: this.options.defaultOutputPlugins,
      options: this.options.defaultOptions,
    }
  }

  /**
   * Load a JSON config file (for code-free configuration changes)
   * JSON config files only support options and excludePatterns
   * Plugins must be defined in TypeScript config files
   *
   * @param filePath - Path to JSON config file
   * @returns Loaded config or null if not found/invalid
   * @see Requirements 2.5, 11.3
   */
  private async loadJsonConfigFile(filePath: string): Promise<{
    config: ExtendedPluginConfig | null
    error: ConfigLoadError | null
  }> {
    const exists = await fs.pathExists(filePath)
    if (!exists) {
      return { config: null, error: null }
    }

    try {
      const jsonContent = await fs.readJson(filePath) as Record<string, unknown>

      // JSON config only supports options and excludePatterns
      // Plugins require TypeScript for factory functions
      const config: ExtendedPluginConfig = {
        options: jsonContent['options'] as PluginGlobalOptions | undefined,
        outputTargets: jsonContent['outputTargets'] as ExtendedPluginConfig['outputTargets'],
        excludePatterns: jsonContent['excludePatterns'] as string[] | undefined,
      }

      // Validate options if present (Requirement 2.3)
      if (config.options != null) {
        try {
          validatePluginGlobalOptions(config.options)
        } catch (validationError) {
          const errorMsg = validationError instanceof ValidationError
            ? `Invalid configuration: ${validationError.message} (field: ${validationError.field})`
            : String(validationError)
          return {
            config: null,
            error: {
              filePath,
              message: errorMsg,
              cause: validationError instanceof Error ? validationError : void 0,
            },
          }
        }
      }

      return { config, error: null }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      const configError: ConfigLoadError = {
        filePath,
        message: `Failed to load JSON config: ${errorMsg}`,
      }
      if (error instanceof Error) {
        configError.cause = error
      }
      return {
        config: null,
        error: configError,
      }
    }
  }

  /**
   * Load a single config file (TypeScript)
   * @param filePath - Path to config file
   * @returns Loaded config or null if not found/invalid
   * @see Requirement 11.3
   */
  private async loadConfigFile(filePath: string): Promise<{
    config: ExtendedPluginConfig | null
    error: ConfigLoadError | null
  }> {
    const exists = await fs.pathExists(filePath)
    if (!exists) {
      return { config: null, error: null }
    }

    try {
      // Dynamic import for TypeScript config files
      const configModule = await import(filePath) as ConfigModule
      const loadedConfig = configModule.default ?? configModule

      const config: ExtendedPluginConfig = {
        inputPlugins: loadedConfig.inputPlugins,
        outputPlugins: loadedConfig.outputPlugins,
        options: loadedConfig.options,
        outputTargets: loadedConfig.outputTargets,
        excludePatterns: loadedConfig.excludePatterns,
      }

      // Validate options if present (Requirement 2.3)
      if (config.options != null) {
        try {
          validatePluginGlobalOptions(config.options)
        } catch (validationError) {
          const errorMsg = validationError instanceof ValidationError
            ? `Invalid configuration: ${validationError.message} (field: ${validationError.field})`
            : String(validationError)
          return {
            config: null,
            error: {
              filePath,
              message: errorMsg,
              cause: validationError instanceof Error ? validationError : void 0,
            },
          }
        }
      }

      return { config, error: null }
    } catch (error) {
      // Report error with file path and parse error (Requirement 11.3)
      const errorMsg = error instanceof Error ? error.message : String(error)
      const configError: ConfigLoadError = {
        filePath,
        message: `Failed to load config: ${errorMsg}`,
      }
      if (error instanceof Error) {
        configError.cause = error
      }
      return {
        config: null,
        error: configError,
      }
    }
  }

  /**
   * Merge multiple configurations in priority order
   * Higher priority (lower index) overrides lower priority
   * @see Requirements 11.2, 2.2
   */
  private mergeConfigs(configs: Array<ExtendedPluginConfig | null>): ExtendedPluginConfig {
    // Start with default config
    const merged = this.getDefaultConfig()

    // Merge in reverse order (lowest priority first)
    for (let i = configs.length - 1; i >= 0; i--) {
      const currentConfig = configs[i]
      // Skip null or undefined configs
      if (currentConfig == null) {
        continue
      }

      // Merge options deeply, applying defaults for missing values (Requirement 2.2)
      const configOptions = currentConfig.options
      if (configOptions != null) {
        const mergedOptions = deepMerge(
          (merged.options ?? {}) as Record<string, unknown>,
          configOptions as unknown as Record<string, unknown>,
        )
        merged.options = applyDefaultOptions<PluginGlobalOptions>(
          mergedOptions as Partial<PluginGlobalOptions>,
          DEFAULT_PLUGIN_OPTIONS,
        )
      }

      // Replace arrays (plugins, excludePatterns)
      const configInputPlugins = currentConfig.inputPlugins
      if (configInputPlugins != null) {
        merged.inputPlugins = configInputPlugins
      }
      const configOutputPlugins = currentConfig.outputPlugins
      if (configOutputPlugins != null) {
        merged.outputPlugins = configOutputPlugins
      }
      const configExcludePatterns = currentConfig.excludePatterns
      if (configExcludePatterns != null) {
        merged.excludePatterns = configExcludePatterns
      }

      // Merge outputTargets deeply
      const configOutputTargets = currentConfig.outputTargets
      if (configOutputTargets != null) {
        merged.outputTargets = deepMerge(
          (merged.outputTargets ?? {}) as Record<string, unknown>,
          configOutputTargets as unknown as Record<string, unknown>,
        ) as ExtendedPluginConfig['outputTargets']
      }
    }

    // Ensure final options have all defaults applied (Requirement 2.2)
    merged.options = applyDefaultOptions<PluginGlobalOptions>(
      merged.options as Partial<PluginGlobalOptions>,
      DEFAULT_PLUGIN_OPTIONS,
    )

    return merged
  }

  /**
   * Get the user JSON config file path (for code-free configuration)
   * @see Requirement 2.5
   */
  getUserJsonConfigPath(): string {
    return path.join(os.homedir(), this.options.userConfigDir, JSON_CONFIG_FILE)
  }

  /**
   * Get the workspace JSON config file path (for code-free configuration)
   * @see Requirement 2.5
   */
  getWorkspaceJsonConfigPath(): string {
    return path.join(this.options.root, JSON_CONFIG_FILE)
  }

  /**
   * Load configuration from files with priority ordering
   * Priority: user JSON > user TS > workspace JSON > workspace TS > default
   *
   * JSON config files allow configuration changes without code modifications (Requirement 2.5)
   * JSON configs only support options and excludePatterns, not plugin definitions
   *
   * @returns ConfigLoadResult with merged config and metadata
   * @see Requirements 11.1, 11.2, 11.3, 11.4, 2.5
   */
  async load(): Promise<ConfigLoadResult> {
    const sources: ConfigSource[] = []
    const errors: ConfigLoadError[] = []
    const configs: Array<ExtendedPluginConfig | null> = []

    // Load user JSON config (highest priority - code-free configuration)
    // @see Requirement 2.5
    const userJsonConfigPath = this.getUserJsonConfigPath()
    const userJsonResult = await this.loadJsonConfigFile(userJsonConfigPath)
    if (userJsonResult.error !== null) {
      errors.push(userJsonResult.error)
    }
    if (userJsonResult.config !== null) {
      configs.push(userJsonResult.config)
      sources.push({
        type: 'user',
        path: userJsonConfigPath,
        priority: 0,
      })
    }

    // Load user TypeScript config (second priority)
    const userConfigPath = this.getUserConfigPath()
    const userResult = await this.loadConfigFile(userConfigPath)
    if (userResult.error !== null) {
      errors.push(userResult.error)
    }
    if (userResult.config !== null) {
      configs.push(userResult.config)
      sources.push({
        type: 'user',
        path: userConfigPath,
        priority: 1,
      })
    }

    // Load workspace JSON config (third priority - code-free configuration)
    // @see Requirement 2.5
    const workspaceJsonConfigPath = this.getWorkspaceJsonConfigPath()
    const workspaceJsonResult = await this.loadJsonConfigFile(workspaceJsonConfigPath)
    if (workspaceJsonResult.error !== null) {
      errors.push(workspaceJsonResult.error)
    }
    if (workspaceJsonResult.config !== null) {
      configs.push(workspaceJsonResult.config)
      sources.push({
        type: 'workspace',
        path: workspaceJsonConfigPath,
        priority: 2,
      })
    }

    // Load workspace TypeScript config (fourth priority)
    const workspaceConfigPath = this.getWorkspaceConfigPath()
    const workspaceResult = await this.loadConfigFile(workspaceConfigPath)
    if (workspaceResult.error !== null) {
      errors.push(workspaceResult.error)
    }
    if (workspaceResult.config !== null) {
      configs.push(workspaceResult.config)
      sources.push({
        type: 'workspace',
        path: workspaceConfigPath,
        priority: 3,
      })
    }

    // Add default config source
    sources.push({
      type: 'default',
      path: null,
      priority: 4,
    })

    // Merge configurations (Requirement 11.2)
    const mergedConfig = this.mergeConfigs(configs)

    // Determine if using default only (Requirement 11.4)
    const isDefault = configs.every((c) => c === null)

    return {
      config: mergedConfig,
      sources,
      isDefault,
      errors,
    }
  }

  /**
   * Load configuration synchronously (for simple cases)
   * Note: This only works with default config, not file-based config
   * @see Requirement 11.4
   */
  loadSync(): ConfigLoadResult {
    // For sync loading, we cannot dynamically import
    // Return defaults only
    return {
      config: this.getDefaultConfig(),
      sources: [{
        type: 'default',
        path: null,
        priority: 2,
      }],
      isDefault: true,
      errors: [],
    }
  }
}

/**
 * Create a config loader with default plugins
 */
export function createConfigLoader(options?: ConfigLoaderOptions): ConfigLoader {
  return new ConfigLoader(options)
}

/**
 * Resolve input plugins from config, expanding plugin factories
 */
export function resolveInputPlugins(
  plugins: (InputPlugin | InputPluginFactory)[],
  options?: Record<string, Record<string, unknown>>,
): InputPlugin[] {
  return plugins.map((pluginOrFactory) => {
    if (typeof pluginOrFactory === 'function') {
      const pluginOptions = options?.[pluginOrFactory.name] ?? {}
      return pluginOrFactory(pluginOptions)
    }
    return pluginOrFactory
  })
}

/**
 * Resolve output plugins from config, expanding plugin factories
 */
export function resolveOutputPlugins(
  plugins: (OutputPlugin | OutputPluginFactory)[],
  options?: Record<string, Record<string, unknown>>,
): OutputPlugin[] {
  return plugins.map((pluginOrFactory) => {
    if (typeof pluginOrFactory === 'function') {
      const pluginOptions = options?.[pluginOrFactory.name] ?? {}
      return pluginOrFactory(pluginOptions)
    }
    return pluginOrFactory
  })
}

/**
 * Check if a plugin is enabled based on config
 */
export function isPluginEnabled(
  pluginName: string,
  enabledPlugins?: string[],
  disabledPlugins?: string[],
): boolean {
  if (disabledPlugins?.includes(pluginName) === true) {
    return false
  }
  if (enabledPlugins != null && enabledPlugins.length > 0) {
    return enabledPlugins.includes(pluginName)
  }
  return true
}

export default ConfigLoader
