import type {ILogger} from '@truenine/logger'
import type {
  CodeStylesOptions,
  ConfigLoaderOptions,
  ConfigLoadResult,
  FrontMatterOptions,
  UserConfigFile,
  WindowsOptions
} from './plugins/plugin-core'
import * as fs from 'node:fs'
import process from 'node:process'
import {createLogger} from '@truenine/logger'
import {
  buildConfigDiagnostic,
  buildFileOperationDiagnostic,
  diagnosticLines,
  toErrorMessage,
  splitDiagnosticText
} from './diagnostics'
import {
  getSupportedPluginConfigKeysMessage,
  ZUserConfigFile
} from './plugins/plugin-core'
import {
  getRequiredGlobalConfigPath,
  resolveRuntimeEnvironment,
  resolveUserPath,
  DEFAULT_GLOBAL_CONFIG_FILE_NAME as RUNTIME_DEFAULT_CONFIG_FILE_NAME,
  DEFAULT_GLOBAL_CONFIG_DIR as RUNTIME_DEFAULT_GLOBAL_CONFIG_DIR
} from './runtime-environment'

export const DEFAULT_CONFIG_FILE_NAME = '.tnmsc.json'

export const DEFAULT_GLOBAL_CONFIG_DIR = '.aindex'

export function getGlobalConfigPath(): string {
  return getRequiredGlobalConfigPath()
}

export interface GlobalConfigValidationResult {
  readonly valid: boolean
  readonly exists: boolean
  readonly errors: readonly string[]
  readonly shouldExit: boolean
}

export class ConfigLoader {
  private readonly logger: ILogger

  constructor(options: ConfigLoaderOptions = {}) {
    void options
    this.logger = createLogger('ConfigLoader')
  }

  getSearchPaths(cwd: string = process.cwd()): string[] {
    void cwd
    const runtimeEnvironment = resolveRuntimeEnvironment()

    if (!runtimeEnvironment.isWsl) return [getRequiredGlobalConfigPath()]

    this.logger.info('wsl environment detected', {
      effectiveHomeDir: runtimeEnvironment.effectiveHomeDir
    })
    if (runtimeEnvironment.selectedGlobalConfigPath == null) {
      throw new Error(
        `WSL host config file not found under "${runtimeEnvironment.windowsUsersRoot}/*/${DEFAULT_GLOBAL_CONFIG_DIR}/${DEFAULT_CONFIG_FILE_NAME}".`
      )
    }
    this.logger.info('using wsl host global config', {
      path: runtimeEnvironment.selectedGlobalConfigPath
    })
    return [getRequiredGlobalConfigPath()]
  }

  loadFromFile(filePath: string): ConfigLoadResult {
    const resolvedPath = this.resolveTilde(filePath)

    if (!fs.existsSync(resolvedPath)) return {config: {}, source: null, found: false}

    try {
      const content = fs.readFileSync(resolvedPath, 'utf8')
      const config = this.parseConfig(content, resolvedPath)

      this.logger.debug('loaded', {source: resolvedPath})
      return {config, source: resolvedPath, found: true}
    }
    catch (error) {
      const errorMessage = toErrorMessage(error)

      if (errorMessage.startsWith('Invalid JSON in ') || errorMessage.startsWith('Config validation failed in ')) {
        this.logger.error(buildConfigDiagnostic({
          code: 'CONFIG_FILE_VALIDATION_FAILED',
          title: 'Config file validation failed',
          reason: splitDiagnosticText(errorMessage),
          configPath: resolvedPath,
          exactFix: diagnosticLines(
            'Fix the invalid config entries so the file matches the tnmsc schema.'
          ),
          possibleFixes: [
            diagnosticLines(
              `If the error is under "plugins", only use supported keys: ${getSupportedPluginConfigKeysMessage()}`
            )
          ],
          details: {
            errorMessage
          }
        }))
      } else {
        this.logger.error(buildFileOperationDiagnostic({
          code: 'CONFIG_FILE_LOAD_FAILED',
          title: 'Failed to load config file',
          operation: 'read',
          targetKind: 'config file',
          path: resolvedPath,
          error
        }))
      }

      throw error instanceof Error ? error : new Error(errorMessage)
    }
  }

