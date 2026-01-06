// export-parser.ts
// Extracts metadata from MDX export statements

import type { EvaluationScope, MdxjsEsm } from './types'

/**
 * Metadata source type
 */
export type MetadataSource = 'export' | 'yaml' | 'mixed'

/**
 * Export metadata result
 */
export interface ExportMetadata {
  /** Extracted metadata key-value pairs */
  readonly fields: Record<string, unknown>
  /** Metadata source */
  readonly source: MetadataSource
}

/**
 * Options for parsing exports
 */
export interface ParseExportOptions {
  /** Existing YAML front matter (for merging) */
  readonly yamlFrontMatter?: Record<string, unknown>
  /** Evaluation scope for resolving variable references like tool.readFile */
  readonly scope?: EvaluationScope
  /** File path for error messages */
  readonly filePath?: string
}

/**
 * Supported literal types for static evaluation
 */
type SupportedLiteral
  = string
    | number
    | boolean
    | null
    | SupportedLiteral[]
    | { [key: string]: SupportedLiteral }

/**
 * Parses export statements from ESM nodes and extracts metadata.
 *
 * @param esmNodes - Array of MDX ESM nodes containing export statements
 * @param options - Optional configuration including existing YAML front matter
 * @returns ExportMetadata containing extracted fields and source type
 *
 * @example
 * // Single export
 * // export const title = "My Title"
 * // Result: { fields: { title: "My Title" }, source: 'export' }
 *
 * @example
 * // Metadata object (properties are spread)
 * // export const metadata = { name: "test", enabled: true }
 * // Result: { fields: { name: "test", enabled: true }, source: 'export' }
 */
export function parseExports(
  esmNodes: MdxjsEsm[],
  options: ParseExportOptions = {},
): ExportMetadata {
  const exportFields: Record<string, unknown> = {}
  const { yamlFrontMatter, scope, filePath } = options

  for (const node of esmNodes) {
    const extracted = extractExportFromNode(node, scope, filePath)
    Object.assign(exportFields, extracted)
  }

  // Determine metadata source
  const hasExports = Object.keys(exportFields).length > 0
  const hasYaml = yamlFrontMatter != null && Object.keys(yamlFrontMatter).length > 0

  let source: MetadataSource
  if (hasExports && hasYaml) source = 'mixed'
  else if (hasExports) source = 'export'
  else source = 'yaml'

  // Merge: export takes priority over YAML
  const fields = { ...yamlFrontMatter, ...exportFields }

  return { fields, source }
}

/**
 * Extracts export declarations from a single ESM node.
 * Supports both `export const` and `export default` patterns.
 *
 * @param node - MDX ESM node containing export statements
 * @param scope - Optional evaluation scope for resolving variable references
 * @param filePath - Optional file path for error messages
 * @returns Record of extracted key-value pairs
 *
 * @example
 * // export const name = "test" → { name: "test" }
 * // export default { name: "test" } → { name: "test" } (spread)
 */
function extractExportFromNode(
  node: MdxjsEsm,
  scope?: EvaluationScope,
  filePath?: string,
): Record<string, unknown> {
  const result: Record<string, unknown> = {}

  // Parse ESM node's value (source code string)
  const code = node.value.trim()

  // Handle export default pattern first
  // export default { ... } or export default { ... } as const
  const exportDefaultMatch = /^export\s+default\s+/.exec(code)
  if (exportDefaultMatch != null) {
    const valueStartIndex = exportDefaultMatch[0].length
    const valueStr = extractValueString(code, valueStartIndex)

    if (valueStr != null) {
      try {
        const value = parseStaticValue(valueStr.trim(), scope, filePath)

        // export default must be an object to be spread as frontmatter
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) Object.assign(result, value)
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        const fileInfo = filePath != null ? ` in file "${filePath}"` : ''
        throw new Error(`Cannot statically evaluate export default${fileInfo}: ${message}`)
      }
    }

    return result
  }

  // Match export const name = value pattern
  // Handles multiline and various value types
  const exportConstRegex = /export\s+const\s+(\w+)\s*=\s*/g
  let match: RegExpExecArray | null = exportConstRegex.exec(code)

  while (match !== null) {
    const name = match[1]
    if (name == null) {
      match = exportConstRegex.exec(code)
      continue
    }

    // Get the value part starting after the match
    const valueStartIndex = match.index + match[0].length
    const valueStr = extractValueString(code, valueStartIndex)

    if (valueStr == null) {
      match = exportConstRegex.exec(code)
      continue
    }

    try {
      const value = parseStaticValue(valueStr.trim(), scope, filePath)

      // If it's a metadata object, spread its properties
      if (name === 'metadata' && typeof value === 'object' && value !== null && !Array.isArray(value)) Object.assign(result, value)
      else result[name] = value
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      const fileInfo = filePath != null ? ` in file "${filePath}"` : ''
      throw new Error(`Cannot statically evaluate export "${name}"${fileInfo}: ${message}`)
    }

    match = exportConstRegex.exec(code)
  }

  return result
}

