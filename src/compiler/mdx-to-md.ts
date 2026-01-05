// mdx-to-md.ts
// Main entry point for lossless MDX to Markdown conversion

import type { EvaluationScope, MdxjsEsm, MdxToMdOptions, MdxToMdResult, ProcessingContext } from './types'
import remarkStringify from 'remark-stringify'
import { unified } from 'unified'
import { registerBuiltInComponents } from '../components'
import { getComponents } from './component-registry'
import { parseExports } from './export-parser'
import { parseMdx } from './parser'
import { processAst } from './transformer'

// Register built-in components on module load
registerBuiltInComponents()

/**
 * Merges global scope with custom scope.
 * Custom scope values take precedence over global scope values.
 * Objects are deeply merged, primitives are overwritten.
 *
 * @param globalScope - Global scope containing os, env, profile, tool
 * @param customScope - Custom scope values to merge
 * @returns Merged evaluation scope
 */
function mergeScopes(
  globalScope: MdxToMdOptions['globalScope'],
  customScope: EvaluationScope | undefined,
): EvaluationScope {
  const result: EvaluationScope = {}

  // 1. Add global scope first (lower priority)
  if (globalScope != null) {
    result['os'] = { ...globalScope.os }
    result['env'] = { ...globalScope.env }
    result['profile'] = { ...globalScope.profile }
    result['tool'] = { ...globalScope.tool }
  }

  // 2. Merge custom scope (higher priority)
  if (customScope != null) {
    for (const [key, value] of Object.entries(customScope)) {
      if (
        typeof value === 'object'
        && value !== null
        && !Array.isArray(value)
        && typeof result[key] === 'object'
        && result[key] !== null
        && !Array.isArray(result[key])
      ) {
        // Deep merge objects
        result[key] = {
          ...(result[key] as Record<string, unknown>),
          ...(value as Record<string, unknown>),
        }
      } else {
        // Overwrite primitives and arrays
        result[key] = value
      }
    }
  }

  return result
}

/**
 * Converts MDX content to Markdown using lossless AST transformation.
 *
 * The compiler automatically:
 * - Loads built-in components from src/components/
 * - Merges global scope with user scope (user values take precedence)
 * - Optionally extracts metadata from export statements
 *
 * @param content - MDX source string
 * @param options - Optional configuration
 * @returns Promise resolving to the Markdown string or MdxToMdResult
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
 * // With global scope
 * const markdown = await mdxToMd("# Hello {profile.name}", {
 *   globalScope: {
 *     profile: { name: "John" },
 *     tool: { websearch: "web_search" },
 *     env: {},
 *     os: { platform: "linux" }
 *   }
 * })
 *
 * @example
 * // Extract metadata from exports
 * const result = await mdxToMd(`
 *   export const title = "My Doc"
 *   # Content
 * `, { extractMetadata: true })
 * // result.content = "# Content"
 * // result.metadata.fields = { title: "My Doc" }
 */
export async function mdxToMd(
  content: string,
  options?: MdxToMdOptions & { extractMetadata?: false },
): Promise<string>

export async function mdxToMd(
  content: string,
  options: MdxToMdOptions & { extractMetadata: true },
): Promise<MdxToMdResult>

export async function mdxToMd(
  content: string,
  options?: MdxToMdOptions,
): Promise<string | MdxToMdResult> {
  const ast = parseMdx(content)

  // Merge global scope with custom scope
  const mergedScope = mergeScopes(options?.globalScope, options?.scope)

  // Load built-in components from registry
  const components = getComponents()

  // Extract export metadata if requested
  let metadata: MdxToMdResult['metadata'] | undefined
  if (options?.extractMetadata === true) {
    const esmNodes = ast.children.filter((n): n is MdxjsEsm => n.type === 'mdxjsEsm')
    metadata = parseExports(esmNodes)

    // Remove export nodes from AST
    ast.children = ast.children.filter((n) => n.type !== 'mdxjsEsm')
  }

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

  const markdown = processor.stringify(processedAst).trim()

  // Return result with metadata if extractMetadata is true
  if (options?.extractMetadata === true && metadata != null) {
    return { content: markdown, metadata }
  }

  return markdown
}