  load(cwd: string = process.cwd()): MergedConfigResult {
    const searchPaths = this.getSearchPaths(cwd)
    const loadedConfigs: ConfigLoadResult[] = []

    for (const searchPath of searchPaths) {
      const result = this.loadFromFile(searchPath)
      if (result.found) loadedConfigs.push(result)
    }

    const merged = this.mergeConfigs(loadedConfigs.map(r => r.config))
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

    const errors = result.error.issues.map((i: {path: (string | number)[], message: string}) => `${i.path.join('.')}: ${i.message}`)
    throw new Error(`Config validation failed in ${filePath}:\n${errors.join('\n')}`)
  }

  private mergeConfigs(configs: UserConfigFile[]): UserConfigFile {
    if (configs.length === 0) return {}

    const firstConfig = configs[0]
    if (configs.length === 1 && firstConfig != null) return firstConfig

    const reversed = [...configs].reverse()

    return reversed.reduce<UserConfigFile>((acc, config) => {
      const mergedCodeStyles = this.mergeCodeStylesOptions(acc.codeStyles, config.codeStyles)
      const mergedFrontMatter = this.mergeFrontMatterOptions(acc.frontMatter, config.frontMatter)
      const mergedWindows = this.mergeWindowsOptions(acc.windows, config.windows)

      return {
        ...acc,
        ...config,
        ...mergedCodeStyles != null ? {codeStyles: mergedCodeStyles} : {},
        ...mergedFrontMatter != null ? {frontMatter: mergedFrontMatter} : {},
        ...mergedWindows != null ? {windows: mergedWindows} : {}
      }
    }, {})
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

  private mergeCodeStylesOptions(
    a?: CodeStylesOptions,
    b?: CodeStylesOptions
  ): CodeStylesOptions | undefined {
    if (a == null && b == null) return void 0
    if (a == null) return b
    if (b == null) return a
    return {...a, ...b}
  }

  private mergeWindowsOptions(
    a?: WindowsOptions,
    b?: WindowsOptions
  ): WindowsOptions | undefined {
    if (a == null && b == null) return void 0
    if (a == null) return b
    if (b == null) return a

    return {
      ...a,
      ...b,
      ...a.wsl2 != null || b.wsl2 != null
        ? {
            wsl2: {
              ...a.wsl2,
              ...b.wsl2
            }
          }
        : {}
    }
  }

  private resolveTilde(p: string): string {
    return p.startsWith('~') ? resolveUserPath(p) : p
  }
}

export interface MergedConfigResult {
  readonly config: UserConfigFile
  readonly sources: readonly string[]
  readonly found: boolean
}

let defaultLoader: ConfigLoader | null = null

export function getConfigLoader(options?: ConfigLoaderOptions): ConfigLoader {
  if (options || !defaultLoader) defaultLoader = new ConfigLoader(options)
  return defaultLoader
}

export function loadUserConfig(cwd?: string): MergedConfigResult {
  return getConfigLoader().load(cwd)
}

export function validateGlobalConfig(): GlobalConfigValidationResult {
  const logger = createLogger('ConfigLoader')
  let configPath: string

  try {
    configPath = getRequiredGlobalConfigPath()
  }
  catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error(buildConfigDiagnostic({
      code: 'GLOBAL_CONFIG_PATH_RESOLUTION_FAILED',
      title: 'Failed to resolve global config path',
      reason: diagnosticLines(errorMessage),
      configPath: `${RUNTIME_DEFAULT_GLOBAL_CONFIG_DIR}/${RUNTIME_DEFAULT_CONFIG_FILE_NAME}`,
      exactFix: diagnosticLines(
        'Ensure the required global config exists in the expected runtime-specific location before running tnmsc again.'
      )
    }))
    return {
      valid: false,
      exists: false,
      errors: [errorMessage],
      shouldExit: true
    }
  }

  if (!fs.existsSync(configPath)) {
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
