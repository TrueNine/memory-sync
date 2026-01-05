// mdx-to-md.ts
// Main entry point for lossless MDX to Markdown conversion

import type { EvaluationScope, MdxToMdOptions, ProcessingContext } from './types'
import remarkStringify from 'remark-stringify'
import { unified } from 'unified'
import { registerBuiltInComponents } from '../components'
import { getGlobalScope } from '../globals'
import { getComponents } from './component-registry'
import { parseMdx } from './parser'
import { processAst } from './transformer'

// Register built-in components on module load
registerBuiltInComponents()

/**
 * Converts MDX content to Markdown using lossless AST transformation.
 *
 * The compiler automatically:
 * - Loads global definitions from src/globals/
 * - Loads built-in components from src/components/
 * - Merges user scope with globals (user values take precedence)
 *
 * @param content - MDX source string
 * @param options - Optional configuration
 * @returns Promise resolving to the Markdown string
 *
 * @example
 * const markdown = await mdxToMd("# Hello {name}")
 *
 * @example
 * // With custom scope values (override globals)
 * const markdown = await mdxToMd("# Hello {name}", {
 *   scope: { name: "World" }
 * })
 *
 * @example
 * // Using built-in Md component
 * const markdown = await mdxToMd(`
 *   <Md if={showContent}>
 *     # Conditional content
 *   </Md>
 * `, { scope: { showContent: true } })
 */
export async function mdxToMd(
  content: string,
  options?: MdxToMdOptions,
): Promise<string> {
  const ast = parseMdx(content)

  // Load globals and merge with user scope (user takes precedence)
  const globals = getGlobalScope()
  const mergedScope: EvaluationScope = {
    ...globals,
    ...(options?.scope ?? {}),
  }

  // Load built-in components from registry
  const components = getComponents()

  const ctx: ProcessingContext = {
    scope: mergedScope,
    components,
    processingStack: [],
    ...(options?.basePath != null && { basePath: options.basePath }),
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
