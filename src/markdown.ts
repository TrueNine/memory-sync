import type { Root, RootContent } from 'mdast'
import remarkFrontmatter from 'remark-frontmatter'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import { unified } from 'unified'
import * as YAML from 'yaml'

export interface ParsedMarkdown<Y = Record<string, unknown>> {
  /**
   * Parsed YAML front matter object
   */
  readonly yamlFrontMatter?: Y
  /**
   * Raw YAML front matter string (without --- delimiters)
   */
  readonly rawFrontMatter?: string
  /**
   * Markdown AST root node
   */
  readonly markdownAst: Root
  /**
   * Markdown content nodes (excluding YAML front matter node)
   */
  readonly markdownContents: readonly RootContent[]
  /**
   * Content string without YAML front matter
   */
  readonly contentWithoutFrontMatter: string
}

/**
 * Options for building markdown content with front matter
 */
export interface BuildMarkdownOptions {
  /**
   * Whether to use single quotes for strings in YAML
   * @default false (uses double quotes)
   */
  readonly singleQuote?: boolean
  /**
   * Line width for YAML output (0 = no wrapping)
   * @default 0
   */
  readonly lineWidth?: number
}

/**
 * Build YAML front matter string from an object.
 * Uses the yaml library for proper serialization.
 *
 * @param frontMatter - The front matter object to serialize
 * @param options - Optional configuration for YAML output
 * @returns YAML front matter string with --- delimiters
 *
 * @example
 * ```typescript
 * const fm = buildFrontMatter({ name: 'test', keywords: ['a', 'b'] })
 * // Returns:
 * // ---
 * // name: test
 * // keywords:
 * //   - a
 * //   - b
 * // ---
 * ```
 */
export function buildFrontMatter(
  frontMatter: Record<string, unknown>,
  options?: BuildMarkdownOptions,
): string {
  // Filter out undefined/null values
  const cleanedFrontMatter = Object.fromEntries(
    Object.entries(frontMatter).filter(([_, v]) => v != null),
  )

  if (Object.keys(cleanedFrontMatter).length === 0) return '---\n---'

  const yamlStr = YAML.stringify(cleanedFrontMatter, {
    singleQuote: options?.singleQuote ?? false,
    lineWidth: options?.lineWidth ?? 0,
  }).trimEnd()

  return `---\n${yamlStr}\n---`
}

/**
 * Build complete markdown content with front matter.
 * Combines front matter object with markdown body content.
 *
 * @param frontMatter - The front matter object (or undefined/null to skip)
 * @param content - The markdown body content
 * @param options - Optional configuration for YAML output
 * @returns Complete markdown string with front matter
 *
 * @example
 * ```typescript
 * const md = buildMarkdownWithFrontMatter(
 *   { title: 'My Doc', tags: ['a', 'b'] },
 *   '# Hello World'
 * )
 * // Returns:
 * // ---
 * // title: My Doc
 * // tags:
 * //   - a
 * //   - b
 * // ---
 * // # Hello World
 * ```
 */
export function buildMarkdownWithFrontMatter(
  frontMatter: Record<string, unknown> | undefined | null,
  content: string,
  options?: BuildMarkdownOptions,
): string {
  if (frontMatter == null || Object.keys(frontMatter).length === 0) return content

  const fmStr = buildFrontMatter(frontMatter, options)
  return `${fmStr}\n${content}`
}

/**
 * Build raw YAML front matter string (without --- delimiters).
 * Useful when you need just the YAML content.
 *
 * @param frontMatter - The front matter object to serialize
 * @param options - Optional configuration for YAML output
 * @returns Raw YAML string without delimiters
 */
export function buildRawFrontMatter(
  frontMatter: Record<string, unknown>,
  options?: BuildMarkdownOptions,
): string {
  const cleanedFrontMatter = Object.fromEntries(
    Object.entries(frontMatter).filter(([_, v]) => v != null),
  )

  if (Object.keys(cleanedFrontMatter).length === 0) return ''

  return YAML.stringify(cleanedFrontMatter, {
    singleQuote: options?.singleQuote ?? false,
    lineWidth: options?.lineWidth ?? 0,
  }).trimEnd()
}

/**
 * Parse markdown content and extract YAML front matter
 */
export function parseMarkdown<Y = Record<string, unknown>>(rawContent: string): ParsedMarkdown<Y> {
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkFrontmatter, ['yaml'])

  const ast = processor.parse(rawContent)

  let yamlFrontMatter: Y | undefined
  let rawFrontMatter: string | undefined
  const markdownContents: RootContent[] = []

  for (const node of ast.children) {
    if (node.type === 'yaml') {
      const yamlNode = node
      rawFrontMatter = yamlNode.value
      try {
        yamlFrontMatter = YAML.parse(yamlNode.value) as Y
      } catch {
        // YAML parsing failed, keep raw front matter
      }
    }
    else markdownContents.push(node)
  }

  // Calculate content without front matter
  let contentWithoutFrontMatter = rawContent
  if (rawFrontMatter != null) {
    // Remove the YAML front matter block from content
    const frontMatterRegex = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/
    contentWithoutFrontMatter = rawContent.replace(frontMatterRegex, '')
  }

  return {
    ...(yamlFrontMatter != null && { yamlFrontMatter }),
    ...(rawFrontMatter != null && { rawFrontMatter }),
    markdownAst: ast,
    markdownContents,
    contentWithoutFrontMatter,
  }
}