/**
 * Extracts the value string from code starting at a given index.
 * Handles nested structures like arrays and objects.
 *
 * @param code - Source code string
 * @param startIndex - Index where the value starts
 * @returns The extracted value string or null if extraction fails
 */
function extractValueString(code: string, startIndex: number): string | null {
  let depth = 0
  let inString: string | null = null
  let escaped = false
  let endIndex = startIndex

  for (let i = startIndex; i < code.length; i++) {
    const char = code[i]

    if (escaped) {
      escaped = false
      continue
    }

    if (char === '\\') {
      escaped = true
      continue
    }

    // Handle string boundaries
    if (inString != null) {
      if (char === inString) inString = null
      continue
    }

    // Start of string
    if (char === '"' || char === '\'' || char === '`') {
      inString = char
      continue
    }

    // Track nesting depth
    if (char === '{' || char === '[') {
      depth++
      continue
    }

    if (char === '}' || char === ']') {
      depth--
      continue
    }

    // End of value: semicolon or newline at depth 0
    if (depth === 0 && (char === ';' || char === '\n')) {
      endIndex = i
      break
    }

    // Handle end of code
    if (i === code.length - 1) endIndex = code.length
  }

  if (endIndex <= startIndex) endIndex = code.length

  const valueStr = code.slice(startIndex, endIndex).trim()
  // Remove trailing semicolon if present
  return valueStr.endsWith(';') ? valueStr.slice(0, -1).trim() : valueStr
}

/**
 * Parses a static value from a string representation.
 * Only supports literals that can be statically evaluated.
 *
 * @param valueStr - String representation of the value
 * @param scope - Optional evaluation scope for resolving variable references
 * @param filePath - Optional file path for error messages
 * @returns The parsed value
 * @throws Error if the value cannot be statically evaluated
 *
 * Supported types:
 * - String literals: "hello", 'world', `template`
 * - Number literals: 42, 3.14, -10
 * - Boolean literals: true, false
 * - Null literal: null
 * - Array literals: [1, 2, 3]
 * - Object literals: { key: "value" }
 * - Variable references (with scope): tool.readFile, profile.name
 */
export function parseStaticValue(
  valueStr: string,
  scope?: EvaluationScope,
  filePath?: string,
): SupportedLiteral {
  const trimmed = valueStr.trim()

  // Handle empty string
  if (trimmed === '') throw new Error('Empty value cannot be evaluated')

  // Boolean literals
  if (trimmed === 'true') return true
  if (trimmed === 'false') return false

  // Null literal
  if (trimmed === 'null') return null

  // Number literals (including negative and decimal)
  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) return Number(trimmed)

  // String literals with double quotes
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) return parseStringLiteral(trimmed.slice(1, -1), '"')

  // String literals with single quotes
  if (trimmed.startsWith('\'') && trimmed.endsWith('\'')) return parseStringLiteral(trimmed.slice(1, -1), '\'')

  // Template literals (without expressions)
  if (trimmed.startsWith('`') && trimmed.endsWith('`')) {
    const inner = trimmed.slice(1, -1)
    if (/\$\{/.test(inner)) throw new Error(`Template literal with expressions cannot be statically evaluated: ${trimmed}`)
    return parseStringLiteral(inner, '`')
  }

  // Array literals
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) return parseArrayLiteral(trimmed, scope, filePath)

  // Object literals
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) return parseObjectLiteral(trimmed, scope, filePath)

  // Variable reference (e.g., tool.readFile, profile.name)
  if (/^[a-z_$][\w$]*(?:\.[a-z_$][\w$]*)*$/i.test(trimmed)) return evaluateVariableReference(trimmed, scope, filePath)

  // Cannot statically evaluate
  const fileInfo = filePath != null ? ` in file "${filePath}"` : ''
  throw new Error(`Expression "${trimmed}" cannot be statically evaluated${fileInfo}`)
}

/**
 * Parses a string literal, handling escape sequences.
 *
 * @param content - String content without quotes
 * @param _quote - Quote character used (unused but kept for API consistency)
 * @returns Parsed string value
 */
