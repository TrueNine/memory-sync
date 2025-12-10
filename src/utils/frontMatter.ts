/**
 * Front matter generation utilities for rule files
 */

/**
 * Supported front matter types for different AI tools
 */
export enum FrontMatterType {
  KIRO_ALWAYS = 'kiro-always',
  KIRO_FILE_MATCH = 'kiro-file-match',
  QODER_ALWAYS = 'qoder-always',
  QODER_GLOB = 'qoder-glob',
  ANTIGRAVITY_ALWAYS = 'antigravity-always',
  ANTIGRAVITY_GLOB = 'antigravity-glob',
}

/**
 * Options for generating front matter
 */
export interface FrontMatterOptions {
  /**
   * Type of front matter to generate
   */
  type: FrontMatterType
  /**
   * Pattern for file matching or glob (required for FILE_MATCH and GLOB types)
   */
  pattern?: string
}

/**
 * Generate YAML front matter based on type and options
 *
 * @param options - Front matter generation options
 * @returns YAML front matter string with trailing newline
 */
export function generateFrontMatter(options: FrontMatterOptions): string {
  const { type, pattern } = options

  switch (type) {
    case FrontMatterType.KIRO_ALWAYS:
      return `---
inclusion: always
---

`

    case FrontMatterType.KIRO_FILE_MATCH:
      if (pattern == null || pattern.length === 0) {
        throw new Error('Pattern is required for KIRO_FILE_MATCH type')
      }
      return `---
inclusion: fileMatch
fileMatchPattern: "${pattern}"
---

`

    case FrontMatterType.QODER_ALWAYS:
      return `---
trigger: always_on
alwaysApply: true
---

`

    case FrontMatterType.QODER_GLOB:
      if (pattern == null || pattern.length === 0) {
        throw new Error('Pattern is required for QODER_GLOB type')
      }
      return `---
trigger: glob
glob: ${pattern}
---

`

    case FrontMatterType.ANTIGRAVITY_ALWAYS:
      return `---
trigger: always_on
---

`

    case FrontMatterType.ANTIGRAVITY_GLOB:
      if (pattern == null || pattern.length === 0) {
        throw new Error('Pattern is required for ANTIGRAVITY_GLOB type')
      }
      return `---
trigger: glob
globs: ${pattern}
---

`

    default: {
      const exhaustiveCheck: never = type
      throw new Error(`Unknown front matter type: ${String(exhaustiveCheck)}`)
    }
  }
}

/**
 * Remove BOM (Byte Order Mark) from content
 * BOM is the Unicode character U+FEFF at the start of a file
 *
 * @param content - Content that may contain BOM
 * @returns Content with BOM removed
 */
export function removeBom(content: string): string {
  if (content.charCodeAt(0) === 0xFEFF) {
    return content.slice(1)
  }
  return content
}

/**
 * Add front matter to content
 * Removes BOM if present before adding front matter
 *
 * @param content - Original content
 * @param frontMatter - Front matter to prepend
 * @returns Content with front matter prepended
 */
export function addFrontMatter(content: string, frontMatter: string): string {
  const cleanContent = removeBom(content)
  return frontMatter + cleanContent
}
