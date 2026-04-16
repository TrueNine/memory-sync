import type {
  ConfigLoaderOptions,
  ConfigLoadResult,
  UserConfigFile
} from './adaptors/adaptor-core/ConfigTypes.schema'
import * as fs from 'node:fs'
import process from 'node:process'
import {createLogger} from '@/libraries/logger'
import {getNativeBinding} from './core/native-binding'
import {
  buildConfigDiagnostic,
  diagnosticLines,
  toErrorMessage
} from './diagnostics'
import {
  getRequiredGlobalConfigPath,
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
  constructor(_options: ConfigLoaderOptions = {}) {
    void _options
  }

  getSearchPaths(cwd: string = process.cwd()): string[] {
    void cwd
    return [getRequiredGlobalConfigPath()]
  }

  loadFromFile(filePath: string): ConfigLoadResult {
    const native = getNativeBinding<{loadConfigFromFile?: (filePath: string) => string | null}>()
    if (native?.loadConfigFromFile != null) {
      const result = native.loadConfigFromFile(filePath)
      if (result == null) return {config: {}, source: null, found: false}
      return {config: JSON.parse(result) as UserConfigFile, source: filePath, found: true}
    }

    throw new Error('Native loadConfigFromFile binding is unavailable')
  }

  load(cwd: string = process.cwd()): MergedConfigResult {
    const native = getNativeBinding<{loadConfig?: (cwd?: string) => string}>()
    if (native?.loadConfig != null) {
      const result = native.loadConfig(cwd)
      return JSON.parse(result) as MergedConfigResult
    }

    throw new Error('Native loadConfig binding is unavailable')
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

  // Simplified validation using native loadFromFile if possible
  try {
    const loader = getConfigLoader()
    const result = loader.loadFromFile(configPath)
    if (result.found) {
      return {
        valid: true,
        exists: true,
        errors: [],
        shouldExit: false
      }
    }
    return {
      valid: false,
      exists: true,
      errors: ['Failed to load config'],
      shouldExit: true
    }
  }
  catch (error) {
    const errorMessage = toErrorMessage(error)
    return {
      valid: false,
      exists: true,
      errors: [errorMessage],
      shouldExit: true
    }
  }
}
