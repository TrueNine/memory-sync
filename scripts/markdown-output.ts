import process from 'node:process'

export type MarkdownStream = 'stdout' | 'stderr'

type MarkdownValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | readonly MarkdownValue[]
  | {[key: string]: MarkdownValue}

function indent(depth: number): string {
  return '  '.repeat(depth)
}

function scalarToText(value: Exclude<MarkdownValue, readonly MarkdownValue[] | {[key: string]: MarkdownValue}>): string {
  if (value == null) return 'null'
  return String(value)
}

function appendMarkdownValue(lines: string[], label: string | undefined, value: MarkdownValue, depth: number): void {
  const prefix = `${indent(depth)}- `

  if (
    value == null
    || typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'boolean'
  ) {
    lines.push(label == null
      ? `${prefix}${scalarToText(value)}`
      : `${prefix}${label}: ${scalarToText(value)}`)
    return
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      lines.push(label == null ? `${prefix}[]` : `${prefix}${label}: []`)
      return
    }

    if (label != null) lines.push(`${prefix}${label}:`)
    for (const item of value) appendMarkdownValue(lines, void 0, item, label == null ? depth : depth + 1)
    return
  }

  const entries = Object.entries(value)
  if (entries.length === 0) {
    lines.push(label == null ? `${prefix}{}` : `${prefix}${label}: {}`)
    return
  }

  if (label != null) {
    lines.push(`${prefix}${label}:`)
    for (const [key, nested] of entries) appendMarkdownValue(lines, key, nested, depth + 1)
    return
  }

  for (const [key, nested] of entries) appendMarkdownValue(lines, key, nested, depth)
}

function toMarkdownLines(details: Record<string, MarkdownValue>): string[] {
  const lines: string[] = []
  for (const [key, value] of Object.entries(details)) {
    if (value === undefined) continue
    appendMarkdownValue(lines, key, value, 0)
  }
  return lines
}

export function renderMarkdownBlock(title: string, details?: Record<string, MarkdownValue>): string {
  const lines = [`### ${title}`]
  const detailLines = details == null ? [] : toMarkdownLines(details)
  if (detailLines.length > 0) {
    lines.push('', ...detailLines)
  }
  return lines.join('\n')
}

export function writeMarkdown(markdown: string, stream: MarkdownStream = 'stdout'): void {
  const normalized = markdown.trimEnd()
  process[stream].write(`${normalized}\n`)
}

export function writeMarkdownBlock(
  title: string,
  details?: Record<string, MarkdownValue>,
  stream: MarkdownStream = 'stdout'
): void {
  writeMarkdown(renderMarkdownBlock(title, details), stream)
}

export function writeWarning(
  title: string,
  details?: Record<string, MarkdownValue>
): void {
  writeMarkdownBlock(title, details, 'stderr')
}

export function writeError(
  title: string,
  details?: Record<string, MarkdownValue>
): void {
  writeMarkdownBlock(title, details, 'stderr')
}

const markdownOutput = {
  renderMarkdownBlock,
  writeMarkdown,
  writeMarkdownBlock,
  writeWarning,
  writeError,
}

export default markdownOutput
