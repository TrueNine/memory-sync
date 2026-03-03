import type {AindexConfig, ConfigLoaderOptions, ConfigLoadResult, ILogger, UserConfigFile} from './plugins/plugin-shared'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import process from 'node:process'
import {convertUserConfigAindexToShadowSourceProject, createLogger, DEFAULT_USER_CONFIG, ZUserConfigFile} from './plugins/plugin-shared'

/**
 * Default config file name
 */
export const DEFAULT_CONFIG_FILE_NAME = '.tnmsc.json'

/**
 * Default global config directory (relative to home)
 */
export const DEFAULT_GLOBAL_CONFIG_DIR = '.aindex'

/**
 * Get global config file path
 */
export function getGlobalConfigPath(): string {
  return path.join(os.homedir(), DEFAULT_GLOBAL_CONFIG_DIR, DEFAULT_CONFIG_FILE_NAME)
}

/**
 * Get default user config content
 * Uses build-time injected template from public/tnmsc.example.json
 * @deprecated Config is now required - no default config is provided
 */
export function getDefaultUserConfig(): UserConfigFile {
  return {...DEFAULT_USER_CONFIG}
}

/**
 * Validation result for global config
 */
export interface GlobalConfigValidationResult {
  readonly valid: boolean

  readonly exists: boolean

  readonly errors: readonly string[]

  readonly shouldExit: boolean
}

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
  private readonly logger: ILogger

  constructor(options: ConfigLoaderOptions = {}) {
    this.configFileName = options.configFileName ?? DEFAULT_CONFIG_FILE_NAME
    this.searchCwd = options.searchCwd ?? true
    this.searchGlobal = options.searchGlobal ?? true
    this.customSearchPaths = options.searchPaths ?? []
    this.logger = createLogger('ConfigLoader')
  }

  getSearchPaths(cwd: string = process.cwd()): string[] {
    const paths: string[] = []

    for (const searchPath of this.customSearchPaths) paths.push(this.resolveTilde(searchPath)) // Custom search paths first (highest priority)

    if (this.searchCwd) paths.push(path.join(cwd, this.configFileName)) // CWD config

    if (this.searchGlobal) paths.push(path.join(os.homedir(), DEFAULT_GLOBAL_CONFIG_DIR, this.configFileName)) // Global config (lowest priority)

    return paths
  }

  loadFromFile(filePath: string): ConfigLoadResult {
    const resolvedPath = this.resolveTilde(filePath)

    try {
      if (!fs.existsSync(resolvedPath)) return {config: {}, source: null, found: false}

      const content = fs.readFileSync(resolvedPath, 'utf8')
      const config = this.parseConfig(content, resolvedPath)

      this.logger.debug('loaded', {source: resolvedPath})
      return {config, source: resolvedPath, found: true}
    }
    catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error) // Parse/validation failure - throw error instead of silently returning empty config
      throw new Error(`Failed to load config from ${resolvedPath}: ${errorMessage}`)
    }
  }

  load(cwd: string = process.cwd()): MergedConfigResult {
    const searchPaths = this.getSearchPaths(cwd)
    const loadedConfigs: ConfigLoadResult[] = []

    for (const searchPath of searchPaths) {
      const result = this.loadFromFile(searchPath)
      if (result.found) loadedConfigs.push(result)
    }

    if (loadedConfigs.length === 0) { // No config found - throw error instead of returning empty config
      throw new Error(`No valid config file found. Searched: ${searchPaths.join(', ')}`)
    }

    const merged = this.mergeConfigs(loadedConfigs.map(r => r.config)) // Merge configs (first has highest priority)
    const sources = loadedConfigs.map(r => r.source).filter((s): s is string => s !== null)

    return {
      config: merged,
      sources,
      found: true
    }
  }

  private parseConfig(content: string, filePath: string): UserConfigFile {
    let parsed: unknown
    try {
      parsed = JSON.parse(content)
    }
    catch (error) {
      if (error instanceof SyntaxError) throw new Error(`Invalid JSON in ${filePath}: ${error.message}`)
      throw error
    }

    const result = ZUserConfigFile.safeParse(parsed)
    if (result.success) {
      return convertUserConfigAindexToShadowSourceProject(result.data) // Convert aindex format to shadowSourceProject format if needed
    }

    const errors = result.error.issues.map((i: {path: (string | number)[], message: string}) => `${i.path.join('.')}: ${i.message}`) // Validation failed - throw error instead of returning empty config
    throw new Error(`Config validation failed in ${filePath}:\n${errors.join('\n')}`)
  }

  private mergeConfigs(configs: UserConfigFile[]): UserConfigFile {
    if (configs.length === 0) return {}

    const firstConfig = configs[0]
    if (configs.length === 1 && firstConfig != null) return firstConfig

    const reversed = [...configs].reverse() // Reverse to merge from lowest to highest priority

    return reversed.reduce<UserConfigFile>((acc, config) => {
      const mergedAindex = this.mergeAindex(acc.aindex, config.aindex)

      return {
        ...acc,
        ...config,
        ...mergedAindex != null ? {aindex: mergedAindex} : {}
      }
    }, {})
  }

  private mergeAindex(
    a?: AindexConfig,
    b?: AindexConfig
  ): AindexConfig | undefined {
    if (a == null && b == null) return void 0
    if (a == null) return b
    if (b == null) return a
    return {
      dir: b.dir ?? a.dir,
      skills: {...a.skills, ...b.skills},
      commands: {...a.commands, ...b.commands},
      subAgents: {...a.subAgents, ...b.subAgents},
      rules: {...a.rules, ...b.rules},
      globalPrompt: {...a.globalPrompt, ...b.globalPrompt},
      workspacePrompt: {...a.workspacePrompt, ...b.workspacePrompt},
      app: {...a.app, ...b.app},
      ext: {...a.ext, ...b.ext},
      arch: {...a.arch, ...b.arch}
    }
  }

  private resolveTilde(p: string): string {
    if (p.startsWith('~')) return path.join(os.homedir(), p.slice(1))
    return p
  }
}

