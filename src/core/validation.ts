/**
 * Plugin validation utilities
 */

import type { OutputPlugin, Plugin } from './types'
import { InputType, ValidationError } from './types'

/**
 * Validate a plugin object before registration
 * @throws ValidationError if plugin is invalid
 */
export function validatePlugin(plugin: unknown): asserts plugin is Plugin {
  if (plugin == null || typeof plugin !== 'object') {
    throw new ValidationError('Plugin must be a non-null object', 'plugin')
  }

  const obj = plugin as Record<string, unknown>

  if (!('name' in obj)) {
    throw new ValidationError('Plugin must have a name property', 'name')
  }

  if (typeof obj['name'] !== 'string') {
    throw new ValidationError('Plugin name must be a string', 'name')
  }

  if (obj['name'].trim().length === 0) {
    throw new ValidationError('Plugin name cannot be empty or whitespace only', 'name')
  }

  const priority = obj['priority']
  if (priority != null && typeof priority !== 'number') {
    throw new ValidationError('Plugin priority must be a number', 'priority')
  }

  const dependencies = obj['dependencies']
  if (dependencies != null) {
    if (!Array.isArray(dependencies)) {
      throw new ValidationError('Plugin dependencies must be an array', 'dependencies')
    }

    for (const dep of dependencies) {
      if (typeof dep !== 'string') {
        throw new ValidationError('Plugin dependency names must be strings', 'dependencies')
      }
    }
  }
}

/**
 * Check if a value is a valid plugin (non-throwing version)
 */
export function isValidPlugin(plugin: unknown): plugin is Plugin {
  try {
    validatePlugin(plugin)
    return true
  } catch {
    return false
  }
}

/**
 * Validate an OutputPlugin object before registration
 * Extends base plugin validation with OutputPlugin-specific checks
 * @throws ValidationError if plugin is invalid
 * @see Requirements 22.1, 9.1, 9.2, 28.1, 29.2
 */
