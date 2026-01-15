/**
 * Export metadata types for MDX files
 * These interfaces define the expected structure of export statements in MDX files
 * that are used as front matter metadata.
 *
 * @module ExportMetadataTypes
 */

import type {CodingAgentTools, NamingCaseKind} from './Enums'

/**
 * Base export metadata interface
 * All export metadata types should extend this
 */
export interface BaseExportMetadata {
  /**
   * Naming case convention for the file
   */
  readonly namingCase?: NamingCaseKind
}

/**
 * Skill export metadata
 * Defines the expected structure of export statements in skill.mdx files
 *
 * @example
 * ```mdx
 * export const name = "my-skill"
 * export const description = "A useful skill"
 * export const keywords = ["typescript", "testing"]
 * ```
 *
 * Or using metadata object:
 * ```mdx
 * export const metadata = {
 *   name: "my-skill",
 *   description: "A useful skill",
 *   keywords: ["typescript", "testing"]
 * }
 * ```
 */
export interface SkillExportMetadata extends BaseExportMetadata {
  /**
   * Skill name (required)
   * Max 64 characters. Lowercase letters, numbers, and hyphens only.
   */
  readonly name: string
  /**
   * Skill description (required)
   * Describes what the skill does and when to use it.
   */
  readonly description: string
  /**
   * Keywords for skill discovery and matching (optional)
   * Used by Kiro Powers for keyword-based activation
   */
  readonly keywords?: readonly string[]
  /**
   * Whether the skill is enabled (optional, defaults to true)
   */
  readonly enabled?: boolean
  /**
   * Display name for the skill (optional)
   * If not set, defaults to `name`
   */
  readonly displayName?: string
  /**
   * Author of the skill (optional)
   */
  readonly author?: string
  /**
   * Semantic version number (optional)
   * @example '1.0.0'
   */
  readonly version?: string
  /**
   * Allowed tools for the skill (optional)
   */
  readonly allowTools?: readonly (CodingAgentTools | string)[]
}

/**
 * FastCommand export metadata
 * Defines the expected structure of export statements in fast command .mdx files
 *
 * @example
 * ```mdx
 * export const description = "Compile the project"
 * export const argumentHint = "<file>"
 * ```
 */
export interface FastCommandExportMetadata extends BaseExportMetadata {
  /**
   * Command description (optional but recommended)
   */
  readonly description?: string
  /**
   * Argument hint for the command (optional)
   * @example '<file>', '[options]'
   */
  readonly argumentHint?: string
  /**
   * Allowed tools for the command (optional)
   */
  readonly allowTools?: readonly (CodingAgentTools | string)[]
  /**
   * Whether the command is global only (optional)
   */
  readonly globalOnly?: boolean
}

/**
 * SubAgent export metadata
 * Defines the expected structure of export statements in sub-agent .mdx files
 *
 * @example
 * ```mdx
 * export const name = "code-reviewer"
 * export const description = "Reviews code for best practices"
 * export const role = "reviewer"
 * ```
 */
export interface SubAgentExportMetadata extends BaseExportMetadata {
  /**
   * Agent name (required)
   */
  readonly name: string
  /**
   * Agent description (required)
   */
  readonly description: string
  /**
   * Agent role (optional)
   */
  readonly role?: string
  /**
   * Model to use for the agent (optional)
   */
  readonly model?: string
  /**
   * Color for the agent in Claude Code CLI (optional)
   */
  readonly color?: string
  /**
   * Argument hint for the agent (optional)
   */
  readonly argumentHint?: string
  /**
   * Allowed tools for the agent (optional)
   */
  readonly allowTools?: readonly (CodingAgentTools | string)[]
}

/**
 * Metadata validation result
 */
export interface MetadataValidationResult {
  /**
   * Whether the metadata is valid
   */
  readonly valid: boolean
  /**
   * List of validation errors (missing required fields, invalid types, etc.)
   */
  readonly errors: readonly string[]
  /**
   * List of validation warnings (missing optional fields with defaults, etc.)
   */
  readonly warnings: readonly string[]
}

/**
 * Options for metadata validation
 */
