/**
 * YAML Front Matter Templates
 * Centralized templates for different AI tool configurations
 */

/**
 * Generic YAML front matter with alwaysApply: true
 */
export const YAML_FRONT_MATTER_ALWAYS_APPLY = `---
alwaysApply: true
---

`

/**
 * Qoder-specific YAML front matter with always_on trigger
 */
export const YAML_FRONT_MATTER_QODER_ALWAYS = `---
trigger: always_on
alwaysApply: true
---

`

/**
 * Kiro steering YAML front matter with inclusion: always
 */
export const YAML_FRONT_MATTER_KIRO_ALWAYS = `---
inclusion: always
---

`

/**
 * Generate Qoder-specific YAML front matter with glob pattern
 *
 * @param glob - Glob pattern for file matching
 * @returns YAML front matter string
 */
export function generateQoderFrontMatter(glob: string): string {
  return `---
trigger: glob
glob: ${glob}
---

`
}

/**
 * Generate Kiro steering YAML front matter with fileMatch pattern
 *
 * @param fileMatchPattern - File match pattern
 * @returns YAML front matter string
 */
export function generateKiroFileMatchFrontMatter(fileMatchPattern: string): string {
  return `---
inclusion: fileMatch
fileMatchPattern: "${fileMatchPattern}"
---

`
}

/**
 * Generate Antigravity (Agent) YAML front matter with glob pattern
 *
 * @param glob - Glob pattern for file matching
 * @returns YAML front matter string
 */
export function generateAntigravityFrontMatter(glob: string): string {
  return `---
globs: ${glob}
---

`
}

/**
 * Antigravity (Agent) YAML front matter with always_on trigger
 */
export const YAML_FRONT_MATTER_ANTIGRAVITY_ALWAYS = `---
trigger: always_on
---

`
