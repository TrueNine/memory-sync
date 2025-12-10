/**
 * Front matter capability implementation
 * Provides methods for parsing, serializing, merging, and generating front matter
 *
 * @see Requirements 30.1, 4.1, 4.3, 4.4, 4.5, 4.6, 7.4
 */

import type {
  FrontMatterCapability,
  FrontMatterOptions,
  ParsedFrontMatter,
} from '../types'
import { FrontMatterType } from '../types'

/**
 * Front matter parsing error with line number context
 */
export class FrontMatterParseError extends Error {
  public lineNumber: number

  constructor(message: string, lineNumber: number) {
    super(`${message} at line ${lineNumber}`)
    this.name = 'FrontMatterParseError'
    this.lineNumber = lineNumber
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
 * Parse YAML front matter from content
 * Extracts front matter block and returns structured object with body
 *
 * @param content - Markdown content with optional front matter
 * @returns Parsed front matter object and remaining body content
 * @throws FrontMatterParseError if YAML is invalid
 * @see Requirements 4.1, 4.5, 4.6
 */
export function parseFrontMatter(content: string): ParsedFrontMatter {
  const cleanContent = removeBom(content)

  // Match front matter block: starts with ---, ends with ---
  // Capture group 1 contains the YAML content between delimiters
  const frontMatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/
  const match = cleanContent.match(frontMatterRegex)

  // Handle missing front matter as empty object (Requirement 4.5)
  if (!match) {
    return { frontMatter: {}, body: cleanContent }
  }

  const yamlContent = match[1] ?? ''
  const body = cleanContent.slice(match[0].length)

  const frontMatter: Record<string, unknown> = {}
  const lines = yamlContent.split(/\r?\n/)

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] as string
    if (line.trim() === '') {
      continue
    }

    const colonIndex = line.indexOf(':')
    if (colonIndex === -1) {
      // Report parse error with line number (Requirement 4.6)
      // Line number is 2 + i because line 1 is '---'
      throw new FrontMatterParseError(
        `Invalid YAML: missing colon in key-value pair "${line}"`,
        2 + i,
      )
    }

    const key = line.slice(0, colonIndex).trim()
    if (key === '') {
      throw new FrontMatterParseError(
        `Invalid YAML: empty key in line "${line}"`,
        2 + i,
      )
    }

    let value: unknown = line.slice(colonIndex + 1).trim()

    // Parse value types
    if (value === 'true') {
      value = true
    } else if (value === 'false') {
      value = false
    } else if (value === 'null' || value === '') {
      value = null
    } else if (typeof value === 'string' && /^-?\d+$/.test(value)) {
      value = Number.parseInt(value, 10)
    } else if (typeof value === 'string' && /^-?\d+\.\d+$/.test(value)) {
      value = Number.parseFloat(value)
    } else if (typeof value === 'string' && value.startsWith('"') && value.endsWith('"')) {
      // Handle quoted strings
      value = value.slice(1, -1).replace(/\\"/g, '"')
    }

    frontMatter[key] = value
  }

  return { frontMatter, body }
}

/**
 * Serialize front matter object to YAML format with body
 * Produces valid YAML front matter block followed by content
 *
 * @param frontMatter - Front matter key-value pairs
 * @param body - Content body to append after front matter
 * @returns Complete content with serialized front matter
 * @see Requirements 4.3
 */
export function serializeFrontMatter(
  frontMatter: Record<string, unknown>,
  body: string,
): string {
  // Handle empty front matter
  if (Object.keys(frontMatter).length === 0) {
    return body
  }

  const lines: string[] = ['---']

  for (const [key, value] of Object.entries(frontMatter)) {
    if (typeof value === 'string') {
      // Quote strings containing special YAML characters or that look like numbers
      const needsQuoting = value.includes(':')
        || value.includes('#')
        || value.includes('"')
        || value.includes('\n')
        || /^-?\d+(?:\.\d+)?$/.test(value)
        || value === 'true'
        || value === 'false'
        || value === 'null'
        || value === ''
      if (needsQuoting) {
        lines.push(`${key}: "${value.replace(/"/g, '\\"')}"`)
      } else {
        lines.push(`${key}: ${value}`)
      }
    } else if (typeof value === 'boolean' || typeof value === 'number') {
      lines.push(`${key}: ${value}`)
    } else if (value === null || typeof value === 'undefined') {
      lines.push(`${key}: null`)
    } else {
      // Complex values serialized as JSON
      lines.push(`${key}: ${JSON.stringify(value)}`)
    }
  }

  lines.push('---', '')
  return lines.join('\n') + body
}

/**
 * Merge new properties into existing front matter
 * Preserves original properties while adding/updating new ones
 * Existing properties take precedence over new properties
 *
 * @param existing - Existing front matter object
 * @param additions - New properties to merge
 * @returns Merged front matter object
 * @see Requirements 4.4
 */
export function mergeFrontMatter(
  existing: Record<string, unknown>,
  additions: Record<string, unknown>,
): Record<string, unknown> {
  // Existing properties take precedence (preserve original)
  return { ...additions, ...existing }
}

/**
 * Generate front matter for a specific type
 * Creates appropriate front matter based on tool requirements
 *
 * @param type - Front matter type (e.g., KIRO_ALWAYS, QODER_GLOB)
 * @param options - Optional configuration for generation
 * @returns Generated front matter object
 * @see Requirements 7.4
 */
export function generateFrontMatterByType(
  type: FrontMatterType,
  options?: FrontMatterOptions,
): Record<string, unknown> {
  const base: Record<string, unknown> = {}
  const pattern = options?.filePattern

  switch (type) {
    case FrontMatterType.KIRO_ALWAYS:
      base['inclusion'] = 'always'
      break

    case FrontMatterType.KIRO_FILE_MATCH:
      if (typeof pattern !== 'string' || pattern === '') {
        throw new Error('Pattern is required for KIRO_FILE_MATCH type')
      }
      base['inclusion'] = 'fileMatch'
      base['fileMatchPattern'] = pattern
      break

    case FrontMatterType.QODER_ALWAYS:
      base['trigger'] = 'always_on'
      base['alwaysApply'] = true
      break

    case FrontMatterType.QODER_GLOB:
      if (typeof pattern !== 'string' || pattern === '') {
        throw new Error('Pattern is required for QODER_GLOB type')
      }
      base['trigger'] = 'glob'
      base['glob'] = pattern
      break

    case FrontMatterType.ANTIGRAVITY_ALWAYS:
      base['trigger'] = 'always_on'
      break

    case FrontMatterType.ANTIGRAVITY_GLOB:
      if (typeof pattern !== 'string' || pattern === '') {
        throw new Error('Pattern is required for ANTIGRAVITY_GLOB type')
      }
      base['trigger'] = 'glob'
      base['globs'] = pattern
      break

    case FrontMatterType.WORKFLOW_AUTO:
      base['auto_execution_mode'] = 'automatic'
      break

    default: {
      const exhaustiveCheck: never = type
      throw new Error(`Unknown front matter type: ${String(exhaustiveCheck)}`)
    }
  }

  // Merge additional properties if provided
  if (options?.additionalProps) {
    return { ...base, ...options.additionalProps }
  }

  return base
}

/**
 * Create front matter capability instance
 * Provides all front matter operations through a unified interface
 *
 * @returns FrontMatterCapability implementation
 */
export function createFrontMatterCapability(): FrontMatterCapability {
  return {
    parse: parseFrontMatter,
    serialize: serializeFrontMatter,
    merge: mergeFrontMatter,
    generateByType: generateFrontMatterByType,
  }
}