export interface ValidateMetadataOptions<T> {
  /**
   * Required field names
   */
  readonly requiredFields: readonly (keyof T)[]
  /**
   * Optional fields with their default values
   */
  readonly optionalDefaults?: Partial<T>
  /**
   * File path for error messages (optional)
   */
  readonly filePath?: string | undefined
}

/**
 * Validate export metadata against required fields
 *
 * @param metadata - The metadata object to validate
 * @param options - Validation options including required fields and optional defaults
 * @returns Validation result with valid flag, errors, and warnings
 *
 * @example
 * ```typescript
 * const result = validateExportMetadata(metadata, {
 *   requiredFields: ['name', 'description'],
 *   optionalDefaults: { enabled: true },
 *   filePath: 'skills/my-skill/skill.mdx'
 * })
 *
 * if (!result.valid) {
 *   throw new MetadataValidationError(result.errors, filePath)
 * }
 * ```
 */
export function validateExportMetadata<T>(
  metadata: Record<string, unknown>,
  options: ValidateMetadataOptions<T>,
): MetadataValidationResult {
  const {requiredFields, optionalDefaults, filePath} = options
  const errors: string[] = []
  const warnings: string[] = []

  for (const field of requiredFields) { // Check required fields
    const fieldName = String(field)
    if (!(fieldName in metadata) || metadata[fieldName] == null) {
      const errorMsg = filePath != null
        ? `Missing required field "${fieldName}" in ${filePath}`
        : `Missing required field "${fieldName}"`
      errors.push(errorMsg)
    }
  }

  if (optionalDefaults != null) { // Check optional fields and record warnings for defaults
    for (const [key, defaultValue] of Object.entries(optionalDefaults)) {
      if (!(key in metadata) || metadata[key] == null) {
        const warningMsg = filePath != null
          ? `Using default value for optional field "${key}": ${JSON.stringify(defaultValue)} in ${filePath}`
          : `Using default value for optional field "${key}": ${JSON.stringify(defaultValue)}`
        warnings.push(warningMsg)
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}

/**
 * Validate skill export metadata
 *
 * @param metadata - The metadata object to validate
 * @param filePath - Optional file path for error messages
 * @returns Validation result
 */
export function validateSkillMetadata(
  metadata: Record<string, unknown>,
  filePath?: string,
): MetadataValidationResult {
  return validateExportMetadata<SkillExportMetadata>(metadata, {
    requiredFields: ['name', 'description'],
    optionalDefaults: {
      enabled: true,
      keywords: [],
    },
    filePath,
  })
}

/**
 * Validate fast command export metadata
 *
 * @param metadata - The metadata object to validate
 * @param filePath - Optional file path for error messages
 * @returns Validation result
 */
export function validateFastCommandMetadata(
  metadata: Record<string, unknown>,
  filePath?: string,
): MetadataValidationResult {
  return validateExportMetadata<FastCommandExportMetadata>(metadata, { // description is optional (can come from YAML or be omitted) // FastCommand has no required fields from export metadata
    requiredFields: [],
    optionalDefaults: {},
    filePath,
  })
}

/**
 * Validate sub-agent export metadata
 *
 * @param metadata - The metadata object to validate
 * @param filePath - Optional file path for error messages
 * @returns Validation result
 */
export function validateSubAgentMetadata(
  metadata: Record<string, unknown>,
  filePath?: string,
): MetadataValidationResult {
  return validateExportMetadata<SubAgentExportMetadata>(metadata, {
    requiredFields: ['name', 'description'],
    optionalDefaults: {},
    filePath,
  })
}

/**
 * Apply default values to metadata
 *
 * @param metadata - The metadata object
 * @param defaults - Default values to apply
 * @returns Metadata with defaults applied
 */
export function applyMetadataDefaults<T>(
  metadata: Record<string, unknown>,
  defaults: Partial<T>,
): T {
  const result = {...metadata}

  for (const [key, defaultValue] of Object.entries(defaults)) {
    if (!(key in result) || result[key] == null) result[key] = defaultValue
  }

  return result as T
}
