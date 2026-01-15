import type {Root, RootContent} from 'mdast' // MDX component expansion module for built-in component processing // component-processor.ts
import type {
  MdxJsxFlowElement,
  MdxJsxTextElement,
} from 'mdast-util-mdx'
import type {ProcessingContext} from './types'
import {hasComponent} from './component-registry'

/**
 * Checks if a JSX element is a registered built-in component.
 * Uses the component registry to determine if a handler exists.
 */
export function isMdxComponent(
  name: string | null,
  ctx: ProcessingContext,
): boolean {
  if (name === null) return false
  return ctx.components.has(name) || hasComponent(name) // Check both the context's components map and the global registry
}

/**
 * Processes children nodes through the AST processor.
 * This function is passed to component handlers to allow recursive processing.
 */
async function createProcessChildren(
  processAstFn: (ast: Root, ctx: ProcessingContext) => Promise<Root>,
): Promise<(children: RootContent[], ctx: ProcessingContext) => Promise<RootContent[]>> {
  return async (children: RootContent[], ctx: ProcessingContext): Promise<RootContent[]> => {
    const tempRoot: Root = {type: 'root', children} // Wrap children in a root node for processing
    const processedRoot = await processAstFn(tempRoot, ctx)
    return processedRoot.children
  }
}

/**
 * Processes a built-in component by calling its handler.
 * Handlers receive the element, context, and a function to process children.
 */
export async function processComponent(
  element: MdxJsxFlowElement | MdxJsxTextElement,
  ctx: ProcessingContext,
  processAstFn: (ast: Root, ctx: ProcessingContext) => Promise<Root>,
): Promise<RootContent[]> {
  const componentName = element.name

  if (componentName == null || componentName === '') return []

  const handler = ctx.components.get(componentName) // Get the component handler from context
  if (handler == null) {
    return [] // Component not found - skip gracefully per Requirements 2.3, 2.4
  }

  if (ctx.processingStack.includes(componentName)) { // Check for circular dependency
    const cycle = [...ctx.processingStack, componentName].join(' → ')
    throw new Error(`Circular dependency detected: ${cycle}`)
  }

  const componentCtx: ProcessingContext = { // Create a new context with updated processing stack
    scope: ctx.scope,
    components: ctx.components,
    processingStack: [...ctx.processingStack, componentName],
    ...ctx.basePath != null ? {basePath: ctx.basePath} : {},
  }

  const processChildren = await createProcessChildren(processAstFn) // Create the processChildren function for the handler

  try { // Call the component handler with the new signature
    return await handler(element, componentCtx, processChildren)
  }
  catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const componentStack = ctx.processingStack.join(' → ')
    throw new Error(
      `Failed to process component "${componentName}"${componentStack !== '' ? ` (called from: ${componentStack})` : ''
      }:\n${message}`,
      {cause: err},
    )
  }
}
