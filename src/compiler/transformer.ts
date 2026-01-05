// transformer.ts
// AST transformation module for lossless MDX to Markdown conversion

import type { Paragraph, Parent, Root, RootContent, Text } from 'mdast'
import type {
  MdxjsEsm,
  MdxJsxFlowElement,
} from 'mdast-util-mdx'
import type { ProcessingContext } from './types'
import { isMdxComponent, processComponent } from './component-processor'
import { evaluateExpression } from './expression-eval'
import {
  extractImports,
  getComponentNameFromSource,
  resolveImport,
} from './import-resolver'
import { convertJsxToMarkdown } from './jsx-converter'

type ChildNode = RootContent | Text

/**
 * Processes an MDX AST, resolving imports, evaluating expressions,
 * and expanding components.
 */
export async function processAst(
  ast: Root,
  ctx: ProcessingContext,
): Promise<Root> {
  resolveAllImports(ast, ctx)
  return transformNodes(ast, ctx)
}

/**
 * Extracts all imports from the AST and resolves them into the scope.
 */
function resolveAllImports(ast: Root, ctx: ProcessingContext): void {
  const esmNodes: MdxjsEsm[] = []

  for (const node of ast.children) {
    if (node.type === 'mdxjsEsm') {
      esmNodes.push(node)
    }
  }

  for (const node of esmNodes) {
    const imports = extractImports(node)

    for (const importInfo of imports) {
      const resolved = resolveImport(importInfo, ctx)
      Object.assign(ctx.scope, resolved)

      // Register MDX component if available in ctx.components
      if (importInfo.isMdxComponent && importInfo.defaultImport != null) {
        const componentKey = getComponentNameFromSource(importInfo.source)
        const content = ctx.components.get(componentKey)
        if (content != null) {
          ctx.components.set(importInfo.defaultImport, content)
        }
      }
    }
  }
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
      const value = evaluateExpression(textExpr.value, ctx.scope)
      const textNode: Text = { type: 'text', value }
      result.push(textNode)
      continue
    }

    if (child.type === 'mdxJsxTextElement') {
      const textElement = child
      const converted = convertJsxToMarkdown(textElement, ctx)
      if (converted != null) {
        for (const node of converted) {
          if (node.type === 'paragraph' && 'children' in node) {
            const para = node
            result.push(...para.children)
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
