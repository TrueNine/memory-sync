/**
 * Bootstrap utility functions for configuration management
 * Provides mergeOptions and parseOptions utilities for the bootstrap process
 *
 * @see Requirements 5.3, 5.4, 7.2, 7.4
 */

import type { BootstrapOptions, PluginConfig, PluginGlobalOptions } from './types'

/**
 * Default values for PluginGlobalOptions
 * Used when options are not provided or partially specified
 *
 * @see Requirement 7.4
 */
export const DEFAULT_PLUGIN_GLOBAL_OPTIONS: PluginGlobalOptions = {
  parallel: false,
  onError: 'continue',
  logLevel: 'info',
  excludePatterns: [],
  dryRun: false,
  cleanOnly: false,
}

/**
 * Check if a value is a plain object (not null, not array)
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Deep merge two objects, with source taking precedence over target
 * Arrays are replaced, not merged
 *
 * @param target - Base object
 * @param source - Object to merge (takes precedence)
 * @returns Merged object
 */
function deepMerge<T extends Record<string, unknown>>(target: T, source: Partial<T>): T {
  const result = { ...target }

  for (const key of Object.keys(source) as Array<keyof T>) {
    const sourceValue = source[key]
    const targetValue = target[key]

    // Skip undefined values in source
    if (sourceValue === null || sourceValue === void 0) {
      continue
    }

    // If both are plain objects, merge recursively
    if (isPlainObject(sourceValue) && isPlainObject(targetValue)) {
      result[key] = deepMerge(
        targetValue as Record<string, unknown>,
        sourceValue as Record<string, unknown>,
      ) as T[keyof T]
    } else {
      // Otherwise, source value takes precedence (including arrays)
      result[key] = sourceValue as T[keyof T]
    }
  }

  return result
}

/**
 * Merge options from multiple sources with defined precedence
 *
 * Precedence order (highest to lowest):
 * 1. CLI flags (from BootstrapOptions direct fields: dryRun, cleanOnly, workspaceGroups, root)
 * 2. BootstrapOptions.options
 * 3. PluginConfig.options
 * 4. Default values
 *
 * @param bootstrapOptions - Bootstrap options containing CLI flags and options override
 * @param configOptions - Options from PluginConfig
 * @returns Merged PluginGlobalOptions with all fields resolved
 *
 * @example
 * ```typescript
 * const merged = mergeOptions(
 *   { dryRun: true, options: { logLevel: 'debug' } },
 *   { logLevel: 'info', parallel: true }
 * )
 * // Result: { dryRun: true, logLevel: 'debug', parallel: true, ... }
 * ```
 *
 * @see Requirements 5.3, 5.4
 */
export function mergeOptions(
  bootstrapOptions: BootstrapOptions = {},
  configOptions: PluginGlobalOptions = {},
): PluginGlobalOptions {
  // Start with defaults
  let result: PluginGlobalOptions = { ...DEFAULT_PLUGIN_GLOBAL_OPTIONS }

  // Layer 1: Apply PluginConfig.options (lowest precedence after defaults)
  const configKeys = Object.keys(configOptions)
  if (configKeys.length > 0) {
    result = deepMerge(result as Record<string, unknown>, configOptions as Record<string, unknown>) as PluginGlobalOptions
  }

  // Layer 2: Apply BootstrapOptions.options
  if (bootstrapOptions.options) {
    const optionsKeys = Object.keys(bootstrapOptions.options)
    if (optionsKeys.length > 0) {
      result = deepMerge(result as Record<string, unknown>, bootstrapOptions.options as Record<string, unknown>) as PluginGlobalOptions
    }
  }

  // Layer 3: Apply CLI flags from BootstrapOptions direct fields (highest precedence)
  // These are explicit CLI flags that override everything
  if (bootstrapOptions.dryRun !== null && bootstrapOptions.dryRun !== void 0) {
    result.dryRun = bootstrapOptions.dryRun
  }
  if (bootstrapOptions.cleanOnly !== null && bootstrapOptions.cleanOnly !== void 0) {
    result.cleanOnly = bootstrapOptions.cleanOnly
  }
  if (bootstrapOptions.workspaceGroups !== null && bootstrapOptions.workspaceGroups !== void 0) {
    result.workspaceGroups = bootstrapOptions.workspaceGroups
  }
  if (bootstrapOptions.root !== null && bootstrapOptions.root !== void 0) {
    result.root = bootstrapOptions.root
  }

  return result
}

/**
 * Parse and validate JSON string to PluginGlobalOptions
 * Applies defaults for missing optional fields
 *
 * @param json - JSON string to parse
 * @returns Parsed PluginGlobalOptions with defaults applied
 * @throws TypeError if JSON is invalid or contains invalid field values
 *
 * @example
 * ```typescript
 * const options = parseOptions('{"dryRun": true}')
 * // Result: { dryRun: true, parallel: false, onError: 'continue', ... }
 * ```
 *
 * @see Requirements 7.2, 7.4
 */
