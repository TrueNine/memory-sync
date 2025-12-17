import type { Logger } from '@/log'
import type { ConfigLoaderOptions, ConfigLoadResult, UserConfigFile } from '@/types/ConfigTypes'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import process from 'node:process'
import { createLogger } from '@/log'

/**
 * Default config file name
 */
export const DEFAULT_CONFIG_FILE_NAME = '.tnmsc.json'

/**
 * Default global config directory (relative to home)
 */
export const DEFAULT_GLOBAL_CONFIG_DIR = '.aindex'

/**
 * ConfigLoader handles discovery and loading of user configuration files.
 *
 * Search order (first found wins at each level):
 * 1. CWD: ./.tnmsc.json
 * 2. Global: ~/.aindex/.tnmsc.json
 *
 * Configurations are merged with later sources having lower priority.
 * CWD config overrides global config.
 */
export class ConfigLoader {
  private readonly configFileName: string
  private readonly searchCwd: boolean
  private readonly searchGlobal: boolean
  private readonly customSearchPaths: readonly string[]
  private readonly logger: Logger

  constructor(options: ConfigLoaderOptions = {}) {
    this.configFileName = options.configFileName ?? DEFAULT_CONFIG_FILE_NAME
    this.searchCwd = options.searchCwd ?? true
    this.searchGlobal = options.searchGlobal ?? true
    this.customSearchPaths = options.searchPaths ?? []
    this.logger = createLogger('ConfigLoader')
  }

  /**
   * Get all config file paths to search (in priority order)
   */
  getSearchPaths(cwd: string = process.cwd()): string[] {
    const paths: string[] = []

    // Custom search paths first (highest priority)
    for (const searchPath of this.customSearchPaths) {
      paths.push(this.resolveTilde(searchPath))
    }

    // CWD config
    if (this.searchCwd) {
      paths.push(path.join(cwd, this.configFileName))
    }

    // Global config (lowest priority)
    if (this.searchGlobal) {
      paths.push(path.join(os.homedir(), DEFAULT_GLOBAL_CONFIG_DIR, this.configFileName))
    }

    return paths
  }

  /**
   * Load configuration from a specific file path
   */
  loadFromFile(filePath: string): ConfigLoadResult {
    const resolvedPath = this.resolveTilde(filePath)

    try {
      if (!fs.existsSync(resolvedPath)) {
        return { config: {}, source: null, found: false }
      }

      const content = fs.readFileSync(resolvedPath, 'utf-8')
      const config = this.parseConfig(content, resolvedPath)

      this.logger.debug(`Loaded config from: ${resolvedPath}`)
      return { config, source: resolvedPath, found: true }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      this.logger.warn(`Failed to load config from ${resolvedPath}: ${errorMessage}`)
      return { config: {}, source: null, found: false }
    }
  }

  /**
   * Load and merge all configurations from search paths.
   * Returns merged config with sources information.
   */
  load(cwd: string = process.cwd()): MergedConfigResult {
    const searchPaths = this.getSearchPaths(cwd)
    const loadedConfigs: ConfigLoadResult[] = []

    for (const searchPath of searchPaths) {
      const result = this.loadFromFile(searchPath)
      if (result.found) {
        loadedConfigs.push(result)
      }
    }

    // Merge configs (first has highest priority)
    const merged = this.mergeConfigs(loadedConfigs.map((r) => r.config))
    const sources = loadedConfigs.map((r) => r.source).filter((s): s is string => s !== null)

    return {
      config: merged,
      sources,
      found: loadedConfigs.length > 0,
    }
  }

