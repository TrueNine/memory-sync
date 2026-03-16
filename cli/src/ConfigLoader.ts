import type {
  AindexConfig,
  CleanupProtectionOptions,
  ConfigLoaderOptions,
  ConfigLoadResult,
  FrontMatterOptions,
  ILogger,
  OutputScopeOptions,
  PluginOutputScopeTopics,
  UserConfigFile
} from './plugins/plugin-core'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import process from 'node:process'
import {
  buildConfigDiagnostic,
  buildFileOperationDiagnostic,
  diagnosticLines,
  splitDiagnosticText
} from './diagnostics'
import {createLogger, ZUserConfigFile} from './plugins/plugin-core'

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
 * The config source is fixed and unambiguous:
 * 1. Global: ~/.aindex/.tnmsc.json
 */
export class ConfigLoader {
  private readonly logger: ILogger

  constructor(_options: ConfigLoaderOptions = {}) {
    this.logger = createLogger('ConfigLoader')
  }

  getSearchPaths(_cwd: string = process.cwd()): string[] {
    return [getGlobalConfigPath()]
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
      this.logger.warn(buildFileOperationDiagnostic({
        code: 'CONFIG_FILE_LOAD_FAILED',
        title: 'Failed to load config file',
        operation: 'read',
        targetKind: 'config file',
        path: resolvedPath,
        error
      }))
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
      const mergedOutputScopes = this.mergeOutputScopeOptions(acc.outputScopes, config.outputScopes)
      const mergedFrontMatter = this.mergeFrontMatterOptions(acc.frontMatter, config.frontMatter)
      const mergedCleanupProtection = this.mergeCleanupProtectionOptions(
        acc.cleanupProtection,
        config.cleanupProtection
      )

      return {
        ...acc,
        ...config,
        ...mergedAindex != null ? {aindex: mergedAindex} : {},
        ...mergedOutputScopes != null ? {outputScopes: mergedOutputScopes} : {},
        ...mergedFrontMatter != null ? {frontMatter: mergedFrontMatter} : {},
        ...mergedCleanupProtection != null ? {cleanupProtection: mergedCleanupProtection} : {}
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

  private mergeOutputScopeTopics(
    a?: PluginOutputScopeTopics,
    b?: PluginOutputScopeTopics
  ): PluginOutputScopeTopics | undefined {
    if (a == null && b == null) return void 0
    if (a == null) return b
    if (b == null) return a
    return {...a, ...b}
  }

  private mergeOutputScopeOptions(
    a?: OutputScopeOptions,
    b?: OutputScopeOptions
  ): OutputScopeOptions | undefined {
    if (a == null && b == null) return void 0
    if (a == null) return b
    if (b == null) return a

    const mergedPlugins: Record<string, PluginOutputScopeTopics> = {}
    for (const [pluginName, topics] of Object.entries(a.plugins ?? {})) {
      if (topics != null) mergedPlugins[pluginName] = {...topics}
    }
    for (const [pluginName, topics] of Object.entries(b.plugins ?? {})) {
      const mergedTopics = this.mergeOutputScopeTopics(mergedPlugins[pluginName], topics)
      if (mergedTopics != null) mergedPlugins[pluginName] = mergedTopics
    }

    if (Object.keys(mergedPlugins).length === 0) return {}
    return {plugins: mergedPlugins}
  }

  private mergeFrontMatterOptions(
    a?: FrontMatterOptions,
    b?: FrontMatterOptions
  ): FrontMatterOptions | undefined {
    if (a == null && b == null) return void 0
    if (a == null) return b
    if (b == null) return a
    return {...a, ...b}
  }

  private mergeCleanupProtectionOptions(
    a?: CleanupProtectionOptions,
    b?: CleanupProtectionOptions
  ): CleanupProtectionOptions | undefined {
    if (a == null && b == null) return void 0
    if (a == null) return b
    if (b == null) return a

    return {
      rules: [
        ...a.rules ?? [],
        ...b.rules ?? []
      ]
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
    logger.error(buildConfigDiagnostic({
      code: 'GLOBAL_CONFIG_MISSING',
      title: 'Global config file is missing',
      reason: diagnosticLines(
        `tnmsc could not find the required global config file at "${configPath}".`
      ),
      configPath,
      exactFix: diagnosticLines(
        'Create the global config file manually before running tnmsc again.'
      ),
      possibleFixes: [
        diagnosticLines('Initialize the file with a valid JSON object, for example `{}`.')
      ]
    }))
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
    logger.error(buildFileOperationDiagnostic({
      code: 'GLOBAL_CONFIG_READ_FAILED',
      title: 'Failed to read global config file',
      operation: 'read',
      targetKind: 'global config file',
      path: configPath,
      error: errorMessage
    }))
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
    logger.error(buildConfigDiagnostic({
      code: 'GLOBAL_CONFIG_JSON_INVALID',
      title: 'Global config contains invalid JSON',
      reason: diagnosticLines(
        `tnmsc could not parse the JSON in "${configPath}".`,
        `Parser error: ${errorMessage}`
      ),
      configPath,
      exactFix: diagnosticLines(
        'Fix the JSON syntax in the global config file so it parses as a single JSON object.'
      ),
      possibleFixes: [
        diagnosticLines('Validate the file with a JSON parser and remove trailing commas or invalid tokens.')
      ]
    }))
    return {
      valid: false,
      exists: true,
      errors: [`Invalid JSON: ${errorMessage}`],
      shouldExit: true
    }
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    logger.error(buildConfigDiagnostic({
      code: 'GLOBAL_CONFIG_NOT_OBJECT',
      title: 'Global config must be a JSON object',
      reason: diagnosticLines(
        `tnmsc parsed "${configPath}" successfully, but the top-level value is not a JSON object.`
      ),
      configPath,
      exactFix: diagnosticLines(
        'Replace the top-level JSON value with an object like `{}` or a valid config object.'
      )
    }))
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
    for (const err of errors) {
      logger.error(buildConfigDiagnostic({
        code: 'GLOBAL_CONFIG_VALIDATION_FAILED',
        title: 'Global config validation failed',
        reason: splitDiagnosticText(err),
        configPath,
        exactFix: diagnosticLines(
          'Update the invalid config field so it matches the tnmsc schema.'
        ),
        possibleFixes: [
          diagnosticLines('Compare the field name and value against the current config schema or examples.')
        ],
        details: {
          validationError: err
        }
      }))
    }
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