function parseStringLiteral(content: string, _quote: string): string {
  // Handle common escape sequences
  return content
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\'/g, '\'')
    .replace(/\\\\/g, '\\')
}

/**
 * Evaluates a variable reference from scope.
 *
 * @param reference - Variable reference string (e.g., "tool.readFile")
 * @param scope - Evaluation scope
 * @param filePath - Optional file path for error messages
 * @returns The resolved value
 * @throws Error if variable is not found in scope
 */
function evaluateVariableReference(
  reference: string,
  scope: EvaluationScope | undefined,
  filePath?: string,
): SupportedLiteral {
  if (scope == null) {
    const fileInfo = filePath != null ? ` in file "${filePath}"` : ''
    throw new Error(`Variable reference "${reference}" cannot be resolved without scope${fileInfo}`)
  }

  const parts = reference.split('.')
  const rootVar = parts[0]

  if (rootVar == null || !(rootVar in scope)) {
    const fileInfo = filePath != null ? ` in file "${filePath}"` : ''
    const availableKeys = Object.keys(scope).join(', ')
    throw new Error(
      `Undefined namespace "${rootVar}" in expression "${reference}"${fileInfo}. Available: ${availableKeys}`,
    )
  }

  let value: unknown = scope[rootVar]
  for (let i = 1; i < parts.length; i++) {
    const prop = parts[i]
    if (prop == null) continue

    if (value == null) {
      const fileInfo = filePath != null ? ` in file "${filePath}"` : ''
      throw new Error(`Cannot read property "${prop}" of null/undefined in "${reference}"${fileInfo}`)
    }

    if (typeof value !== 'object') {
      const fileInfo = filePath != null ? ` in file "${filePath}"` : ''
      throw new Error(`Cannot read property "${prop}" of ${typeof value} in "${reference}"${fileInfo}`)
    }

    const obj = value as Record<string, unknown>
    if (!(prop in obj)) {
      const fileInfo = filePath != null ? ` in file "${filePath}"` : ''
      const availableProps = Object.keys(obj).join(', ')
      throw new Error(
        `Undefined property "${prop}" in "${reference}"${fileInfo}. Available: ${availableProps}`,
      )
    }
    value = obj[prop]
  }

  // Ensure the value is a supported literal type
  if (
    typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'boolean'
    || value === null
    || Array.isArray(value)
    || (typeof value === 'object')
  ) {
    return value as SupportedLiteral
  }

  const fileInfo = filePath != null ? ` in file "${filePath}"` : ''
  throw new Error(`Variable "${reference}" resolved to unsupported type: ${typeof value}${fileInfo}`)
}

/**
 * Parses an array literal.
 *
 * @param valueStr - Array literal string including brackets
 * @param scope - Optional evaluation scope
 * @param filePath - Optional file path for error messages
 * @returns Parsed array
 */
function parseArrayLiteral(
  valueStr: string,
  scope?: EvaluationScope,
  filePath?: string,
): SupportedLiteral[] {
  const inner = valueStr.slice(1, -1).trim()

  // Empty array
  if (inner === '') return []

  // Try JSON parse first (handles most cases without variable references)
  if (scope == null) {
    try {
      const jsonStr = convertToJson(valueStr)
      const parsed: unknown = JSON.parse(jsonStr)
      if (Array.isArray(parsed)) return parsed as SupportedLiteral[]
    } catch {
      // Fall through to manual parsing
    }
  }

  // Manual parsing for arrays with variable references
  const elements = splitArrayElements(inner)
  return elements.map(el => parseStaticValue(el.trim(), scope, filePath))
}

/**
 * Parses an object literal.
 *
 * @param valueStr - Object literal string including braces
 * @param scope - Optional evaluation scope
 * @param filePath - Optional file path for error messages
 * @returns Parsed object
 */
function parseObjectLiteral(
  valueStr: string,
  scope?: EvaluationScope,
  filePath?: string,
): { [key: string]: SupportedLiteral } {
  const inner = valueStr.slice(1, -1).trim()

  // Empty object
  if (inner === '') return {}

  // Try JSON parse first (only if no scope needed)
  if (scope == null) {
    try {
      const jsonStr = convertToJson(valueStr)
      const parsed: unknown = JSON.parse(jsonStr)
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) return parsed as { [key: string]: SupportedLiteral }
    } catch {
      // Fall through to manual parsing
    }
  }

  // Manual parsing for objects with variable references
  const result: { [key: string]: SupportedLiteral } = {}
  const pairs = splitObjectPairs(inner)

  for (const pair of pairs) {
    const colonIndex = findKeyValueSeparator(pair)
    if (colonIndex === -1) continue

    let key = pair.slice(0, colonIndex).trim()
    const value = pair.slice(colonIndex + 1).trim()

    // Remove quotes from key if present
    if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith('\'') && key.endsWith('\''))) key = key.slice(1, -1)

    result[key] = parseStaticValue(value, scope, filePath)
  }

  return result
}

