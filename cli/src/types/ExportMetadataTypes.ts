/**
 * Export metadata types for MDX files
 * These interfaces define the expected structure of export statements in MDX files
 * that are used as front matter metadata.
 *
 * @module ExportMetadataTypes
 */

import type {CodingAgentTools, NamingCaseKind, RuleScope} from './Enums'

/**
 * Base export metadata interface
 * All export metadata types should extend this
 */
export interface BaseExportMetadata {
  readonly namingCase?: NamingCaseKind
}

export interface SkillExportMetadata extends BaseExportMetadata {
  readonly name: string
  readonly description: string
  readonly keywords?: readonly string[]
  readonly enabled?: boolean
  readonly displayName?: string
  readonly author?: string
  readonly version?: string
  readonly allowTools?: readonly (CodingAgentTools | string)[]
}

export interface FastCommandExportMetadata extends BaseExportMetadata {
  readonly description?: string
  readonly argumentHint?: string
  readonly allowTools?: readonly (CodingAgentTools | string)[]
  readonly globalOnly?: boolean
}

export interface RuleExportMetadata extends BaseExportMetadata {
  readonly globs: readonly string[]
  readonly description: string
  readonly scope?: RuleScope
}

export interface SubAgentExportMetadata extends BaseExportMetadata {
  readonly name: string
  readonly description: string
  readonly role?: string
  readonly model?: string
  readonly color?: string
  readonly argumentHint?: string
  readonly allowTools?: readonly (CodingAgentTools | string)[]
}

/**
 * Metadata validation result
 */
export interface MetadataValidationResult {
  readonly valid: boolean
  readonly errors: readonly string[]
  readonly warnings: readonly string[]
}

/**
 * Options for metadata validation
 */
export interface ValidateMetadataOptions<T> {
  readonly requiredFields: readonly (keyof T)[]
  readonly optionalDefaults?: Partial<T>
  readonly filePath?: string | undefined
}

export function validateExportMetadata<T>(
  metadata: Record<string, unknown>,
  options: ValidateMetadataOptions<T>
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
    warnings
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
  filePath?: string
): MetadataValidationResult {
  return validateExportMetadata<SkillExportMetadata>(metadata, {
    requiredFields: ['name', 'description'],
    optionalDefaults: {
      enabled: true,
      keywords: []
    },
    filePath
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
  filePath?: string
): MetadataValidationResult {
  return validateExportMetadata<FastCommandExportMetadata>(metadata, { // description is optional (can come from YAML or be omitted) // FastCommand has no required fields from export metadata
    requiredFields: [],
    optionalDefaults: {},
    filePath
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
  filePath?: string
): MetadataValidationResult {
  return validateExportMetadata<SubAgentExportMetadata>(metadata, {
    requiredFields: ['name', 'description'],
    optionalDefaults: {},
    filePath
  })
}

/**
 * Validate rule export metadata
 *
 * @param metadata - The metadata object to validate
 * @param filePath - Optional file path for error messages
 * @returns Validation result
 */
export function validateRuleMetadata(
  metadata: Record<string, unknown>,
  filePath?: string
): MetadataValidationResult {
  const errors: string[] = []
  const warnings: string[] = []
  const prefix = filePath != null ? ` in ${filePath}` : ''

  if (!Array.isArray(metadata['globs']) || metadata['globs'].length === 0) errors.push(`Missing or empty required field "globs"${prefix}`)
  else if (!metadata['globs'].every((g: unknown) => typeof g === 'string')) errors.push(`Field "globs" must be an array of strings${prefix}`)

  if (typeof metadata['description'] !== 'string' || metadata['description'].length === 0) errors.push(`Missing or empty required field "description"${prefix}`)

  const {scope} = metadata
  if (scope != null && scope !== 'project' && scope !== 'global') errors.push(`Field "scope" must be "project" or "global"${prefix}`)

  if (scope == null) warnings.push(`Using default value for optional field "scope": "project"${prefix}`)

  return {valid: errors.length === 0, errors, warnings}
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
  defaults: Partial<T>
): T {
  const result = {...metadata}

  for (const [key, defaultValue] of Object.entries(defaults)) {
    if (!(key in result) || result[key] == null) result[key] = defaultValue
  }

  return result as T
}
