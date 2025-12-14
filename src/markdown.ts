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
    } else {
      markdownContents.push(node)
    }
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
