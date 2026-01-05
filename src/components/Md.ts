// src/components/Md.ts
// Md component handler - wrapper for conditional Markdown content

import type { RootContent, Text } from 'mdast'
import type { MdxJsxFlowElement, MdxJsxTextElement } from 'mdast-util-mdx'
import type { ProcessingContext } from '../compiler/types'
import { evaluateExpression } from '../compiler/expression-eval'

/**
 * Evaluates the `when` attribute condition.
 *
 * @param element - The JSX element
 * @param ctx - The processing context
 * @returns true if condition passes or no condition, false otherwise
 */
function evaluateWhenCondition(
  element: MdxJsxFlowElement | MdxJsxTextElement,
  ctx: ProcessingContext,
): boolean {
  const whenAttr = element.attributes.find(
    (attr) => attr.type === 'mdxJsxAttribute' && attr.name === 'when',
  )

  // No condition = always true
  if (whenAttr == null || whenAttr.type !== 'mdxJsxAttribute') {
    return true
  }

  if (typeof whenAttr.value === 'string') {
    return whenAttr.value === 'true'
  }

  if (
    whenAttr.value != null
    && typeof whenAttr.value === 'object'
    && whenAttr.value.type === 'mdxJsxAttributeValueExpression'
  ) {
    try {
      const evaluated = evaluateExpression(whenAttr.value.value, ctx.scope)
      return evaluated === 'true' || evaluated === '1'
    } catch {
      return false
    }
  }

  return false
}

/**
 * Md component handler - wrapper for conditional Markdown content.
 *
 * The Md component allows wrapping Markdown content for conditional compilation.
 * It passes through children content directly, optionally filtered by a `when` condition.
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
 * <Md when={someCondition}>
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
  if (!evaluateWhenCondition(element, ctx)) {
    return []
  }

  if (element.children.length === 0) {
    return []
  }

  return processChildren(element.children as RootContent[], ctx)
}

/**
 * Md.Line component handler - inline conditional text.
 *
 * The Md.Line component allows conditional inline text insertion.
 * Unlike Md which is block-level, Md.Line outputs inline text nodes.
 *
 * @example
 * Basic inline conditional:
 * ```mdx
 * 使用 <Md.Line when={os.kind === 'win'}>PowerShell</Md.Line><Md.Line when={os.kind !== 'win'}>终端</Md.Line> 执行命令
 * ```
 *
 * @example
 * Multiple conditions:
 * ```mdx
 * 系统: <Md.Line when={os.kind === 'win'}>Windows</Md.Line><Md.Line when={os.kind === 'mac'}>macOS</Md.Line><Md.Line when={os.kind === 'linux'}>Linux</Md.Line>
 * ```
 *
 * @param element - The JSX element representing the Md.Line component
 * @param ctx - The processing context containing scope and components
 * @returns Text nodes from children, or empty array if condition is false
 */
export async function MdLineHandler(
  element: MdxJsxFlowElement | MdxJsxTextElement,
  ctx: ProcessingContext,
): Promise<RootContent[]> {
  if (!evaluateWhenCondition(element, ctx)) {
    return []
  }

  if (element.children.length === 0) {
    return []
  }

  // Extract text content from children
  const textContent = extractTextContent(element.children, ctx)

  if (textContent === '') {
    return []
  }

  const textNode: Text = { type: 'text', value: textContent }
  return [textNode]
}

/**
 * Extracts text content from child nodes.
 */
function extractTextContent(
  children: (MdxJsxFlowElement | MdxJsxTextElement)['children'],
  ctx: ProcessingContext,
): string {
  let result = ''

  for (const child of children) {
    if (child.type === 'text') {
      result += child.value
    } else if (child.type === 'mdxTextExpression') {
      try {
        result += evaluateExpression(child.value, ctx.scope)
      } catch {
        // Skip failed expressions
      }
    } else if ('children' in child && Array.isArray(child.children)) {
      result += extractTextContent(child.children as typeof children, ctx)
    }
  }

  return result
}