export function validateOutputPlugin(plugin: unknown): asserts plugin is OutputPlugin {
  // First validate base plugin properties
  validatePlugin(plugin)

  const obj = plugin as unknown as Record<string, unknown>

  // Validate extends property (Requirement 28.1)
  const extendsValue = obj['extends']
  if (extendsValue != null && typeof extendsValue !== 'string') {
    throw new ValidationError('Plugin extends must be a string', 'extends')
  }

  // Validate inputTypes property (Requirement 29.2)
  const inputTypes = obj['inputTypes']
  if (inputTypes != null) {
    if (!Array.isArray(inputTypes)) {
      throw new ValidationError('Plugin inputTypes must be an array', 'inputTypes')
    }

    const validInputTypes = Object.values(InputType)
    for (const inputType of inputTypes) {
      if (!validInputTypes.includes(inputType as InputType)) {
        throw new ValidationError(
          `Invalid inputType: ${String(inputType)}. Must be one of: ${validInputTypes.join(', ')}`,
          'inputTypes',
        )
      }
    }
  }

  // Validate outputs property (Requirement 22.3)
  const outputs = obj['outputs']
  if (outputs != null) {
    if (!Array.isArray(outputs)) {
      throw new ValidationError('Plugin outputs must be an array', 'outputs')
    }

    for (let i = 0; i < outputs.length; i++) {
      const output = outputs[i] as Record<string, unknown>
      if (output == null || typeof output !== 'object') {
        throw new ValidationError(`Plugin output at index ${i} must be an object`, 'outputs')
      }

      if (typeof output['id'] !== 'string' || output['id'].trim().length === 0) {
        throw new ValidationError(`Plugin output at index ${i} must have a non-empty id`, 'outputs')
      }

      const validCategories = ['cli', 'ide', 'config']
      if (!validCategories.includes(output['category'] as string)) {
        throw new ValidationError(
          `Plugin output at index ${i} has invalid category. Must be one of: ${validCategories.join(', ')}`,
          'outputs',
        )
      }

      if (typeof output['tool'] !== 'string' || output['tool'].trim().length === 0) {
        throw new ValidationError(`Plugin output at index ${i} must have a non-empty tool`, 'outputs')
      }

      const validTargetTypes = ['workspaceGroup', 'workspace', 'globalConfig']
      if (!validTargetTypes.includes(output['targetType'] as string)) {
        throw new ValidationError(
          `Plugin output at index ${i} has invalid targetType. Must be one of: ${validTargetTypes.join(', ')}`,
          'outputs',
        )
      }

      if (typeof output['path'] !== 'string') {
        throw new ValidationError(`Plugin output at index ${i} must have a path string`, 'outputs')
      }
    }
  }

  // Validate filenameTransform property (Requirement 14.1)
  const filenameTransform = obj['filenameTransform']
  if (filenameTransform != null) {
    if (!Array.isArray(filenameTransform)) {
      throw new ValidationError('Plugin filenameTransform must be an array', 'filenameTransform')
    }

    for (let i = 0; i < filenameTransform.length; i++) {
      const rule = filenameTransform[i] as Record<string, unknown>
      if (rule == null || typeof rule !== 'object') {
        throw new ValidationError(`Filename transform rule at index ${i} must be an object`, 'filenameTransform')
      }

      const pattern = rule['pattern']
      if (!(pattern instanceof RegExp) && typeof pattern !== 'string') {
        throw new ValidationError(
          `Filename transform rule at index ${i} must have a pattern (RegExp or string)`,
          'filenameTransform',
        )
      }

      const replacement = rule['replacement']
      if (typeof replacement !== 'string' && typeof replacement !== 'function') {
        throw new ValidationError(
          `Filename transform rule at index ${i} must have a replacement (string or function)`,
          'filenameTransform',
        )
      }

      const tools = rule['tools']
      if (tools != null) {
        if (!Array.isArray(tools)) {
          throw new ValidationError(
            `Filename transform rule at index ${i} tools must be an array`,
            'filenameTransform',
          )
        }

        for (const tool of tools) {
          if (typeof tool !== 'string') {
            throw new ValidationError(
              `Filename transform rule at index ${i} tool names must be strings`,
              'filenameTransform',
            )
          }
        }
      }
    }
  }
}

/**
 * Check if a value is a valid OutputPlugin (non-throwing version)
 */
export function isValidOutputPlugin(plugin: unknown): plugin is OutputPlugin {
  try {
    validateOutputPlugin(plugin)
    return true
  } catch {
    return false
  }
}

// ============================================================================
// Plugin Configuration Validation (Requirements 2.3, 2.4)
// ============================================================================

/**
 * Valid log levels for plugin configuration
 */
const VALID_LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const

/**
 * Valid error handling strategies
 */
const VALID_ON_ERROR_VALUES = ['continue', 'stop'] as const

/**
 * Default values for plugin global options (Requirement 2.2)
 * These values are used when no configuration is provided
 */
export const DEFAULT_PLUGIN_OPTIONS = {
  parallel: false,
  onError: 'continue' as const,
  logLevel: 'info' as const,
  excludePatterns: [] as string[],
}

/**
 * Validate plugin global options
 * Validates option types and constraints for PluginGlobalOptions
 *
 * @param options - Options object to validate
 * @throws ValidationError if options are invalid
 * @see Requirements 2.3, 2.4
 */
