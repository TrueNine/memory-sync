import type {ILogger} from '@/log'
import type {ConfigLoaderOptions, ConfigLoadResult, ShadowSourceProjectConfig, UserConfigFile} from '@/types/ConfigTypes.schema'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import process from 'node:process'
import {DEFAULT_USER_CONFIG} from '@/constants'
import {createLogger} from '@/log'
import {ZUserConfigFile} from '@/types/ConfigTypes.schema'

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
 */
export function getDefaultUserConfig(): UserConfigFile {
  return {...DEFAULT_USER_CONFIG}
}

/**
 * Write global config file
 */
function writeGlobalConfig(config: UserConfigFile, logger: ILogger): void {
  const configPath = getGlobalConfigPath()
  const configDir = path.dirname(configPath)

  if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, {recursive: true}) // Ensure directory exists

  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8') // Write with pretty formatting
  logger.info('global config created', {path: configPath})
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
      this.logger.warn('load failed', {path: resolvedPath, error})
      return {config: {}, source: null, found: false}
    }
  }

  load(cwd: string = process.cwd()): MergedConfigResult {
    const searchPaths = this.getSearchPaths(cwd)
    const loadedConfigs: ConfigLoadResult[] = []

    for (const searchPath of searchPaths) {
      const result = this.loadFromFile(searchPath)
      if (result.found) loadedConfigs.push(result)
    }

    const merged = this.mergeConfigs(loadedConfigs.map(r => r.config)) // Merge configs (first has highest priority)
    const sources = loadedConfigs.map(r => r.source).filter((s): s is string => s !== null)

    return {
      config: merged,
      sources,
      found: loadedConfigs.length > 0
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
    if (result.success) return result.data
    const errors = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`)
    this.logger.warn('validation warnings', {path: filePath, errors})
    return ZUserConfigFile.parse({}) // return empty valid config on partial failure
  }

  private mergeConfigs(configs: UserConfigFile[]): UserConfigFile {
    if (configs.length === 0) return {}

    const firstConfig = configs[0]
    if (configs.length === 1 && firstConfig != null) return firstConfig

    const reversed = [...configs].reverse() // Reverse to merge from lowest to highest priority

    return reversed.reduce<UserConfigFile>((acc, config) => {
      const mergedShadowSourceProject = this.mergeShadowSourceProject(acc.shadowSourceProject, config.shadowSourceProject)

      return {
        ...acc,
        ...config,
        ...mergedShadowSourceProject != null ? {shadowSourceProject: mergedShadowSourceProject} : {}
      }
    }, {})
  }

  private mergeShadowSourceProject(
    a?: ShadowSourceProjectConfig,
    b?: ShadowSourceProjectConfig
  ): ShadowSourceProjectConfig | undefined {
    if (a == null && b == null) return void 0
    if (a == null) return b
    if (b == null) return a
    return {
      name: b.name ?? a.name,
      skill: {...a.skill, ...b.skill},
      fastCommand: {...a.fastCommand, ...b.fastCommand},
      subAgent: {...a.subAgent, ...b.subAgent},
      rule: {...a.rule, ...b.rule},
      globalMemory: {...a.globalMemory, ...b.globalMemory},
      workspaceMemory: {...a.workspaceMemory, ...b.workspaceMemory},
      project: {...a.project, ...b.project}
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
 * - If config doesn't exist: create default config, log warn, continue
 * - If config is invalid (parse error or validation error): delete and recreate, log error, exit
 *
 * @returns Validation result indicating whether program should continue or exit
 */
export function validateAndEnsureGlobalConfig(): GlobalConfigValidationResult {
  const logger = createLogger('ConfigLoader')
  const configPath = getGlobalConfigPath()

  if (!fs.existsSync(configPath)) { // Check if config file exists
    logger.warn('global config not found, creating default config', {path: configPath})
    writeGlobalConfig(getDefaultUserConfig(), logger)
    return {
      valid: true,
      exists: false,
      errors: [],
      shouldExit: false
    }
  }

  let content: string // Try to read and parse config
  try {
    content = fs.readFileSync(configPath, 'utf8')
  }
  catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('failed to read global config', {path: configPath, error: errorMessage})
    return recreateConfigAndExit(configPath, logger, [`Failed to read config: ${errorMessage}`])
  }

  let parsed: unknown // Try to parse JSON
  try {
    parsed = JSON.parse(content)
  }
  catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('invalid JSON in global config', {path: configPath, error: errorMessage})
    return recreateConfigAndExit(configPath, logger, [`Invalid JSON: ${errorMessage}`])
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) { // Validate structure
    logger.error('global config must be a JSON object', {path: configPath})
    return recreateConfigAndExit(configPath, logger, ['Config must be a JSON object'])
  }

  const zodResult = ZUserConfigFile.safeParse(parsed) // Validate fields with Zod
  if (!zodResult.success) {
    const errors = zodResult.error.issues.map(i => `${i.path.join('.')}: ${i.message}`)
    for (const err of errors) logger.error('config validation error', {path: configPath, error: err})
    return recreateConfigAndExit(configPath, logger, errors)
  }

  return {
    valid: true,
    exists: true,
    errors: [],
    shouldExit: false
  }
}

/**
 * Delete invalid config, recreate with defaults, and return exit result
 */
function recreateConfigAndExit(configPath: string, logger: ILogger, errors: string[]): GlobalConfigValidationResult {
  try {
    fs.unlinkSync(configPath)
    logger.info('deleted invalid config', {path: configPath})
  }
  catch {
    logger.warn('failed to delete invalid config', {path: configPath})
  }

  writeGlobalConfig(getDefaultUserConfig(), logger)
  logger.error('recreated default config, please review and restart', {path: configPath})

  return {
    valid: false,
    exists: true,
    errors,
    shouldExit: true
  }
}
