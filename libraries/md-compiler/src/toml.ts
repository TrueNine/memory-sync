export interface BuildTomlDocumentOptions {
  readonly fieldOrder?: readonly string[]
}

export interface BuildPromptTomlArtifactOptions extends BuildTomlDocumentOptions {
  readonly content: string
  readonly bodyFieldName: string
  readonly frontMatter?: Readonly<Record<string, unknown>>
  readonly fieldNameMap?: Readonly<Record<string, string>>
  readonly excludedKeys?: readonly string[]
  readonly extraFields?: Readonly<Record<string, unknown>>
}

type TomlScalar = string | number | boolean | Date | bigint
type TomlObject = Readonly<Record<string, unknown>>

function isPlainObject(value: unknown): value is TomlObject {
  return value != null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)
}

function isTomlScalar(value: unknown): value is TomlScalar {
  return typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'boolean'
    || typeof value === 'bigint'
    || value instanceof Date
}

function isArrayOfTables(value: readonly unknown[]): value is readonly TomlObject[] {
  return value.length > 0 && value.every(item => isPlainObject(item))
}

function normalizeValue(value: unknown): unknown {
  if (value == null) return void 0
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'bigint') return value.toString()

  if (Array.isArray(value)) {
    return value
      .map(item => normalizeValue(item))
      .filter((item): item is Exclude<unknown, undefined> => item !== void 0)
  }

  if (!isPlainObject(value)) return value

  const normalizedObject: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    const normalizedItem = normalizeValue(item)
    if (normalizedItem !== void 0) normalizedObject[key] = normalizedItem
  }
  return normalizedObject
}

function isBareTomlKey(key: string): boolean {
  return /^[\w-]+$/u.test(key)
}

function formatTomlKey(key: string): string {
  if (isBareTomlKey(key)) return key

  return JSON.stringify(key)
}

function formatTomlKeyPath(path: readonly string[]): string {
  return path.map(part => formatTomlKey(part)).join('.')
}

function formatMultilineTomlString(value: string): string {
  const normalizedValue = value.replaceAll(/\r\n?/gu, '\n')
  let escapedValue = ''

  for (const character of normalizedValue) {
    switch (character) {
      case '\\': escapedValue += '\\\\'; break
      case '"': escapedValue += '\\"'; break
      case '\b': escapedValue += '\\b'; break
      case '\t': escapedValue += '\\t'; break
      case '\f': escapedValue += '\\f'; break
      case '\n': escapedValue += '\n'; break
      default: {
        const codePoint = character.codePointAt(0)
        if (codePoint != null && codePoint < 0x20) {
          escapedValue += `\\u${codePoint.toString(16).padStart(4, '0')}`
          break
        }

        escapedValue += character
      }
    }
  }

  return `"""\n${escapedValue}"""`
}

function formatTomlScalar(value: TomlScalar): string {
  if (typeof value === 'string') {
    if (value.includes('\n') || value.includes('\r')) return formatMultilineTomlString(value)

    return JSON.stringify(value)
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`Unsupported TOML number value: ${value}`)

    return String(value)
  }

  if (typeof value === 'boolean') return value ? 'true' : 'false'

  if (typeof value === 'bigint') return value.toString()

  return JSON.stringify(value.toISOString())
}

function formatInlineTomlValue(value: unknown): string {
  if (value == null) throw new TypeError('TOML inline value cannot be null or undefined')

  if (isTomlScalar(value)) return formatTomlScalar(value)

  if (Array.isArray(value)) {
    if (isArrayOfTables(value)) throw new TypeError('TOML inline arrays of tables are not supported')

    const inlineItems: string[] = []
    const inlineArray: readonly unknown[] = value
    for (const item of inlineArray) inlineItems.push(formatInlineTomlValue(item))
    return `[${inlineItems.join(', ')}]`
  }

  const entries: string[] = []
  for (const [key, item] of Object.entries(value)) entries.push(`${formatTomlKey(key)} = ${formatInlineTomlValue(item)}`)
  return `{ ${entries.join(', ')} }`
}

