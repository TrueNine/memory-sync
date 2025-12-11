/**
 * Front matter capability implementation
 * Provides methods for parsing, serializing, merging, and generating front matter
 * Integrates markdown AST parsing for complete document processing
 *
 * @see Requirements 30.1, 4.1, 4.3, 4.4, 4.5, 4.6, 7.4
 */

import type { Root, RootContent } from 'mdast'
import type {
  FrontMatterCapability,
  FrontMatterOptions,
  MarkdownCapability,
  ParsedDocument,
  ParsedFrontMatter,
} from '../types'
import {
  buildMarkdown,
  extractFrontmatter,
  generateFrontmatterString,
  parseMarkdown,
  stringifyMarkdown,
  stripFrontmatter,
} from '../../utils/markdownParser'
import { FrontMatterType } from '../types'

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
  const frontMatter = extractFrontmatter<Record<string, unknown>>(cleanContent)
  const body = stripFrontmatter(cleanContent)

  // Handle missing front matter as empty object (Requirement 4.5)
  return {
    frontMatter: frontMatter ?? {},
    body,
  }
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

  return buildMarkdown(frontMatter, body)
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
 * Legacy options interface for backward compatibility
 */
interface LegacyFrontMatterOptions {
  type: FrontMatterType
  pattern?: string
}

/**
 * Generate YAML front matter string based on type and options
 * Supports both legacy `pattern` and new `filePattern` fields
 *
 * @param options - Front matter generation options
 * @returns YAML front matter string with delimiters and trailing newline
 */
export function generateFrontMatter(
  options: FrontMatterOptions | LegacyFrontMatterOptions,
): string {
  // Support legacy `pattern` field for backward compatibility
  const filePattern = 'filePattern' in options
    ? options.filePattern
    : (options as LegacyFrontMatterOptions).pattern

  const normalizedOptions: FrontMatterOptions = { type: options.type }
  if (filePattern != null) {
    normalizedOptions.filePattern = filePattern
  }
  if ('additionalProps' in options && options.additionalProps != null) {
    normalizedOptions.additionalProps = options.additionalProps
  }

  const data = generateFrontMatterByType(normalizedOptions.type, normalizedOptions)
  return generateFrontmatterString(data)
}

/**
 * Add front matter to content
 * Removes BOM if present before adding front matter
 *
 * @param content - Original content
 * @param frontMatter - Front matter string to prepend
 * @returns Content with front matter prepended
 */
export function addFrontMatter(content: string, frontMatter: string): string {
  const cleanContent = removeBom(content)
  return frontMatter + cleanContent
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

/**
 * Create markdown capability instance
 * Provides complete markdown document processing with AST support
 *
 * @returns MarkdownCapability implementation
 */
export function createMarkdownCapability(): MarkdownCapability {
  return {
    parse: <T = Record<string, unknown>>(content: string): ParsedDocument<T> => {
      const cleanContent = removeBom(content)
      const parsed = parseMarkdown<T>(cleanContent)
      return {
        frontmatter: parsed.frontmatter,
        rawFrontmatter: parsed.rawFrontmatter,
        ast: parsed.ast,
        content: parsed.content,
        raw: cleanContent,
      }
    },

    stringify: (ast: unknown): string => {
      return stringifyMarkdown(ast as Root)
    },

    build: <T = Record<string, unknown>>(
      frontmatter: T | null,
      content: unknown[] | string,
    ): string => {
      return buildMarkdown(frontmatter, content as RootContent[] | string)
    },

    transformFrontmatter: (
      frontmatter: Record<string, unknown>,
      targetType: FrontMatterType,
      options?: FrontMatterOptions,
    ): Record<string, unknown> => {
      const generated = generateFrontMatterByType(targetType, options)
      return mergeFrontMatter(frontmatter, generated)
    },

    stripFrontmatter: (content: string): string => {
      return stripFrontmatter(removeBom(content))
    },

    extractFrontmatter: <T = Record<string, unknown>>(content: string): T | null => {
      return extractFrontmatter<T>(removeBom(content))
    },
  }
}
