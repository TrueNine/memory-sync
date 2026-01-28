import type {RootContent, Text} from 'mdast' // Md component handler - wrapper for conditional Markdown content // src/components/Md.ts
import type {MdxJsxFlowElement, MdxJsxTextElement} from 'mdast-util-mdx'
import type {ProcessingContext} from 'memory-sync-cli/src/compiler/types'
import {evaluateExpression} from 'memory-sync-cli/src/compiler/expression-eval'

/**
 * Evaluates the `when` attribute condition.
 *
 * @param element - The JSX element
 * @param ctx - The processing context
 * @returns true if condition passes or no condition, false otherwise
 */
function evaluateWhenCondition(
  element: MdxJsxFlowElement | MdxJsxTextElement,
  ctx: ProcessingContext
): boolean {
  const whenAttr = element.attributes.find(
    attr => attr.type === 'mdxJsxAttribute' && attr.name === 'when'
  )

  if (whenAttr?.type !== 'mdxJsxAttribute') return true // No condition = always true

  if (typeof whenAttr.value === 'string') return whenAttr.value === 'true'

  if (
    whenAttr.value != null
    && typeof whenAttr.value === 'object'
    && whenAttr.value.type === 'mdxJsxAttributeValueExpression'
  ) {
    try {
      const evaluated = evaluateExpression(whenAttr.value.value, ctx.scope)
      return evaluated === 'true' || evaluated === '1'
    }
    catch {
      return false
    }
  }

  return false
}

export async function MdHandler(
  element: MdxJsxFlowElement | MdxJsxTextElement,
  ctx: ProcessingContext,
  processChildren: (children: RootContent[], ctx: ProcessingContext) => Promise<RootContent[]>
): Promise<RootContent[]> {
  if (!evaluateWhenCondition(element, ctx)) return []
  if (element.children.length === 0) return []
  return processChildren(element.children as RootContent[], ctx)
}

export async function MdLineHandler(
  element: MdxJsxFlowElement | MdxJsxTextElement,
  ctx: ProcessingContext
): Promise<RootContent[]> {
  if (!evaluateWhenCondition(element, ctx)) return []

  if (element.children.length === 0) return []

  const textContent = extractTextContent(element.children, ctx) // Extract text content from children

  if (textContent === '') return []

  const textNode: Text = {type: 'text', value: textContent}
  return [textNode]
}

/**
 * Extracts text content from child nodes.
 */
function extractTextContent(
  children: (MdxJsxFlowElement | MdxJsxTextElement)['children'],
  ctx: ProcessingContext
): string {
  let result = ''

  for (const child of children) {
    if (child.type === 'text') result += child.value
    else if (child.type === 'mdxTextExpression') {
      try {
        result += evaluateExpression(child.value, ctx.scope)
      }
      catch {
      } // Skip failed expressions
    } else if ('children' in child && Array.isArray(child.children)) result += extractTextContent(child.children as typeof children, ctx)
  }

  return result
}
