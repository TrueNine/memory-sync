/**
 * Configuration validation schema
 * JSON Schema definitions for validating plugin configuration
 */

/* eslint-disable ts/no-unsafe-assignment */
/* eslint-disable ts/no-unsafe-member-access */
/* eslint-disable ts/no-unsafe-argument */
/* eslint-disable ts/no-unsafe-call */
/* eslint-disable ts/strict-boolean-expressions */
/* eslint-disable no-undefined */
/* eslint-disable no-inline-comments */

import type {
  PluginSystemConfig,
  UserPluginConfig,
} from './types'

/**
 * JSON Schema for InputClassificationRule
 */
export const inputClassificationRuleSchema = {
  type: 'object',
  required: ['type', 'patterns'],
  properties: {
    type: {
      type: 'string',
      enum: [
        'memoryPrompt',
        'globalPrompt',
        'subAgentAgenticConfig',
        'fastCommandAgenticConfig',
        'skillAgenticConfig',
        'configFile',
      ],
    },
    patterns: {
      type: 'array',
      items: { type: 'string' },
      minItems: 1,
    },
    frontMatterTypes: {
      type: 'array',
      items: {
        type: 'string',
        enum: [
          'kiro-always',
          'kiro-file-match',
          'qoder-always',
          'qoder-glob',
          'antigravity-always',
          'antigravity-glob',
          'workflow-auto',
        ],
      },
    },
    priority: {
      type: 'number',
      minimum: 0,
    },
  },
  additionalProperties: false,
}

/**
 * JSON Schema for InputClassificationConfig
 */
export const inputClassificationConfigSchema = {
  type: 'object',
  required: ['rules', 'defaultType'],
  properties: {
    rules: {
      type: 'array',
      items: inputClassificationRuleSchema,
      minItems: 1,
    },
    defaultType: {
      type: 'string',
      enum: [
        'memoryPrompt',
        'globalPrompt',
        'subAgentAgenticConfig',
        'fastCommandAgenticConfig',
        'skillAgenticConfig',
        'configFile',
      ],
    },
  },
  additionalProperties: false,
}

/**
 * JSON Schema for PathTransformConfig
 */
export const pathTransformConfigSchema = {
  type: 'object',
  required: ['outputDir'],
  properties: {
    outputDir: {
      type: 'string',
      minLength: 1,
    },
    filenameTransform: {
      oneOf: [
        { type: 'null' },
        { type: 'string', minLength: 1 }, /* For serialized functions */
      ],
    },
    contentTransform: {
      oneOf: [
        { type: 'null' },
        { type: 'string', minLength: 1 }, /* For serialized functions */
      ],
    },
    createDir: {
      type: 'boolean',
    },
    fileMode: {
      type: 'string',
      pattern: '^[0-7]{3}$', /* Unix octal permissions */
    },
  },
  additionalProperties: false,
}

/**
 * JSON Schema for PluginSystemConfig
 */
export const pluginSystemConfigSchema = {
  type: 'object',
  required: ['inputClassification', 'paths', 'frontMatterMapping', 'globalPaths'],
  properties: {
    inputClassification: inputClassificationConfigSchema,
    paths: {
      type: 'object',
      patternProperties: {
        '^[a-zA-Z][a-zA-Z0-9-_]*$': pathTransformConfigSchema,
      },
      additionalProperties: false,
    },
    frontMatterMapping: {
      type: 'object',
      patternProperties: {
        '^[a-zA-Z][a-zA-Z0-9-_]*$': {
          type: 'string',
          enum: [
            'kiro-always',
            'kiro-file-match',
            'qoder-always',
            'qoder-glob',
            'antigravity-always',
            'antigravity-glob',
            'workflow-auto',
          ],
        },
      },
      additionalProperties: false,
    },
    globalPaths: {
      type: 'object',
      required: ['workspaceOutput', 'globalOutput', 'tempDir'],
      properties: {
        workspaceOutput: { type: 'string', minLength: 1 },
        globalOutput: { type: 'string', minLength: 1 },
        tempDir: { type: 'string', minLength: 1 },
      },
      additionalProperties: false,
    },
  },
  additionalProperties: false,
}

/**
 * JSON Schema for UserPluginConfig
 */
export const userPluginConfigSchema = {
  type: 'object',
  properties: {
    inputClassification: {
      type: 'object',
      properties: {
        rules: {
          type: 'array',
          items: inputClassificationRuleSchema,
        },
        defaultType: {
          type: 'string',
          enum: [
            'memoryPrompt',
            'globalPrompt',
            'subAgentAgenticConfig',
            'fastCommandAgenticConfig',
            'skillAgenticConfig',
            'configFile',
          ],
        },
      },
      additionalProperties: false,
    },
    paths: {
      type: 'object',
      patternProperties: {
        '^[a-zA-Z][a-zA-Z0-9-_]*$': {
          type: 'object',
          properties: {
            outputDir: { type: 'string', minLength: 1 },
            filenameTransform: { oneOf: [{ type: 'null' }, { type: 'string' }] },
            contentTransform: { oneOf: [{ type: 'null' }, { type: 'string' }] },
            createDir: { type: 'boolean' },
            fileMode: { type: 'string' },
          },
          additionalProperties: false,
        },
      },
      additionalProperties: false,
    },
    frontMatterMapping: {
      type: 'object',
      patternProperties: {
        '^[a-zA-Z][a-zA-Z0-9-_]*$': {
          type: 'string',
          enum: [
            'kiro-always',
            'kiro-file-match',
            'qoder-always',
            'qoder-glob',
            'antigravity-always',
            'antigravity-glob',
            'workflow-auto',
          ],
        },
      },
      additionalProperties: false,
    },
    globalPaths: {
      type: 'object',
      properties: {
        workspaceOutput: { type: 'string', minLength: 1 },
        globalOutput: { type: 'string', minLength: 1 },
        tempDir: { type: 'string', minLength: 1 },
      },
      additionalProperties: false,
    },
    plugins: {
      type: 'object',
      properties: {
        input: {
          type: 'array',
          items: { type: 'string', minLength: 1 },
        },
        output: {
          type: 'array',
          items: { type: 'string', minLength: 1 },
        },
      },
      additionalProperties: false,
    },
  },
  additionalProperties: false,
}