export function parseOptions(json: string): PluginGlobalOptions {
  let parsed: unknown

  try {
    parsed = JSON.parse(json)
  } catch {
    throw new TypeError('Invalid JSON string')
  }

  if (!isPlainObject(parsed)) {
    throw new TypeError('JSON must be an object')
  }

  // Validate and extract fields
  const result: PluginGlobalOptions = {}

  // Validate parallel
  if ('parallel' in parsed) {
    if (typeof parsed['parallel'] !== 'boolean') {
      throw new TypeError('parallel must be a boolean')
    }
    result.parallel = parsed['parallel']
  }

  // Validate onError
  if ('onError' in parsed) {
    const onErrorValue = parsed['onError']
    if (onErrorValue !== 'continue' && onErrorValue !== 'stop') {
      throw new TypeError('onError must be "continue" or "stop"')
    }
    result.onError = onErrorValue
  }

  // Validate logLevel
  if ('logLevel' in parsed) {
    const logLevelValue = parsed['logLevel']
    if (
      logLevelValue !== 'debug'
      && logLevelValue !== 'info'
      && logLevelValue !== 'warn'
      && logLevelValue !== 'error'
    ) {
      throw new TypeError('logLevel must be "debug", "info", "warn", or "error"')
    }
    result.logLevel = logLevelValue
  }

  // Validate excludePatterns
  if ('excludePatterns' in parsed) {
    const patternsValue = parsed['excludePatterns']
    if (!Array.isArray(patternsValue)) {
      throw new TypeError('excludePatterns must be an array')
    }
    for (const pattern of patternsValue) {
      if (typeof pattern !== 'string') {
        throw new TypeError('excludePatterns must contain only strings')
      }
    }
    result.excludePatterns = patternsValue as string[]
  }

  // Validate dryRun
  if ('dryRun' in parsed) {
    if (typeof parsed['dryRun'] !== 'boolean') {
      throw new TypeError('dryRun must be a boolean')
    }
    result.dryRun = parsed['dryRun']
  }

  // Validate cleanOnly
  if ('cleanOnly' in parsed) {
    if (typeof parsed['cleanOnly'] !== 'boolean') {
      throw new TypeError('cleanOnly must be a boolean')
    }
    result.cleanOnly = parsed['cleanOnly']
  }

  // Validate workspaceGroups
  if ('workspaceGroups' in parsed) {
    const groupsValue = parsed['workspaceGroups']
    if (!isPlainObject(groupsValue)) {
      throw new TypeError('workspaceGroups must be an object')
    }
    for (const [key, value] of Object.entries(groupsValue)) {
      if (typeof value !== 'string') {
        throw new TypeError(`workspaceGroups["${key}"] must be a string`)
      }
    }
    result.workspaceGroups = groupsValue as Record<string, string>
  }

  // Validate root
  if ('root' in parsed) {
    if (typeof parsed['root'] !== 'string') {
      throw new TypeError('root must be a string')
    }
    result.root = parsed['root']
  }

  // Apply defaults for missing fields
  return applyDefaults(result)
}

/**
 * Apply default values to a partial PluginGlobalOptions object
 *
 * @param options - Partial options object
 * @returns Options with defaults applied for missing fields
 *
 * @see Requirement 7.4
 */
export function applyDefaults(options: PluginGlobalOptions): PluginGlobalOptions {
  const result: PluginGlobalOptions = {
    parallel: options.parallel ?? DEFAULT_PLUGIN_GLOBAL_OPTIONS.parallel ?? false,
    onError: options.onError ?? DEFAULT_PLUGIN_GLOBAL_OPTIONS.onError ?? 'continue',
    logLevel: options.logLevel ?? DEFAULT_PLUGIN_GLOBAL_OPTIONS.logLevel ?? 'info',
    excludePatterns: options.excludePatterns ?? DEFAULT_PLUGIN_GLOBAL_OPTIONS.excludePatterns ?? [],
    dryRun: options.dryRun ?? DEFAULT_PLUGIN_GLOBAL_OPTIONS.dryRun ?? false,
    cleanOnly: options.cleanOnly ?? DEFAULT_PLUGIN_GLOBAL_OPTIONS.cleanOnly ?? false,
  }

  // Only set optional fields if they have values
  if (options.workspaceGroups !== null && options.workspaceGroups !== void 0) {
    result.workspaceGroups = options.workspaceGroups
  }
  if (options.root !== null && options.root !== void 0 && options.root !== '') {
    result.root = options.root
  }

  return result
}

/**
 * Serialize PluginGlobalOptions to JSON string
 * Removes undefined values for cleaner output
 *
 * @param options - Options to serialize
 * @returns JSON string representation
 *
 * @see Requirement 7.1
 */
export function serializeOptions(options: PluginGlobalOptions): string {
  // Filter out undefined values
  const filtered: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(options)) {
    if (value !== null && value !== void 0) {
      filtered[key] = value
    }
  }

  return JSON.stringify(filtered)
}

/**
 * Create merged options from BootstrapOptions and PluginConfig
 * Convenience function that extracts config options and merges
 *
 * @param bootstrapOptions - Bootstrap options
 * @param config - Plugin configuration (optional)
 * @returns Merged PluginGlobalOptions
 *
 * @see Requirements 5.3, 5.4
 */
export function createMergedOptions(
  bootstrapOptions: BootstrapOptions = {},
  config?: PluginConfig,
): PluginGlobalOptions {
  const configOptions = config?.options ?? {}
  return mergeOptions(bootstrapOptions, configOptions)
}