  /**
   * Parse JSON config content with validation
   */
  private parseConfig(content: string, filePath: string): UserConfigFile {
    try {
      const parsed: unknown = JSON.parse(content)

      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error('Config must be a JSON object')
      }

      return this.validateConfig(parsed as Record<string, unknown>, filePath)
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(`Invalid JSON in ${filePath}: ${error.message}`)
      }
      throw error
    }
  }

  /**
   * Validate config structure and types
   */
  private validateConfig(raw: Record<string, unknown>, filePath: string): UserConfigFile {
    const config: UserConfigFile = {}
    const errors: string[] = []

    // String fields
    const stringFields = [
      'workspaceDir',
      'shadowProjectDir',
      'shadowSkillSourceDir',
      'shadowFastCommandDir',
      'shadowSubAgentDir',
      'globalMemoryFile',
      'shadowSourceProjectDir',
    ] as const

    for (const field of stringFields) {
      if (field in raw) {
        if (typeof raw[field] === 'string') {
          (config as Record<string, unknown>)[field] = raw[field]
        } else {
          errors.push(`${field} must be a string`)
        }
      }
    }

    // logLevel validation
    if ('logLevel' in raw) {
      const validLevels = ['trace', 'debug', 'info', 'warn', 'error']
      const logLevelValue = raw['logLevel']
      if (typeof logLevelValue === 'string' && validLevels.includes(logLevelValue)) {
        (config as Record<string, unknown>)['logLevel'] = logLevelValue
      } else {
        errors.push(`logLevel must be one of: ${validLevels.join(', ')}`)
      }
    }

    // externalProjects validation
    if ('externalProjects' in raw) {
      const externalProjectsValue = raw['externalProjects']
      if (Array.isArray(externalProjectsValue)) {
        if (externalProjectsValue.every((p) => typeof p === 'string')) {
          (config as Record<string, unknown>)['externalProjects'] = externalProjectsValue
        } else {
          errors.push('externalProjects must be an array of strings')
        }
      } else {
        errors.push('externalProjects must be an array')
      }
    }

    // excludePatterns validation
    if ('excludePatterns' in raw) {
      const excludePatternsValue = raw['excludePatterns']
      if (typeof excludePatternsValue === 'object' && excludePatternsValue !== null) {
        const patterns = excludePatternsValue as Record<string, unknown>
        const validPatterns: Record<string, string[]> = {}
        let valid = true

        for (const [key, value] of Object.entries(patterns)) {
          if (Array.isArray(value) && value.every((v) => typeof v === 'string')) {
            validPatterns[key] = value
          } else {
            errors.push(`excludePatterns.${key} must be an array of strings`)
            valid = false
          }
        }

        if (valid) {
          (config as Record<string, unknown>)['excludePatterns'] = validPatterns
        }
      } else {
        errors.push('excludePatterns must be an object')
      }
    }

    if (errors.length > 0) {
      this.logger.warn(`Config validation warnings in ${filePath}:\n  - ${errors.join('\n  - ')}`)
    }

    return config
  }

  /**
   * Merge multiple configs (first has highest priority)
   */
  private mergeConfigs(configs: UserConfigFile[]): UserConfigFile {
    if (configs.length === 0) {
      return {}
    }

    const firstConfig = configs[0]
    if (configs.length === 1 && firstConfig != null) {
      return firstConfig
    }

    // Reverse to merge from lowest to highest priority
    const reversed = [...configs].reverse()

    return reversed.reduce<UserConfigFile>((acc, config) => {
      const mergedExternalProjects = [
        ...(acc.externalProjects ?? []),
        ...(config.externalProjects ?? []),
      ]
      const mergedExcludePatterns = this.mergeExcludePatterns(
        acc.excludePatterns,
        config.excludePatterns,
      )

      return {
        ...acc,
        ...config,
        // Merge arrays - only include if non-empty
        ...(mergedExternalProjects.length > 0 ? { externalProjects: mergedExternalProjects } : {}),
        // Deep merge excludePatterns - only include if defined
        ...(mergedExcludePatterns != null ? { excludePatterns: mergedExcludePatterns } : {}),
      }
    }, {})
  }

  private mergeExcludePatterns(
    a?: Record<string, string[]>,
    b?: Record<string, string[]>,
  ): Record<string, string[]> | null {
    if (a == null && b == null) {
      return null
    }
    if (a == null) {
      return b ?? null
    }
    if (b == null) {
      return a
    }

    const result: Record<string, string[]> = { ...a }
    for (const [key, patterns] of Object.entries(b)) {
      result[key] = [...(result[key] ?? []), ...patterns]
    }
    return result
  }

  private resolveTilde(p: string): string {
    if (p.startsWith('~')) {
      return path.join(os.homedir(), p.slice(1))
    }
    return p
  }
}

/**
 * Result of loading and merging all configurations
 */
export interface MergedConfigResult {
  /**
   * Merged configuration
   */
  readonly config: UserConfigFile

  /**
   * List of source files that were loaded (in priority order)
   */
  readonly sources: readonly string[]

  /**
   * Whether any config file was found
   */
  readonly found: boolean
}

/**
 * Singleton instance for convenience
 */
let defaultLoader: ConfigLoader | null = null

/**
 * Get or create the default ConfigLoader instance
 */
export function getConfigLoader(options?: ConfigLoaderOptions): ConfigLoader {
  if (options || !defaultLoader) {
    defaultLoader = new ConfigLoader(options)
  }
  return defaultLoader
}

/**
 * Load user configuration using default loader
 */
export function loadUserConfig(cwd?: string): MergedConfigResult {
  return getConfigLoader().load(cwd)
}
