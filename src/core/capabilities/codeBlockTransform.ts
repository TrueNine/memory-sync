/**
 * Code block transformation capability implementation
 * Provides methods for extracting, transforming, and reassembling code blocks
 *
 * @see Requirements 30.4, 4.7, 4.8, 27.1, 27.2, 27.4, 27.5, 27.6
 */

import type { CodeBlock, CodeBlockTransformCapability } from '../types'

/**
 * Simple string pattern for TOON format
 * Matches alphanumeric characters, underscores, hyphens, dots, and slashes
 */
const SIMPLE_STRING_PATTERN = /^[\w./-]+$/

/**
 * Extract code blocks from Markdown content
 * Parses fenced code blocks with language identifiers
 *
 * @param content - Markdown content containing code blocks
 * @returns Array of parsed code blocks with metadata
 * @see Requirements 4.7, 4.8
 */
export function extractCodeBlocks(content: string): CodeBlock[] {
  const blocks: CodeBlock[] = []
  const lines = content.split(/\r?\n/)

  let inCodeBlock = false
  let currentFence = ''
  let currentLanguage = ''
  let currentStartLine = 0
  let contentLines: string[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] as string
    const lineNumber = i + 1

    // Check for opening fence (``` or ~~~ followed by optional language)
    const openMatch = line.match(/^(```|~~~)([\w-]*)$/)
    if (openMatch && !inCodeBlock) {
      inCodeBlock = true
      currentFence = openMatch[1] as string
      currentLanguage = openMatch[2] ?? ''
      currentStartLine = lineNumber
      contentLines = []
      continue
    }

    // Check for closing fence (must match opening fence)
    if (inCodeBlock) {
      const closingPattern = new RegExp(`^${currentFence}\\s*$`)
      if (closingPattern.test(line)) {
        blocks.push({
          language: currentLanguage,
          content: contentLines.join('\n'),
          startLine: currentStartLine,
          endLine: lineNumber,
          fence: currentFence,
        })
        inCodeBlock = false
        currentFence = ''
        currentLanguage = ''
        currentStartLine = 0
        contentLines = []
        continue
      }
      contentLines.push(line)
    }
  }

  return blocks
}

/**
 * Transform JSON to TOON format
 * TOON (Text Object Notation) is a simplified format that reduces token count
 * while preserving semantic meaning
 *
 * TOON format rules:
 * - No quotes around keys
 * - No quotes around simple string values (alphanumeric, underscores, hyphens)
 * - No commas between properties
 * - Uses 2-space indentation
 * - Arrays use bracket notation without commas
 *
 * @param json - JSON string to transform
 * @param _format - Target format (currently only 'toon' supported)
 * @returns Transformed content in TOON format
 * @see Requirements 27.1, 27.2, 27.4
 */
export function transformJsonToToon(json: string, _format: 'toon'): string {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return json
  }
  return toToon(parsed, 0)
}

/**
 * Convert a value to TOON format with specified indentation level
 *
 * @param value - Value to convert
 * @param indent - Current indentation level
 * @returns TOON formatted string
 */
function toToon(value: unknown, indent: number): string {
  const spaces = '  '.repeat(indent)
  const childSpaces = '  '.repeat(indent + 1)

  if (value === null || typeof value === 'undefined') {
    return 'null'
  }

  if (typeof value === 'boolean' || typeof value === 'number') {
    return String(value)
  }

  if (typeof value === 'string') {
    if (SIMPLE_STRING_PATTERN.test(value) && value.length > 0) {
      return value
    }
    return JSON.stringify(value)
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return '[]'
    }
    const allPrimitives = value.every(
      (item) => typeof item !== 'object' || item === null,
    )
    if (allPrimitives && value.length <= 5) {
      const items = value.map((item) => toToon(item, 0))
      return `[${items.join(' ')}]`
    }
    const lines: string[] = ['[']
    for (const item of value) {
      const itemStr = toToon(item, indent + 1)
      lines.push(`${childSpaces}- ${itemStr}`)
    }
    lines.push(`${spaces}]`)
    return lines.join('\n')
  }

  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>
    const keys = Object.keys(obj)
    if (keys.length === 0) {
      return '{}'
    }
    const lines: string[] = ['{']
    for (const key of keys) {
      const valStr = toToon(obj[key], indent + 1)
      if (typeof obj[key] === 'object' && obj[key] !== null) {
        lines.push(`${childSpaces}${key}:`)
        const indentedVal = valStr.split('\n').map((line, i) =>
          i === 0 ? `${childSpaces}  ${line}` : line,
        ).join('\n')
        lines.push(indentedVal)
      } else {
        lines.push(`${childSpaces}${key}: ${valStr}`)
      }
    }
    lines.push(`${spaces}}`)
    return lines.join('\n')
  }

  return String(value)
}

/**
 * Reassemble content with transformed code blocks
 * Replaces original code blocks with transformed versions
 *
 * @param content - Original Markdown content
 * @param blocks - Transformed code blocks to insert
 * @returns Content with code blocks replaced
 * @see Requirements 27.5, 27.6
 */
export function reassembleCodeBlocks(content: string, blocks: CodeBlock[]): string {
  if (blocks.length === 0) {
    return content
  }

  const lines = content.split(/\r?\n/)
  const result: string[] = []
  const sortedBlocks = [...blocks].sort((a, b) => b.startLine - a.startLine)
  const skipRanges: Array<{ start: number, end: number, block: CodeBlock }> = []

  let inCodeBlock = false
  let blockStart = 0
  let currentFence = ''

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] as string
    const lineNumber = i + 1

    const openMatch = line.match(/^(```|~~~)[\w-]*$/)
    if (openMatch && !inCodeBlock) {
      inCodeBlock = true
      blockStart = lineNumber
      currentFence = openMatch[1] as string
      continue
    }

    if (inCodeBlock) {
      const closingPattern = new RegExp(`^${currentFence}\\s*$`)
      if (closingPattern.test(line)) {
        const matchingBlock = sortedBlocks.find(
          (b) => b.startLine === blockStart && b.endLine === lineNumber,
        )
        if (matchingBlock) {
          skipRanges.push({ start: blockStart, end: lineNumber, block: matchingBlock })
        }
        inCodeBlock = false
        currentFence = ''
      }
    }
  }

  let currentLine = 1
  for (const range of skipRanges.sort((a, b) => a.start - b.start)) {
    while (currentLine < range.start) {
      result.push(lines[currentLine - 1] as string)
      currentLine++
    }
    result.push(`${range.block.fence}${range.block.language}`)
    result.push(range.block.content)
    result.push(range.block.fence)
    currentLine = range.end + 1
  }

  while (currentLine <= lines.length) {
    result.push(lines[currentLine - 1] as string)
    currentLine++
  }

  return result.join('\n')
}

/**
 * Create code block transform capability instance
 * Provides all code block operations through a unified interface
 *
 * @returns CodeBlockTransformCapability implementation
 */
export function createCodeBlockTransformCapability(): CodeBlockTransformCapability {
  return {
    extract: extractCodeBlocks,
    transformJson: transformJsonToToon,
    reassemble: reassembleCodeBlocks,
  }
}