/**
 * Result of loading and merging all configurations
 */
export interface MergedConfigResult {
  readonly config: UserConfigFile

  readonly sources: readonly string[]

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
  if (options || !defaultLoader) defaultLoader = new ConfigLoader(options)
  return defaultLoader
}

/**
 * Load user configuration using default loader
 */
export function loadUserConfig(cwd?: string): MergedConfigResult {
  return getConfigLoader().load(cwd)
}

/**
 * Validate global config file strictly.
 * - If config doesn't exist: return invalid result (do not auto-create)
 * - If config is invalid (parse error or validation error): return invalid result (do not recreate)
 *
 * @returns Validation result indicating whether program should continue or exit
 */
export function validateGlobalConfig(): GlobalConfigValidationResult {
  const logger = createLogger('ConfigLoader')
  const configPath = getGlobalConfigPath()

  if (!fs.existsSync(configPath)) { // Check if config file exists - do not auto-create
    const error = `Global config not found at ${configPath}. Please create it manually.`
    logger.error(error)
    return {
      valid: false,
      exists: false,
      errors: [error],
      shouldExit: true
    }
  }

  let content: string
  try {
    content = fs.readFileSync(configPath, 'utf8')
  }
  catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('failed to read global config', {path: configPath, error: errorMessage})
    return {
      valid: false,
      exists: true,
      errors: [`Failed to read config: ${errorMessage}`],
      shouldExit: true
    }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  }
  catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('invalid JSON in global config', {path: configPath, error: errorMessage})
    return {
      valid: false,
      exists: true,
      errors: [`Invalid JSON: ${errorMessage}`],
      shouldExit: true
    }
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    logger.error('global config must be a JSON object', {path: configPath})
    return {
      valid: false,
      exists: true,
      errors: ['Config must be a JSON object'],
      shouldExit: true
    }
  }

  const zodResult = ZUserConfigFile.safeParse(parsed)
  if (!zodResult.success) {
    const errors = zodResult.error.issues.map((i: {path: (string | number)[], message: string}) => `${i.path.join('.')}: ${i.message}`)
    for (const err of errors) logger.error('config validation error', {path: configPath, error: err})
    return {
      valid: false,
      exists: true,
      errors,
      shouldExit: true
    }
  }

  return {
    valid: true,
    exists: true,
    errors: [],
    shouldExit: false
  }
}

/**
 * @deprecated Use validateGlobalConfig() instead. This function is kept for backward compatibility
 * but no longer auto-creates default config.
 */
export function validateAndEnsureGlobalConfig(): GlobalConfigValidationResult {
  return validateGlobalConfig()
}
