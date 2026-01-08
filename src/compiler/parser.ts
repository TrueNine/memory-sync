// parser.ts
// MDX parsing module using unified + remark-parse + remark-mdx

import type {Root} from 'mdast'
import remarkFrontmatter from 'remark-frontmatter'
import remarkGfm from 'remark-gfm'
import remarkMdx from 'remark-mdx'
import remarkParse from 'remark-parse'
import {unified} from 'unified'

/**
 * Parses an MDX string into an MDAST with MDX extensions.
 *
 * The parser preserves:
 * - Standard Markdown syntax as native MDAST nodes (heading, code, list, link, etc.)
 * - GFM extensions (tables, task lists, strikethrough, autolinks)
 * - YAML front matter as `yaml` nodes
 * - JSX elements as `mdxJsxFlowElement` or `mdxJsxTextElement` nodes
 * - Import/export statements as `mdxjsEsm` nodes
 * - Expression interpolations as `mdxFlowExpression` or `mdxTextExpression` nodes
 *
 * @param source - MDX source string
 * @returns The parsed AST root node
 */
export function parseMdx(source: string): Root {
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkFrontmatter, ['yaml'])
    .use(remarkMdx)
  return processor.parse(source)
}
