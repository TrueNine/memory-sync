/**
 * Blank line cleaner capability implementation
 * Provides method for cleaning whitespace from blank lines
 *
 * @see Requirements 30.2
 */

import type { BlankLineCleanerCapability } from '../types'

/**
 * Detect BOM (Byte Order Mark) at the start of content
 * BOM is the Unicode character U+FEFF at the start of a file
 *
 * @param content - Content that may contain BOM
 * @returns True if content starts with BOM
 */
export function hasBom(content: string): boolean {
  return content.charCodeAt(0) === 0xFEFF
}

/**
 * Detect line ending style used in content
 * Returns the first line ending found, or '\n' as default
 *
 * @param content - Content to analyze
 * @returns Line ending style ('\r\n' for Windows, '\n' for Unix)
 */
export function detectLineEnding(content: string): '\r\n' | '\n' {
  const crlfIndex = content.indexOf('\r\n')
  const lfIndex = content.indexOf('\n')

  // If CRLF found before LF (or LF not found), use CRLF
  if (crlfIndex !== -1 && (lfIndex === -1 || crlfIndex < lfIndex)) {
    return '\r\n'
  }

  return '\n'
}

/**
 * Clean blank lines by removing trailing whitespace
 * Preserves BOM and line endings while cleaning indentation on empty lines
 *
 * @param content - Content to clean
 * @returns Cleaned content with whitespace removed from blank lines
 * @see Requirements 30.2
 */
export function cleanBlankLines(content: string): string {
  // Handle empty content
  if (content === '') {
    return content
  }

  // Detect and preserve BOM
  const bomPresent = hasBom(content)
  const workingContent = bomPresent ? content.slice(1) : content

  // Detect line ending style (preserved for future use)
  const _lineEnding = detectLineEnding(workingContent)
  void _lineEnding

  // Replace blank lines with indentation to just newlines
  // Match lines that only contain whitespace (spaces or tabs)
  // The regex ^[ \t]+$ matches lines containing only spaces/tabs
  const cleaned = workingContent.replace(/^[ \t]+$/gm, '')

  // Restore BOM if it was present
  return bomPresent ? `\uFEFF${cleaned}` : cleaned
}

/**
 * Create blank line cleaner capability instance
 * Provides blank line cleaning through a unified interface
 *
 * @returns BlankLineCleanerCapability implementation
 */
export function createBlankLineCleanerCapability(): BlankLineCleanerCapability {
  return {
    clean: cleanBlankLines,
  }
}