function orderEntries(
  entries: readonly [string, unknown][],
  fieldOrder?: readonly string[]
): readonly [string, unknown][] {
  if (fieldOrder == null || fieldOrder.length === 0) return [...entries]

  const priority = new Map<string, number>()
  for (const [index, key] of fieldOrder.entries()) priority.set(key, index)

  return [...entries].sort(([leftKey], [rightKey]) => {
    const leftPriority = priority.get(leftKey)
    const rightPriority = priority.get(rightKey)

    if (leftPriority != null && rightPriority != null) return leftPriority - rightPriority

    if (leftPriority != null) return -1

    if (rightPriority != null) return 1

    return leftKey.localeCompare(rightKey)
  })
}

function splitTomlEntries(
  value: TomlObject,
  fieldOrder?: readonly string[]
): {
  readonly scalarEntries: readonly [string, unknown][]
  readonly tableEntries: readonly [string, TomlObject][]
  readonly arrayTableEntries: readonly [string, readonly TomlObject[]][]
} {
  const orderedEntries = orderEntries(Object.entries(value), fieldOrder)
  const scalarEntries: [string, unknown][] = []
  const tableEntries: [string, TomlObject][] = []
  const arrayTableEntries: [string, readonly TomlObject[]][] = []

  for (const [key, entryValue] of orderedEntries) {
    if (entryValue == null) continue

    if (Array.isArray(entryValue)) {
      if (isArrayOfTables(entryValue)) {
        arrayTableEntries.push([key, entryValue])
        continue
      }

      scalarEntries.push([key, entryValue])
      continue
    }

    if (isPlainObject(entryValue)) {
      tableEntries.push([key, entryValue])
      continue
    }

    scalarEntries.push([key, entryValue])
  }

  return {
    scalarEntries,
    tableEntries,
    arrayTableEntries
  }
}

function renderTomlSection(
  path: readonly string[],
  value: TomlObject,
  options?: BuildTomlDocumentOptions,
  emitTableHeader = true
): readonly string[] {
  const lines: string[] = []
  const {scalarEntries, tableEntries, arrayTableEntries} = splitTomlEntries(value, options?.fieldOrder)

  if (emitTableHeader && path.length > 0) lines.push(`[${formatTomlKeyPath(path)}]`)

  for (const [key, entryValue] of scalarEntries) lines.push(`${formatTomlKey(key)} = ${formatInlineTomlValue(entryValue)}`)

  for (const [key, tableValue] of tableEntries) {
    if (lines.length > 0) lines.push('')

    lines.push(...renderTomlSection([...path, key], tableValue, options))
  }

  for (const [key, tableValues] of arrayTableEntries) {
    for (const tableValue of tableValues) {
      if (lines.length > 0) lines.push('')

      lines.push(`[[${formatTomlKeyPath([...path, key])}]]`)
      const nestedLines = renderTomlSection([...path, key], tableValue, options, false)
      lines.push(...nestedLines)
    }
  }

  return lines
}

export function buildTomlDocument(
  value: Readonly<Record<string, unknown>>,
  options?: BuildTomlDocumentOptions
): string {
  const normalizedValue = normalizeValue(value)
  if (!isPlainObject(normalizedValue)) throw new TypeError('TOML document root must be an object')

  const lines = renderTomlSection([], normalizedValue, options)
  return lines.join('\n')
}

export function buildPromptTomlArtifact(options: BuildPromptTomlArtifactOptions): string {
  const {
    content,
    bodyFieldName,
    frontMatter,
    fieldNameMap,
    excludedKeys,
    extraFields,
    fieldOrder
  } = options
  const excludedKeySet = new Set(excludedKeys ?? [])
  const mappedFields: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(frontMatter ?? {})) {
    if (excludedKeySet.has(key)) continue

    const mappedKey = fieldNameMap?.[key] ?? key
    mappedFields[mappedKey] = value
  }

  if (extraFields != null) {
    for (const [key, value] of Object.entries(extraFields)) mappedFields[key] = value
  }

  mappedFields[bodyFieldName] = content
  return buildTomlDocument(mappedFields, {
    ...fieldOrder != null && {fieldOrder}
  })
}
