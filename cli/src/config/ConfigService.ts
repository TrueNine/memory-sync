/**
 * Configuration service for the TNMSC configuration system.
 *
 * This module provides a singleton service for loading, validating,
 * and accessing configuration from ~/.aindex/.tnmsc.json
 */

import type {ConfigLoadResult, ConfigServiceOptions, TnmscConfig} from './types'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  ConfigError,
  ConfigFileNotFoundError,
  ConfigParseError,
  ConfigPermissionError,
  ConfigValidationError
} from './errors'
import {clearPathCache} from './pathResolver'
import {PathResolver} from './paths'
import {validateConfig} from './schema'

/**
 * Default configuration file name.
 */
export const DEFAULT_CONFIG_FILE_NAME = '.tnmsc.json'

/**
 * Default global configuration directory (relative to home).
 */
export const DEFAULT_GLOBAL_CONFIG_DIR = '.aindex'

/**
 * Get the default global configuration file path.
 *
 * @returns The absolute path to ~/.aindex/.tnmsc.json
 */
export function getDefaultConfigPath(): string {
  return path.join(os.homedir(), DEFAULT_GLOBAL_CONFIG_DIR, DEFAULT_CONFIG_FILE_NAME)
}

/**
 * Configuration service singleton for managing TNMSC configuration.
 *
 * This service provides:
 * - Singleton access to configuration across the application
 * - Automatic validation of configuration files
 * - Runtime configuration reloading
 * - Comprehensive error handling
 */
export class ConfigService {
  private static instance: ConfigService | null = null

  private config: TnmscConfig | null = null
  private configPath: string
  private loadError: ConfigError | null = null
  private pathResolver: PathResolver | null = null

  private constructor(options: ConfigServiceOptions = {}) {
    this.configPath = options.configPath ?? getDefaultConfigPath()
  }

  static getInstance(options?: ConfigServiceOptions): ConfigService {
    ConfigService.instance ??= new ConfigService(options)
    return ConfigService.instance
  }

  static resetInstance(): void {
    ConfigService.instance = null
  }

  load(): TnmscConfig {
    this.loadError = null

    if (!fs.existsSync(this.configPath)) { // Check if file exists
      this.loadError = new ConfigFileNotFoundError(this.configPath)
      throw this.loadError
    }

    let content: string // Read file content
    try {
      content = fs.readFileSync(this.configPath, 'utf8')
    }
    catch (error) {
      const configError = new ConfigPermissionError(
        this.configPath,
        error instanceof Error ? error : new Error(String(error))
      )
      this.loadError = configError
      throw configError
    }

    let parsed: unknown // Parse JSON
    try {
      parsed = JSON.parse(content)
    }
    catch (error) {
      if (error instanceof SyntaxError) {
        const configError = new ConfigParseError(this.configPath, error)
        this.loadError = configError
        throw configError
      }
      throw error
    }

    try { // Validate configuration
      this.config = validateConfig(parsed)
      clearPathCache() // Clear path cache when config is reloaded
      return this.config
    }
    catch (error) {
      if (error instanceof Error && error.name === 'ZodError') {
        const zodError = error as unknown as {issues: {path: (string | number)[], message: string}[]}
        const validationErrors = zodError.issues.map(
          issue => `${issue.path.join('.')}: ${issue.message}`
        )
        const configError = new ConfigValidationError(this.configPath, validationErrors)
        this.loadError = configError
        throw configError
      }
      throw error
    }
  }

  safeLoad(): ConfigLoadResult {
    const config = this.load()
    return {
      config,
      source: this.configPath,
      found: true
    }
  }

  reload(): TnmscConfig {
    this.config = null
    this.pathResolver = null
    return this.load()
  }

  getPathResolver(): PathResolver {
    if (this.config === null) {
      throw new ConfigError(
        'Configuration has not been loaded. Call load() first.',
        this.configPath
      )
    }
    this.pathResolver ??= new PathResolver(this.config)
    return this.pathResolver
  }

  getConfig(): TnmscConfig {
    if (this.config === null) {
      throw new ConfigError(
        'Configuration has not been loaded. Call load() first.',
        this.configPath
      )
    }
    return this.config
  }

  isLoaded(): boolean {
    return this.config !== null
  }

  getLastError(): ConfigError | null {
    return this.loadError
  }

  getConfigPath(): string {
    return this.configPath
  }

  setConfigPath(configPath: string): void {
    this.configPath = configPath
    this.config = null // Reset loaded config
    this.loadError = null
    this.pathResolver = null
  }
}

/**
 * Convenience function to get the ConfigService singleton instance.
 *
 * @param options - Optional configuration options
 * @returns The ConfigService instance
 */
export function getConfigService(options?: ConfigServiceOptions): ConfigService {
  return ConfigService.getInstance(options)
}

/**
 * Load configuration using the default ConfigService instance.
 *
 * @returns The loaded configuration
 * @throws {ConfigError} If loading or validation fails
 */
export function loadConfig(): TnmscConfig {
  return getConfigService().load()
}

/**
 * Safely load configuration using the default ConfigService instance.
 *
 * @returns The load result with success flag
 */
export function safeLoadConfig(): ConfigLoadResult {
  return getConfigService().safeLoad()
}