/**
 * Converts JavaScript object/array literal to JSON format.
 * Handles single quotes and unquoted keys.
 *
 * @param jsLiteral - JavaScript literal string
 * @returns JSON-compatible string
 */
function convertToJson(jsLiteral: string): string {
  let result = ''
  let inString: string | null = null
  let escaped = false

  for (let i = 0; i < jsLiteral.length; i++) {
    const char = jsLiteral[i]

    if (escaped) {
      result += char
      escaped = false
      continue
    }

    if (char === '\\') {
      result += char
      escaped = true
      continue
    }

    if (inString != null) {
      if (char === inString) {
        result += '"'
        inString = null
      }
      else if (char === '"' && inString === '\'') result += '\\"'
      else result += char
      continue
    }

    if (char === '"' || char === '\'') {
      result += '"'
      inString = char
      continue
    }

    // Handle unquoted keys in objects
    if (char === ':' && i > 0) {
      // Look back to find the key start
      const keyEnd = result.length
      let keyStart = keyEnd - 1

      // Skip whitespace
      while (keyStart >= 0 && /\s/.test(result.charAt(keyStart))) {
        keyStart--
      }

      // Find key start (word characters)
      const keyEndPos = keyStart + 1
      while (keyStart >= 0 && /[\w$]/.test(result.charAt(keyStart))) {
        keyStart--
      }
      keyStart++

      // Check if key is already quoted
      if (keyStart > 0 && result.charAt(keyStart - 1) !== '"') {
        const key = result.slice(keyStart, keyEndPos)
        if (key.length > 0 && /^[\w$]+$/.test(key)) result = `${result.slice(0, keyStart)}"${key}"`
      }
    }

    result += char
  }

  return result
}

/**
 * Splits array elements respecting nested structures.
 *
 * @param inner - Array content without brackets
 * @returns Array of element strings
 */
function splitArrayElements(inner: string): string[] {
  const elements: string[] = []
  let current = ''
  let depth = 0
  let inString: string | null = null
  let escaped = false

  for (const char of inner) {
    if (escaped) {
      current += char
      escaped = false
      continue
    }

    if (char === '\\') {
      current += char
      escaped = true
      continue
    }

    if (inString != null) {
      current += char
      if (char === inString) inString = null
      continue
    }

    if (char === '"' || char === '\'' || char === '`') {
      current += char
      inString = char
      continue
    }

    if (char === '[' || char === '{') {
      depth++
      current += char
      continue
    }

    if (char === ']' || char === '}') {
      depth--
      current += char
      continue
    }

    if (char === ',' && depth === 0) {
      if (current.trim() !== '') elements.push(current.trim())
      current = ''
      continue
    }

    current += char
  }

  if (current.trim() !== '') elements.push(current.trim())

  return elements
}

/**
 * Splits object key-value pairs respecting nested structures.
 *
 * @param inner - Object content without braces
 * @returns Array of key-value pair strings
 */
function splitObjectPairs(inner: string): string[] {
  return splitArrayElements(inner)
}

/**
 * Finds the colon separator between key and value in an object pair.
 *
 * @param pair - Key-value pair string
 * @returns Index of the colon or -1 if not found
 */
function findKeyValueSeparator(pair: string): number {
  let inString: string | null = null
  let escaped = false

  for (let i = 0; i < pair.length; i++) {
    const char = pair[i]

    if (escaped) {
      escaped = false
      continue
    }

    if (char === '\\') {
      escaped = true
      continue
    }

    if (inString != null) {
      if (char === inString) inString = null
      continue
    }

    if (char === '"' || char === '\'' || char === '`') {
      inString = char
      continue
    }

    if (char === ':') return i
  }

  return -1
}

/**
 * Checks if a value string can be statically evaluated.
 *
 * @param valueStr - String representation of the value
 * @returns true if the value can be statically evaluated
 *
 * @example
 * isStaticallyEvaluable('"hello"') // true
 * isStaticallyEvaluable('42') // true
 * isStaticallyEvaluable('someFunction()') // false
 * isStaticallyEvaluable('variable') // false
 */
export function isStaticallyEvaluable(valueStr: string): boolean {
  try {
    parseStaticValue(valueStr)
    return true
  } catch {
    return false
  }
}
