// src/globals/index.ts
// Global definitions available in all MDX expressions.
// Export values here to make them available in {expression} syntax.

import type { EvaluationScope } from '../compiler/types'

/**
 * Project version from package.json
 * Available in MDX as {VERSION}
 */
export const VERSION = '2026.10103.10509'

/**
 * Project name
 * Available in MDX as {PROJECT_NAME}
 */
export const PROJECT_NAME = 'memory-sync-cli'

/**
 * Get all global definitions as an evaluation scope.
 * These values are automatically available in MDX expressions.
 *
 * @returns EvaluationScope containing all global definitions
 */
export function getGlobalScope(): EvaluationScope {
  return {
    VERSION,
    PROJECT_NAME,
  }
}
