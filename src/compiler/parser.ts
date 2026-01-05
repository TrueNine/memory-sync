// parser.ts
// MDX parsing module using unified + remark-parse + remark-mdx

import type { Root } from 'mdast'
import remarkMdx from 'remark-mdx'
import remarkParse from 'remark-parse'
import { unified } from 'unified'

/**
 * Parses an MDX string into an MDAST with MDX extensions.
 *
 * The parser preserves:
 * - Standard Markdown syntax as native MDAST nodes (heading, code, list, link, etc.)
 * - JSX elements as `mdxJsxFlowElement` or `mdxJsxTextElement` nodes
 * - Import/export statements as `mdxjsEsm` nodes
 * - Expression interpolations as `mdxFlowExpression` or `mdxTextExpression` nodes
 *
 * @param source - MDX source string
 * @returns The parsed AST root node
 */
export function parseMdx(source: string): Root {
  const processor = unified().use(remarkParse).use(remarkMdx)
  return processor.parse(source)
}
