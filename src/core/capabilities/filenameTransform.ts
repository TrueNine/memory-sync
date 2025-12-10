/**
 * Filename transformation capability
 * Provides utilities for transforming output filenames based on configured rules
 *
 * @see Requirements 14.1, 14.2, 14.3, 14.4, 14.5
 * **Feature: plugin-architecture**
 */

import type { FilenameTransformRule } from '../types'

/**
 * Options for filename transformation
 */
export interface FilenameTransformOptions {
  /**
   * Target tool name for filtering rules
   * If specified, only rules matching this tool (or rules without tool restriction) are applied
   */
  tool?: string

  /**
   * Whether to replace underscores with hyphens
   * @see Requirement 14.2
   */
  replaceUnderscores?: boolean

  /**
   * Whether to convert filename to lowercase
   * @see Requirement 14.3
   */
  lowercase?: boolean
}

/**
 * Result of filename transformation
 */
export interface FilenameTransformResult {
  /**
   * Original filename before transformation
   */
  original: string

  /**
   * Transformed filename
   */
  transformed: string

  /**
   * Whether any transformation was applied
   */
  changed: boolean

  /**
   * List of rules that were applied
   */
  appliedRules: string[]
}

/**
 * Apply a single transformation rule to a filename
 *
 * @param filename - Filename to transform
 * @param rule - Transformation rule to apply
 * @param tool - Optional target tool for filtering
 * @returns Transformed filename or original if rule doesn't match
 */
export function applyTransformRule(
  filename: string,
  rule: FilenameTransformRule,
  tool?: string,
): string {
  // Check if rule applies to the specified tool
  if (rule.tools != null && rule.tools.length > 0) {
    if (tool == null || !rule.tools.includes(tool)) {
      return filename
    }
  }

  const pattern = rule.pattern
  const replacement = rule.replacement

  // Handle string pattern
  if (typeof pattern === 'string') {
    if (!filename.includes(pattern)) {
      return filename
    }

    if (typeof replacement === 'string') {
      return filename.replace(pattern, replacement)
    }

    return filename.replace(pattern, replacement)
  }

  // Handle RegExp pattern
  if (!pattern.test(filename)) {
    return filename
  }

  if (typeof replacement === 'string') {
    return filename.replace(pattern, replacement)
  }

  // Handle function replacement
  const match = filename.match(pattern)
  if (match != null && match[0] != null) {
    return filename.replace(pattern, replacement(match[0]))
  }

  return filename
}

/**
 * Replace underscores with hyphens in filename
 * Preserves the file extension
 *
 * @param filename - Filename to transform
 * @returns Filename with underscores replaced by hyphens
 * @see Requirement 14.2
 */
export function replaceUnderscores(filename: string): string {
  const lastDotIndex = filename.lastIndexOf('.')

  if (lastDotIndex === -1) {
    return filename.replace(/_/g, '-')
  }

  const name = filename.slice(0, lastDotIndex)
  const ext = filename.slice(lastDotIndex)

  return name.replace(/_/g, '-') + ext
}

/**
 * Convert filename to lowercase
 * Preserves the file extension case if preserveExtCase is true
 *
 * @param filename - Filename to transform
 * @param preserveExtCase - Whether to preserve extension case (default: false)
 * @returns Lowercase filename
 * @see Requirement 14.3
 */
export function toLowercase(filename: string, preserveExtCase = false): string {
  if (!preserveExtCase) {
    return filename.toLowerCase()
  }

  const lastDotIndex = filename.lastIndexOf('.')

  if (lastDotIndex === -1) {
    return filename.toLowerCase()
  }

  const name = filename.slice(0, lastDotIndex)
  const ext = filename.slice(lastDotIndex)

  return name.toLowerCase() + ext
}

/**
 * Apply all configured transformation rules to a filename
 * Rules are applied in order, with each rule receiving the output of the previous
 *
 * @param filename - Original filename
 * @param rules - Array of transformation rules to apply
 * @param options - Transformation options
 * @returns Transformation result with details
 * @see Requirements 14.1, 14.4, 14.5
 */
export function applyFilenameTransform(
  filename: string,
  rules: FilenameTransformRule[] | undefined,
  options: FilenameTransformOptions = {},
): FilenameTransformResult {
  const { tool, replaceUnderscores: shouldReplaceUnderscores, lowercase } = options
  const appliedRules: string[] = []
  let current = filename

  // Apply configured rules in order (Requirement 14.1, 14.4)
  if (rules != null && rules.length > 0) {
    for (const rule of rules) {
      const before = current
      current = applyTransformRule(current, rule, tool)

      if (current !== before) {
        const patternStr = typeof rule.pattern === 'string'
          ? rule.pattern
          : rule.pattern.toString()
        appliedRules.push(`pattern:${patternStr}`)
      }
    }
  }

  // Apply underscore replacement if configured (Requirement 14.2)
  if (shouldReplaceUnderscores === true) {
    const before = current
    current = replaceUnderscores(current)

    if (current !== before) {
      appliedRules.push('replaceUnderscores')
    }
  }

  // Apply lowercase conversion if configured (Requirement 14.3)
  if (lowercase === true) {
    const before = current
    current = toLowercase(current)

    if (current !== before) {
      appliedRules.push('lowercase')
    }
  }

  // Preserve original when no transformation configured (Requirement 14.5)
  return {
    original: filename,
    transformed: current,
    changed: current !== filename,
    appliedRules,
  }
}

/**
 * Create a filename transformer function with pre-configured rules and options
 * Useful for creating reusable transformers for specific plugins
 *
 * @param rules - Transformation rules to apply
 * @param options - Default transformation options
 * @returns Transformer function
 */
export function createFilenameTransformer(
  rules: FilenameTransformRule[] | undefined,
  options: FilenameTransformOptions = {},
): (filename: string) => string {
  return (filename: string): string => {
    const result = applyFilenameTransform(filename, rules, options)
    return result.transformed
  }
}

/**
 * Check if a filename matches any of the transformation rules
 *
 * @param filename - Filename to check
 * @param rules - Transformation rules to check against
 * @param tool - Optional target tool for filtering
 * @returns True if any rule matches the filename
 */
export function matchesTransformRules(
  filename: string,
  rules: FilenameTransformRule[] | undefined,
  tool?: string,
): boolean {
  if (rules == null || rules.length === 0) {
    return false
  }

  for (const rule of rules) {
    // Check tool filter
    if (rule.tools != null && rule.tools.length > 0) {
      if (tool == null || !rule.tools.includes(tool)) {
        continue
      }
    }

    const pattern = rule.pattern

    if (typeof pattern === 'string') {
      if (filename.includes(pattern)) {
        return true
      }
    } else if (pattern.test(filename)) {
      return true
    }
  }

  return false
}
