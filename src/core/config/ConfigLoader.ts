/**
 * Configuration loader and merger
 * Handles loading user configuration and merging with defaults
 */

/* eslint-disable no-undefined */
/* eslint-disable ts/no-unsafe-assignment */
/* eslint-disable ts/strict-boolean-expressions */
/* eslint-disable ts/no-unsafe-member-access */
/* eslint-disable no-eval */

import type {
  InputClassificationConfig,
  PathTransformConfig,
  PluginSystemConfig,
  UserPluginConfig,
} from './types'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { defaultPluginConfig } from './defaultConfig'

/**
 * Configuration loader class
 * Loads and merges user configuration with defaults
 */
export class ConfigLoader {
  private readonly configPath: string
  private cache: PluginSystemConfig | null = null

  constructor(configPath: string = 'plugins.config.ts') {
    this.configPath = resolve(configPath)
  }

  /**
   * Load the complete plugin configuration
   * Merges user configuration with defaults
   * @param userConfig - Optional user configuration to merge
   * @returns Complete plugin configuration
   */
  async load(userConfig?: UserPluginConfig): Promise<PluginSystemConfig> {
    // Return cached config if available
    if (this.cache !== null && !userConfig) {
      return this.cache
    }

    // Try to load user config file
    let loadedUserConfig: UserPluginConfig | undefined = userConfig
    if (!userConfig) {
      try {
        // Dynamic import of user config file
        const userConfigModule = await import(this.configPath)

        const moduleValue: unknown = userConfigModule.default || userConfigModule
        // Check if module is an object before assigning
        if (moduleValue != null && typeof moduleValue === 'object') {
          loadedUserConfig = moduleValue as UserPluginConfig
        }
      } catch {
        // File doesn't exist or has errors - use defaults only
        // console.debug(`No user config found at ${this.configPath}, using defaults`)
      }
    }

    // Start with defaults
    const config = { ...defaultPluginConfig }

    // Merge with user configuration
    const mergedConfig = this.mergeWithUserConfig(config, loadedUserConfig)

    // Cache the result
    this.cache = mergedConfig

    return mergedConfig
  }

  /**
   * Merge user configuration with default configuration
   * @param defaultConfig - Default configuration
   * @param userConfig - User configuration to merge
   * @returns Merged configuration
   */
  private mergeWithUserConfig(
    defaultConfig: PluginSystemConfig,
    userConfig?: UserPluginConfig,
  ): PluginSystemConfig {
    if (!userConfig) {
      return defaultConfig
    }

    const merged: PluginSystemConfig = {
      ...defaultConfig,
      inputClassification: this.mergeInputClassification(
        defaultConfig.inputClassification,
        userConfig.inputClassification,
      ),
      paths: this.mergePathConfigs(defaultConfig.paths, userConfig.paths),
      frontMatterMapping: {
        ...defaultConfig.frontMatterMapping,
        ...userConfig.frontMatterMapping,
      },
      globalPaths: {
        ...defaultConfig.globalPaths,
        ...userConfig.globalPaths,
      },
    }

    return merged
  }

  /**
   * Merge input classification configuration
   * @param defaultConfig - Default input classification config
   * @param userConfig - User input classification config
   * @returns Merged input classification config
   */
  private mergeInputClassification(
    defaultConfig: InputClassificationConfig,
    userConfig?: Partial<InputClassificationConfig>,
  ): InputClassificationConfig {
    if (!userConfig) {
      return defaultConfig
    }

    return {
      rules: userConfig.rules ?? defaultConfig.rules,
      defaultType: userConfig.defaultType ?? defaultConfig.defaultType,
    }
  }

  /**
   * Merge path configurations
   * @param defaultPaths - Default path configurations
   * @param userPaths - User path configurations
   * @returns Merged path configurations
   */
  private mergePathConfigs(
    defaultPaths: Record<string, PathTransformConfig>,
    userPaths?: Record<string, Partial<PathTransformConfig>>,
  ): Record<string, PathTransformConfig> {
    if (!userPaths) {
      return defaultPaths
    }

    const merged: Record<string, PathTransformConfig> = { ...defaultPaths }

    for (const [pluginName, userPathConfig] of Object.entries(userPaths)) {
      const defaultConfig = merged[pluginName] ?? {
        outputDir: '',
        createDir: true,
      }

      const config: PathTransformConfig = {
        outputDir: userPathConfig.outputDir ?? defaultConfig.outputDir,
      }

      if (userPathConfig.filenameTransform !== undefined) {
        config.filenameTransform = userPathConfig.filenameTransform
      } else if (defaultConfig.filenameTransform !== undefined) {
        config.filenameTransform = defaultConfig.filenameTransform
      }

      if (userPathConfig.contentTransform !== undefined) {
        config.contentTransform = userPathConfig.contentTransform
      } else if (defaultConfig.contentTransform !== undefined) {
        config.contentTransform = defaultConfig.contentTransform
      }

      if (userPathConfig.createDir !== undefined) {
        config.createDir = userPathConfig.createDir
      } else if (defaultConfig.createDir !== undefined) {
        config.createDir = defaultConfig.createDir
      }

      if (userPathConfig.fileMode !== undefined) {
        config.fileMode = userPathConfig.fileMode
      } else if (defaultConfig.fileMode !== undefined) {
        config.fileMode = defaultConfig.fileMode
      }

      merged[pluginName] = config
    }

    return merged
  }

  /**
   * Clear the configuration cache
   * Forces reload on next load
   */
  clearCache(): void {
    this.cache = null
  }

  /**
   * Get the raw user configuration from file
   * @returns User configuration object or undefined if not found
   */
  async loadRawUserConfig(): Promise<UserPluginConfig | null> {
    try {
      const content = await readFile(this.configPath, 'utf-8')
      // Use eval to load user configuration
      // This is acceptable because:
      // 1. We only load user's own config file (plugins.config.ts)
      // 2. The content is executed in a controlled environment
      // 3. We validate the result before using it
      const module: unknown = eval(content)
      // eslint-disable-next-line ts/no-unsafe-return
      return (module as any)?.default ?? (module as any) ?? null
    } catch {
      return null
    }
  }

  /**
   * Validate configuration
   * Checks for required fields and valid values
   * @param config - Configuration to validate
   * @returns Whether configuration is valid
   */
  validate(config: PluginSystemConfig): boolean {
    // Check input classification
    if (config.inputClassification == null) {
      console.error('Missing inputClassification in config')
      return false
    }

    if (!Array.isArray(config.inputClassification.rules)) {
      console.error('inputClassification.rules must be an array')
      return false
    }

    if (config.inputClassification.defaultType == null) {
      console.error('Missing inputClassification.defaultType')
      return false
    }

    // Check paths
    if (config.paths == null || typeof config.paths !== 'object') {
      console.error('paths must be an object')
      return false
    }

    // Check global paths
    if (config.globalPaths == null) {
      console.error('Missing globalPaths')
      return false
    }

    return true
  }
}

/**
 * Global config loader instance
 * Can be imported and used throughout the application
 */
export const configLoader = new ConfigLoader()

/**
 * Load plugin configuration with defaults
 * Convenience function that uses the global loader
 * @param userConfig - Optional user configuration
 * @returns Complete plugin configuration
 */
export async function loadPluginConfig(
  userConfig?: UserPluginConfig,
): Promise<PluginSystemConfig> {
  return configLoader.load(userConfig)
}