/**
 * Configuration validation error
 */
export class ConfigValidationError extends Error {
  public errors: ValidationErrorDetail[]

  constructor(errors: ValidationErrorDetail[]) {
    const message = `Configuration validation failed:\n${errors.map((e) => `  - ${e.path}: ${e.message}`).join('\n')}`
    super(message)
    this.name = 'ConfigValidationError'
    this.errors = errors
  }
}

/**
 * Validation error detail
 */
export interface ValidationErrorDetail {
  path: string
  message: string
  value?: unknown
}

/**
 * Simple JSON schema validator
 * In production, consider using a library like Ajv
 */
export class ConfigValidator {
  /**
   * Validate a value against a JSON schema
   * @param schema - JSON schema to validate against
   * @param value - Value to validate
   * @param path - Current path (for error reporting)
   * @returns Array of validation errors
   */
  static validate(schema: any, value: any, path: string = ''): ValidationErrorDetail[] {
    const errors: ValidationErrorDetail[] = []

    // Check type
    if (schema.type && !this.checkType(schema.type, value)) {
      errors.push({
        path,
        message: `Expected type ${schema.type}, got ${typeof value}`,
        value,
      })
      return errors
    }

    // Check required properties
    if (schema.required && Array.isArray(schema.required)) {
      for (const prop of schema.required) {
        if (!(prop in value)) {
          errors.push({
            path: path ? `${path}.${prop}` : prop,
            message: `Required property missing`,
          })
        }
      }
    }

    // Check properties
    if (schema.properties && typeof value === 'object' && value !== null) {
      for (const [prop, propSchema] of Object.entries(schema.properties)) {
        if (prop in value) {
          const propErrors = this.validate(propSchema, value[prop], path ? `${path}.${prop}` : prop)
          errors.push(...propErrors)
        }
      }
    }

    // Check pattern properties
    if (schema.patternProperties && typeof value === 'object' && value !== null) {
      for (const [key, val] of Object.entries(value)) {
        for (const [pattern, propSchema] of Object.entries(schema.patternProperties)) {
          const regex = new RegExp(pattern)
          if (regex.test(key)) {
            const propErrors = this.validate(propSchema, val, path ? `${path}.${key}` : key)
            errors.push(...propErrors)
          }
        }
      }
    }

    // Check enum
    if (schema.enum && !schema.enum.includes(value)) {
      errors.push({
        path,
        message: `Value must be one of: ${schema.enum.join(', ')}`,
        value,
      })
    }

    // Check minimum
    if (schema.minimum !== undefined && value < schema.minimum) {
      errors.push({
        path,
        message: `Value must be >= ${schema.minimum}`,
        value,
      })
    }

    // Check minLength
    if (schema.minLength !== undefined && typeof value === 'string' && value.length < schema.minLength) {
      errors.push({
        path,
        message: `String must be at least ${schema.minLength} characters`,
        value,
      })
    }

    // Check minItems
    if (schema.minItems !== undefined && Array.isArray(value) && value.length < schema.minItems) {
      errors.push({
        path,
        message: `Array must have at least ${schema.minItems} items`,
        value,
      })
    }

    // Check pattern
    if (schema.pattern && typeof value === 'string') {
      const regex = new RegExp(schema.pattern)
      if (!regex.test(value)) {
        errors.push({
          path,
          message: `String must match pattern: ${schema.pattern}`,
          value,
        })
      }
    }

    return errors
  }

  /**
   * Check if value matches the expected type
   * @param expected - Expected type
   * @param value - Value to check
   * @returns Whether the type matches
   */
  private static checkType(expected: string | string[], value: any): boolean {
    if (Array.isArray(expected)) {
      return expected.some((type) => this.checkSingleType(type, value))
    }
    return this.checkSingleType(expected, value)
  }

  /**
   * Check if value matches a single type
   * @param expected - Expected type
   * @param value - Value to check
   * @returns Whether the type matches
   */
  private static checkSingleType(expected: string, value: any): boolean {
    switch (expected) {
      case 'string':
        return typeof value === 'string'
      case 'number':
        return typeof value === 'number' && !Number.isNaN(value)
      case 'boolean':
        return typeof value === 'boolean'
      case 'object':
        return typeof value === 'object' && value !== null && !Array.isArray(value)
      case 'array':
        return Array.isArray(value)
      case 'null':
        return value === null
      default:
        return true
    }
  }
}

/**
 * Validate PluginSystemConfig
 * @param config - Configuration to validate
 * @throws ConfigValidationError if validation fails
 */
export function validatePluginSystemConfig(config: PluginSystemConfig): void {
  const errors = ConfigValidator.validate(pluginSystemConfigSchema, config)
  if (errors.length > 0) {
    throw new ConfigValidationError(errors)
  }
}

/**
 * Validate UserPluginConfig
 * @param config - Configuration to validate
 * @throws ConfigValidationError if validation fails
 */
export function validateUserPluginConfig(config: UserPluginConfig): void {
  const errors = ConfigValidator.validate(userPluginConfigSchema, config)
  if (errors.length > 0) {
    throw new ConfigValidationError(errors)
  }
}