export function validatePluginGlobalOptions(options: unknown): void {
  if (options == null) {
    return
  }

  if (typeof options !== 'object' || Array.isArray(options)) {
    throw new ValidationError('Plugin options must be an object', 'options')
  }

  const obj = options as Record<string, unknown>

  // Validate parallel option
  const parallel = obj['parallel']
  if (parallel != null && typeof parallel !== 'boolean') {
    throw new ValidationError('Plugin options.parallel must be a boolean', 'options.parallel')
  }

  // Validate onError option
  const onError = obj['onError']
  if (onError != null) {
    if (typeof onError !== 'string') {
      throw new ValidationError('Plugin options.onError must be a string', 'options.onError')
    }
    if (!VALID_ON_ERROR_VALUES.includes(onError as typeof VALID_ON_ERROR_VALUES[number])) {
      throw new ValidationError(
        `Plugin options.onError must be one of: ${VALID_ON_ERROR_VALUES.join(', ')}`,
        'options.onError',
      )
    }
  }

  // Validate logLevel option
  const logLevel = obj['logLevel']
  if (logLevel != null) {
    if (typeof logLevel !== 'string') {
      throw new ValidationError('Plugin options.logLevel must be a string', 'options.logLevel')
    }
    if (!VALID_LOG_LEVELS.includes(logLevel as typeof VALID_LOG_LEVELS[number])) {
      throw new ValidationError(
        `Plugin options.logLevel must be one of: ${VALID_LOG_LEVELS.join(', ')}`,
        'options.logLevel',
      )
    }
  }

  // Validate excludePatterns option
  const excludePatterns = obj['excludePatterns']
  if (excludePatterns != null) {
    if (!Array.isArray(excludePatterns)) {
      throw new ValidationError('Plugin options.excludePatterns must be an array', 'options.excludePatterns')
    }
    for (let i = 0; i < excludePatterns.length; i++) {
      if (typeof excludePatterns[i] !== 'string') {
        throw new ValidationError(
          `Plugin options.excludePatterns[${i}] must be a string`,
          'options.excludePatterns',
        )
      }
    }
  }
}

/**
 * Validate plugin configuration
 * Validates the complete PluginConfig object including plugins array and options
 *
 * @param config - Configuration object to validate
 * @throws ValidationError if configuration is invalid
 * @see Requirements 2.3, 2.4
 */
export function validatePluginConfig(config: unknown): void {
  if (config == null) {
    throw new ValidationError('Plugin configuration must be provided', 'config')
  }

  if (typeof config !== 'object' || Array.isArray(config)) {
    throw new ValidationError('Plugin configuration must be an object', 'config')
  }

  const obj = config as Record<string, unknown>

  // Validate plugins array
  const plugins = obj['plugins']
  if (plugins != null) {
    if (!Array.isArray(plugins)) {
      throw new ValidationError('Plugin configuration plugins must be an array', 'plugins')
    }

    for (let i = 0; i < plugins.length; i++) {
      const plugin: unknown = plugins[i]
      // Allow plugin factories (functions) or plugin objects
      if (typeof plugin === 'function') {
        continue
      }
      try {
        validatePlugin(plugin)
      } catch (error) {
        if (error instanceof ValidationError) {
          throw new ValidationError(
            `Plugin at index ${i}: ${error.message}`,
            `plugins[${i}].${error.field}`,
          )
        }
        throw error
      }
    }
  }

  // Validate options
  const options = obj['options']
  if (options != null) {
    try {
      validatePluginGlobalOptions(options)
    } catch (error) {
      if (error instanceof ValidationError) {
        throw error
      }
      throw error
    }
  }
}

/**
 * Check if plugin global options are valid (non-throwing version)
 */
export function isValidPluginGlobalOptions(options: unknown): boolean {
  try {
    validatePluginGlobalOptions(options)
    return true
  } catch {
    return false
  }
}

/**
 * Check if plugin configuration is valid (non-throwing version)
 */
export function isValidPluginConfig(config: unknown): boolean {
  try {
    validatePluginConfig(config)
    return true
  } catch {
    return false
  }
}

/**
 * Apply default values to plugin global options (Requirement 2.2)
 * Returns a new object with defaults applied for missing values
 *
 * @param options - Options object (may be partial or undefined)
 * @param defaults - Default values to apply
 * @returns Complete options object with defaults applied
 */
export function applyDefaultOptions<T>(
  options: Partial<T> | undefined,
  defaults: T,
): T {
  if (options == null) {
    return { ...defaults }
  }

  const result = { ...defaults }

  for (const key of Object.keys(options) as Array<keyof T>) {
    const value = options[key]
    if (value !== void 0) {
      result[key] = value as T[keyof T]
    }
  }

  return result
}
