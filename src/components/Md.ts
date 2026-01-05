// src/components/Md.ts
// Md component handler - wrapper for conditional Markdown content

import type { RootContent } from 'mdast'
import type { MdxJsxFlowElement, MdxJsxTextElement } from 'mdast-util-mdx'
import type { ProcessingContext } from '../compiler/types'
import { evaluateExpression } from '../compiler/expression-eval'

/**
 * Md component handler - wrapper for conditional Markdown content.
 *
 * The Md component allows wrapping Markdown content for conditional compilation.
 * It passes through children content directly, optionally filtered by an `if` condition.
 *
 * @example
 * Basic usage - content passes through directly:
 * ```mdx
 * <Md>
 *   # Some markdown content
 *   This will be output directly
 * </Md>
 * ```
 *
 * @example
 * With condition - content only included if condition is true:
 * ```mdx
 * <Md if={someCondition}>
 *   # Only included if condition is true
 * </Md>
 * ```
 *
 * @param element - The JSX element representing the Md component
 * @param ctx - The processing context containing scope and components
 * @param processChildren - Function to recursively process child nodes
 * @returns Processed child nodes, or empty array if condition is false or no children
 */
export async function MdHandler(
  element: MdxJsxFlowElement | MdxJsxTextElement,
  ctx: ProcessingContext,
  processChildren: (children: RootContent[], ctx: ProcessingContext) => Promise<RootContent[]>,
): Promise<RootContent[]> {
  // Check for conditional `if` attribute
  const ifAttr = element.attributes.find(
    (attr) => attr.type === 'mdxJsxAttribute' && attr.name === 'if',
  )

  if (ifAttr != null && ifAttr.type === 'mdxJsxAttribute') {
    // Evaluate the condition
    let condition = false

    if (typeof ifAttr.value === 'string') {
      // String value: "true" or "false"
      condition = ifAttr.value === 'true'
    } else if (
      ifAttr.value != null
      && typeof ifAttr.value === 'object'
      && ifAttr.value.type === 'mdxJsxAttributeValueExpression'
    ) {
      // Expression value: {someCondition}
      try {
        const evaluated = evaluateExpression(ifAttr.value.value, ctx.scope)
        // Handle various truthy representations (evaluated is always a string)
        condition = evaluated === 'true' || evaluated === '1'
      } catch {
        // If expression evaluation fails, treat as false
        condition = false
      }
    }

    if (!condition) {
      // Skip content if condition is false
      return []
    }
  }

  // No children = no output
  if (element.children.length === 0) {
    return []
  }

  // Process and return children directly
  return processChildren(element.children as RootContent[], ctx)
}
