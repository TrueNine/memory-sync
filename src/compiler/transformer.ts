// transformer.ts
// AST transformation module for lossless MDX to Markdown conversion

import type { Program } from 'estree'
import type { Paragraph, Parent, Root, RootContent, Text } from 'mdast'
import type { MdxJsxFlowElement } from 'mdast-util-mdx'
import type { ProcessingContext } from './types'
import { isMdxComponent, processComponent } from './component-processor'
import { evaluateExpression } from './expression-eval'
import { convertJsxToMarkdown } from './jsx-converter'
import { evaluateJsxExpression, hasJsxInEstree } from './jsx-expression-eval'

type ChildNode = RootContent | Text

/**
 * Processes an MDX AST, evaluating expressions and expanding components.
 * Import statements (mdxjsEsm nodes) are skipped during transformation.
 */
export async function processAst(
  ast: Root,
  ctx: ProcessingContext,
): Promise<Root> {
  return transformNodes(ast, ctx)
}

/**
 * Transforms AST nodes, replacing MDX-specific nodes with Markdown equivalents.
 */
async function transformNodes(
  ast: Root,
  ctx: ProcessingContext,
): Promise<Root> {
  const newChildren: RootContent[] = []

  for (const child of ast.children) {
    const transformed = await transformNode(child, ctx)
    newChildren.push(...transformed)
  }

  return { type: 'root', children: newChildren }
}

/**
 * Transforms a single AST node.
 */
async function transformNode(
  node: RootContent,
  ctx: ProcessingContext,
): Promise<RootContent[]> {
  if (node.type === 'mdxjsEsm') {
    return []
  }

  if (node.type === 'mdxFlowExpression') {
    const flowExpr = node
    const estree = (flowExpr.data as { estree?: Program } | undefined)?.estree

    // Check if this is a JSX comment {/* ... */} - skip it
    const trimmedValue = flowExpr.value.trim()
    if (trimmedValue.startsWith('/*') && trimmedValue.endsWith('*/')) {
      return []
    }

    // Check if expression contains JSX
    if (hasJsxInEstree(estree)) {
      return evaluateJsxExpression(flowExpr, ctx, async (children, c) => {
        const tempRoot: Root = { type: 'root', children }
        const processed = await processAst(tempRoot, c)
        return processed.children
      })
    }

    // Standard expression evaluation
    const value = evaluateExpression(flowExpr.value, ctx.scope)
    if (value !== '') {
      const paragraph: Paragraph = {
        type: 'paragraph',
        children: [{ type: 'text', value }],
      }
      return [paragraph]
    }
    return []
  }

  if (node.type === 'mdxJsxFlowElement') {
    return transformJsxElement(node, ctx)
  }

  if ('children' in node && Array.isArray(node.children)) {
    const parentNode = node as Parent
    const newChildren = await transformChildren(
      parentNode.children as ChildNode[],
      ctx,
    )
    return [{ ...node, children: newChildren } as RootContent]
  }

  return [node]
}

/**
 * Transforms JSX elements.
 */
async function transformJsxElement(
  element: MdxJsxFlowElement,
  ctx: ProcessingContext,
): Promise<RootContent[]> {
  if (element.name != null && isMdxComponent(element.name, ctx)) {
    return processComponent(element, ctx, processAst)
  }

  const converted = convertJsxToMarkdown(element, ctx)
  if (converted != null) {
    return converted
  }

  return []
}

/**
 * Transforms an array of child nodes.
 */
async function transformChildren(
  children: ChildNode[],
  ctx: ProcessingContext,
): Promise<ChildNode[]> {
  const result: ChildNode[] = []

  for (const child of children) {
    if (child.type === 'mdxTextExpression') {
      const textExpr = child
      // Check if this is a JSX comment {/* ... */} - skip it
      const trimmedValue = textExpr.value.trim()
      if (trimmedValue.startsWith('/*') && trimmedValue.endsWith('*/')) {
        continue
      }
      const value = evaluateExpression(textExpr.value, ctx.scope)
      const textNode: Text = { type: 'text', value }
      result.push(textNode)
      continue
    }

    if (child.type === 'mdxJsxTextElement') {
      const textElement = child
      // Check if it's a registered component first
      if (textElement.name != null && isMdxComponent(textElement.name, ctx)) {
        const componentResult = await processComponent(textElement, ctx, processAst)
        for (const node of componentResult) {
          if (node.type === 'paragraph' && 'children' in node) {
            result.push(...node.children)
          } else {
            result.push(node as ChildNode)
          }
        }
        continue
      }
      // Otherwise try to convert as standard JSX
      const converted = convertJsxToMarkdown(textElement, ctx)
      if (converted != null) {
        for (const node of converted) {
          if (node.type === 'paragraph' && 'children' in node) {
            result.push(...node.children)
          } else {
            result.push(node as ChildNode)
          }
        }
      }
      continue
    }

    if ('children' in child && Array.isArray(child.children)) {
      const parentChild = child as Parent
      const newChildren = await transformChildren(
        parentChild.children as ChildNode[],
        ctx,
      )
      result.push({ ...child, children: newChildren } as ChildNode)
      continue
    }

    result.push(child)
  }

  return result
}
