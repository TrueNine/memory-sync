// component-processor.ts
// MDX component expansion module for recursive component processing

import type { Root, RootContent } from 'mdast'
import type {
  MdxJsxFlowElement,
  MdxJsxTextElement,
} from 'mdast-util-mdx'
import type { EvaluationScope, ProcessingContext } from './types'
import { evaluateExpression } from './expression-eval'
import { getComponentNameFromSource } from './import-resolver'
import { parseMdx } from './parser'

/**
 * Checks if a JSX element is an imported MDX component.
 */
export function isMdxComponent(
  name: string | null,
  ctx: ProcessingContext,
): boolean {
  if (name === null) {
    return false
  }
  return ctx.components.has(name)
}

/**
 * Extracts props from a JSX element's attributes.
 */
function extractProps(
  element: MdxJsxFlowElement | MdxJsxTextElement,
  ctx: ProcessingContext,
): EvaluationScope {
  const props: EvaluationScope = {}

  for (const attr of element.attributes) {
    if (attr.type === 'mdxJsxExpressionAttribute') {
      continue
    }

    const jsxAttr = attr
    const name = jsxAttr.name

    if (jsxAttr.value == null) {
      props[name] = true
    } else if (typeof jsxAttr.value === 'string') {
      props[name] = jsxAttr.value
    } else if (
      typeof jsxAttr.value === 'object'
      && jsxAttr.value.type === 'mdxJsxAttributeValueExpression'
    ) {
      try {
        const evaluated = evaluateExpression(jsxAttr.value.value, ctx.scope)
        try {
          props[name] = JSON.parse(evaluated) as unknown
        } catch {
          props[name] = evaluated
        }
      } catch {
        props[name] = jsxAttr.value.value
      }
    }
  }

  return props
}

/**
 * Processes an MDX component, returning its expanded AST nodes.
 */
export async function processComponent(
  element: MdxJsxFlowElement | MdxJsxTextElement,
  ctx: ProcessingContext,
  processAstFn: (ast: Root, ctx: ProcessingContext) => Promise<Root>,
): Promise<RootContent[]> {
  const componentName = element.name

  if (componentName == null || componentName === '') {
    return []
  }

  const componentContent = ctx.components.get(componentName)
  if (componentContent == null) {
    throw new Error(
      `Unknown component: "${componentName}"\n`
      + `Available components: ${Array.from(ctx.components.keys()).join(', ') || 'none'}`,
    )
  }

  if (ctx.processingStack.includes(componentName)) {
    const cycle = [...ctx.processingStack, componentName].join(' → ')
    throw new Error(`Circular dependency detected: ${cycle}`)
  }

  let componentAst: Root
  try {
    componentAst = parseMdx(componentContent)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(
      `Failed to parse component "${componentName}": ${message}`,
      { cause: err },
    )
  }

  const props = extractProps(element, ctx)

  const componentCtx: ProcessingContext = {
    scope: { ...ctx.scope, ...props },
    components: new Map(ctx.components),
    processingStack: [...ctx.processingStack, componentName],
  }

  let processedAst: Root
  try {
    processedAst = await processAstFn(componentAst, componentCtx)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const componentStack = ctx.processingStack.join(' → ')
    throw new Error(
      `Failed to process component "${componentName}"${
        componentStack !== '' ? ` (called from: ${componentStack})` : ''
      }:\n${message}`,
      { cause: err },
    )
  }

  return processedAst.children
}

export { getComponentNameFromSource }
