/**
 * Markdown parser utilities based on unified/remark ecosystem
 * Provides frontmatter extraction and structured AST parsing
 */

import type { Root, RootContent } from 'mdast'
import remarkFrontmatter from 'remark-frontmatter'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import remarkStringify from 'remark-stringify'
import { unified } from 'unified'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'

/**
 * YAML frontmatter node type (from mdast-util-frontmatter)
 */
interface YamlNode {
  type: 'yaml'
  value: string
}

/**
 * Extended RootContent type including YAML frontmatter node
 */
type ExtendedRootContent = RootContent | YamlNode

/**
 * Parsed markdown document with frontmatter and AST
 */
export interface ParsedMarkdown<T = Record<string, unknown>> {
  /**
   * Parsed frontmatter data
   */
  frontmatter: T | null
  /**
   * Raw frontmatter string (without delimiters)
   */
  rawFrontmatter: string | null
  /**
   * Markdown AST (mdast)
   */
  ast: Root
  /**
   * Content nodes (excluding frontmatter)
   */
  content: RootContent[]
}

/**
 * Type guard for YAML frontmatter node
 */
function isYamlNode(node: ExtendedRootContent): node is YamlNode {
  return node.type === 'yaml'
}

/**
 * Safely parse YAML content
 */
function safeParseYaml<T>(content: string): T | null {
  try {
    return parseYaml(content) as T
  } catch {
    return null
  }
}

/**
 * Parse markdown content into structured AST with frontmatter extraction
 *
 * @param markdown - Raw markdown string
 * @returns Parsed markdown with frontmatter and AST
 */
export function parseMarkdown<T = Record<string, unknown>>(markdown: string): ParsedMarkdown<T> {
  const processor = unified()
    .use(remarkParse)
    .use(remarkFrontmatter, ['yaml'])
    .use(remarkGfm)

  const parsed = processor.parse(markdown)
  const rawChildren = parsed.children as ExtendedRootContent[]

  let frontmatter: T | null = null
  let rawFrontmatter: string | null = null
  const content: RootContent[] = []

  for (const node of rawChildren) {
    if (isYamlNode(node)) {
      rawFrontmatter = node.value
      frontmatter = safeParseYaml<T>(node.value)
    } else {
      content.push(node as RootContent)
    }
  }

  const ast: Root = {
    type: 'root',
    children: content,
  }

  return {
    frontmatter,
    rawFrontmatter,
    ast,
    content,
  }
}

/**
 * Stringify AST back to markdown
 *
 * @param ast - Markdown AST
 * @returns Markdown string
 */
export function stringifyMarkdown(ast: Root): string {
  const processor = unified()
    .use(remarkStringify)
    .use(remarkFrontmatter, ['yaml'])
    .use(remarkGfm)

  return String(processor.stringify(ast))
}

/**
 * Build a new markdown document from frontmatter and content
 *
 * @param frontmatter - Frontmatter data object
 * @param content - Content nodes or raw markdown string
 * @returns Markdown string
 */
export function buildMarkdown<T = Record<string, unknown>>(
  frontmatter: T | null,
  content: RootContent[] | string = [],
): string {
  const parts: string[] = []

  if (frontmatter != null) {
    const yamlContent = stringifyYaml(frontmatter).trim()
    parts.push(`---\n${yamlContent}\n---\n`)
  }

  if (typeof content === 'string') {
    parts.push(content)
  } else if (content.length > 0) {
    const contentAst: Root = {
      type: 'root',
      children: content,
    }
    parts.push(stringifyMarkdown(contentAst))
  }

  return parts.join('\n')
}

/**
 * Generate frontmatter string only (without content)
 *
 * @param data - Frontmatter data object
 * @returns YAML frontmatter string with delimiters and trailing newline
 */
export function generateFrontmatterString<T = Record<string, unknown>>(data: T): string {
  const yamlContent = stringifyYaml(data).trim()
  return `---
${yamlContent}
---

`
}

/**
 * Extract frontmatter from markdown without full AST parsing
 * Lightweight alternative when only frontmatter is needed
 *
 * @param markdown - Raw markdown string
 * @returns Frontmatter data or null
 */
export function extractFrontmatter<T = Record<string, unknown>>(markdown: string): T | null {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(markdown)
  if (match?.[1] == null) {
    return null
  }
  return safeParseYaml<T>(match[1])
}

/**
 * Remove frontmatter from markdown content
 *
 * @param markdown - Raw markdown string
 * @returns Markdown content without frontmatter
 */
export function stripFrontmatter(markdown: string): string {
  return markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n*/, '')
}
