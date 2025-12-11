/**
 * YAML Front Matter Templates
 * Centralized templates for different AI tool configurations
 * Re-exports from frontMatter capability for backward compatibility
 */

import { generateFrontMatter } from '../core/capabilities'
import { FrontMatterType } from '../core/types'

/**
 * Generic YAML front matter with alwaysApply: true
 * @deprecated Use generateFrontMatter({ type: FrontMatterType.QODER_ALWAYS }) instead
 */
export const YAML_FRONT_MATTER_ALWAYS_APPLY = generateFrontMatter({
  type: FrontMatterType.QODER_ALWAYS,
})

/**
 * Qoder-specific YAML front matter with always_on trigger
 */
export const YAML_FRONT_MATTER_QODER_ALWAYS = generateFrontMatter({
  type: FrontMatterType.QODER_ALWAYS,
})

/**
 * Kiro steering YAML front matter with inclusion: always
 */
export const YAML_FRONT_MATTER_KIRO_ALWAYS = generateFrontMatter({
  type: FrontMatterType.KIRO_ALWAYS,
})

/**
 * Generate Qoder-specific YAML front matter with glob pattern
 *
 * @param glob - Glob pattern for file matching
 * @returns YAML front matter string
 */
export function generateQoderFrontMatter(glob: string): string {
  return generateFrontMatter({
    type: FrontMatterType.QODER_GLOB,
    pattern: glob,
  })
}

/**
 * Generate Kiro steering YAML front matter with fileMatch pattern
 *
 * @param fileMatchPattern - File match pattern
 * @returns YAML front matter string
 */
export function generateKiroFileMatchFrontMatter(fileMatchPattern: string): string {
  return generateFrontMatter({
    type: FrontMatterType.KIRO_FILE_MATCH,
    pattern: fileMatchPattern,
  })
}

/**
 * Generate Antigravity (Agent) YAML front matter with glob pattern
 *
 * @param glob - Glob pattern for file matching
 * @returns YAML front matter string
 */
export function generateAntigravityFrontMatter(glob: string): string {
  return generateFrontMatter({
    type: FrontMatterType.ANTIGRAVITY_GLOB,
    pattern: glob,
  })
}

/**
 * Antigravity (Agent) YAML front matter with always_on trigger
 */
export const YAML_FRONT_MATTER_ANTIGRAVITY_ALWAYS = generateFrontMatter({
  type: FrontMatterType.ANTIGRAVITY_ALWAYS,
})
