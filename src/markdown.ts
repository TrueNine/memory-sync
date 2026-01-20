import type {Root, RootContent} from 'mdast'
import remarkFrontmatter from 'remark-frontmatter'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import {unified} from 'unified'
import * as YAML from 'yaml'

export interface ParsedMarkdown<Y = Record<string, unknown>> {
  readonly yamlFrontMatter?: Y
  readonly rawFrontMatter?: string
  readonly markdownAst: Root
  readonly markdownContents: readonly RootContent[]
  readonly contentWithoutFrontMatter: string
}

/**
 * Options for building markdown content with front matter
 */
export interface BuildMarkdownOptions {
  readonly singleQuote?: boolean
  readonly lineWidth?: number
}

export function buildFrontMatter(
  frontMatter: Record<string, unknown>,
  options?: BuildMarkdownOptions
): string {
  const cleanedFrontMatter = Object.fromEntries( // Filter out undefined/null values
    Object.entries(frontMatter).filter(([_, v]) => v != null)
  )

  if (Object.keys(cleanedFrontMatter).length === 0) return '---\n---'

  const yamlStr = YAML.stringify(cleanedFrontMatter, {
    singleQuote: options?.singleQuote ?? false,
    lineWidth: options?.lineWidth ?? 0
  }).trimEnd()

  return `---\n${yamlStr}\n---`
}

export function buildMarkdownWithFrontMatter(
  frontMatter: Record<string, unknown> | undefined | null,
  content: string,
  options?: BuildMarkdownOptions
): string {
  if (frontMatter == null || Object.keys(frontMatter).length === 0) return content

  const fmStr = buildFrontMatter(frontMatter, options)
  return `${fmStr}\n${content}`
}

export function buildRawFrontMatter(
  frontMatter: Record<string, unknown>,
  options?: BuildMarkdownOptions
): string {
  const cleanedFrontMatter = Object.fromEntries(
    Object.entries(frontMatter).filter(([_, v]) => v != null)
  )

  if (Object.keys(cleanedFrontMatter).length === 0) return ''

  return YAML.stringify(cleanedFrontMatter, {
    singleQuote: options?.singleQuote ?? false,
    lineWidth: options?.lineWidth ?? 0
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

  let yamlFrontMatter: Y | undefined,
    rawFrontMatter: string | undefined
  const markdownContents: RootContent[] = []

  for (const node of ast.children) {
    if (node.type === 'yaml') {
      const yamlNode = node
      rawFrontMatter = yamlNode.value
      try {
        yamlFrontMatter = YAML.parse(yamlNode.value) as Y
      }
      catch {
      } // YAML parsing failed, keep raw front matter
    } else markdownContents.push(node)
  }

  let contentWithoutFrontMatter = rawContent // Calculate content without front matter
  if (rawFrontMatter != null) {
    const frontMatterRegex = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/ // Remove the YAML front matter block from content
    contentWithoutFrontMatter = rawContent.replace(frontMatterRegex, '')
  }

  return {
    ...yamlFrontMatter != null && {yamlFrontMatter},
    ...rawFrontMatter != null && {rawFrontMatter},
    markdownAst: ast,
    markdownContents,
    contentWithoutFrontMatter
  }
}

/**
 * Converts .mdx file references to .md in markdown content.
 * Only converts local file references (not external URLs).
 *
 * Handles:
 * - Markdown links: [text.mdx](file.mdx) -> [text.md](file.md)
 * - Markdown images: ![alt](file.mdx) -> ![alt](file.md)
 * - Link text containing .mdx paths are also transformed
 * - Preserves anchors and query params: file.mdx#section -> file.md#section
 *
 * @param content - The markdown content to transform
 * @returns The transformed content with .mdx replaced by .md
 */
export function transformMdxReferencesToMd(content: string): string {
  return content.replaceAll( // Capture both the text and URL parts to transform .mdx to .md // Match markdown links and images: [text](url) or ![alt](url)
    /(!?\[)([^\]]*)(\]\()([^)]+)(\))/g,
    (_match, prefix: string, text: string, middle: string, url: string, suffix: string) => {
      const transformedText = text // Transform link text: convert .mdx to .md for path-like text
        .replaceAll(/\.mdx$/g, '.md')
        .replaceAll(/\.mdx(?=#|\?|$)/g, '.md')

      if (/^(?:https?:)?\/\//.test(url)) return `${prefix}${transformedText}${middle}${url}${suffix}` // Skip external URLs (http://, https://, //, etc.)

      const transformedUrl = url // Simple replacement: .mdx at end or before # or ? // Convert .mdx to .md for local file references
        .replace(/\.mdx$/, '.md')
        .replace(/\.mdx#/, '.md#')
        .replace(/\.mdx\?/, '.md?')

      return `${prefix}${transformedText}${middle}${transformedUrl}${suffix}`
    }
  )
}
