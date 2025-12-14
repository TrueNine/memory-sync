/**
 * Plugin validation utilities
 */

import type { OutputPlugin } from './types'
import { InputType, ValidationError } from './types'

/**
 * Validate a plugin object before registration
 * @throws ValidationError if plugin is invalid
 */
export function validatePlugin(plugin: unknown): asserts plugin is OutputPlugin {
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
export function isValidPlugin(plugin: unknown): plugin is OutputPlugin {
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

      const validTargetTypes = ['workspace', 'project', 'globalConfig']
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
