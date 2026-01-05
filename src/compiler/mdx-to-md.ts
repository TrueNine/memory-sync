// mdx-to-md.ts
// Main entry point for lossless MDX to Markdown conversion

import type { EvaluationScope, MdxToMdOptions, ProcessingContext } from './types'
import remarkStringify from 'remark-stringify'
import { unified } from 'unified'
import { parseMdx } from './parser'
import { processAst } from './transformer'

/**
 * Converts MDX content to Markdown using lossless AST transformation.
 *
 * @param content - MDX source string
 * @param options - Optional configuration
 * @returns Promise resolving to the Markdown string
 *
 * @example
 * const markdown = await mdxToMd("# Hello {name}")
 *
 * @example
 * // With custom scope values
 * const markdown = await mdxToMd("# Hello {name}", {
 *   scope: { name: "World" }
 * })
 *
 * @example
 * // With components
 * const markdown = await mdxToMd(
 *   `import Lead from "./Lead.mdx"\n\n<Lead title="Hello" />`,
 *   { components: { Lead: "# {title}" } }
 * )
 */
export async function mdxToMd(
  content: string,
  options?: MdxToMdOptions,
): Promise<string> {
  const ast = parseMdx(content)

  // Normalize components to Map
  const componentsMap = normalizeComponents(options?.components)

  const ctx: ProcessingContext = {
    scope: { ...(options?.scope ?? {}) } as EvaluationScope,
    components: componentsMap,
    processingStack: [],
  }

  const processedAst = await processAst(ast, ctx)

  const processor = unified().use(remarkStringify, {
    bullet: '-',
    fence: '`',
    fences: true,
    emphasis: '*',
    strong: '*',
  })

  const markdown = processor.stringify(processedAst)
  return markdown.trim()
}

/**
 * Normalizes components option to Map<string, string>
 */
function normalizeComponents(
  components?: Map<string, string> | Record<string, string>,
): Map<string, string> {
  if (components == null) {
    return new Map()
  }

  if (components instanceof Map) {
    return new Map(components)
  }

  return new Map(Object.entries(components))
}
