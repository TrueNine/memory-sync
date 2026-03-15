import type {Program} from 'estree' // AST transformation module for lossless MDX to Markdown conversion // transformer.ts
import type {Paragraph, Parent, Root, RootContent, Text} from 'mdast'
import type {MdxJsxFlowElement} from 'mdast-util-mdx'
import type {ExpressionDiagnosticContext, ProcessingContext} from './types'
import {isMdxComponent, processComponent} from './component-processor'
import {evaluateExpression} from './expression-eval'
import {convertJsxToMarkdown} from './jsx-converter'
import {evaluateJsxExpression, hasJsxInEstree} from './jsx-expression-eval'

type ChildNode = RootContent | Text

function createExpressionOptions(
  ctx: ProcessingContext,
  node: {position?: ExpressionDiagnosticContext['position']},
  nodeType: string
) {
  return {
    ...ctx.filePath != null && {filePath: ctx.filePath},
    ...ctx.sourceText != null && {sourceText: ctx.sourceText},
    ...node.position != null && {position: node.position},
    nodeType
  }
}

/**
 * Simplifies link text that looks like a file path.
 * If the link text matches pattern like "a/b/c.ext", returns only "c.ext".
 *
 * @param text - The link text to simplify
 * @returns The simplified text (basename only) or original text
 */
function simplifyLinkText(text: string): string {
  if (!(text.includes('/') && /\.\w+$/.test(text))) return text // Check if text looks like a file path (contains / and ends with .ext)

  const lastSlashIndex = text.lastIndexOf('/')
  return text.slice(lastSlashIndex + 1)
}

/**
 * Processes an MDX AST, evaluating expressions and expanding components.
 * Import statements (mdxjsEsm nodes) are skipped during transformation.
 */
export async function processAst(
  ast: Root,
  ctx: ProcessingContext
): Promise<Root> {
  return transformNodes(ast, ctx)
}

/**
 * Transforms AST nodes, replacing MDX-specific nodes with Markdown equivalents.
 */
async function transformNodes(
  ast: Root,
  ctx: ProcessingContext
): Promise<Root> {
  const newChildren: RootContent[] = []

  for (const child of ast.children) {
    const transformed = await transformNode(child, ctx)
    newChildren.push(...transformed)
  }

  return {type: 'root', children: newChildren}
}

/**
 * Transforms a single AST node.
 */
async function transformNode(
  node: RootContent,
  ctx: ProcessingContext
): Promise<RootContent[]> {
  if (node.type === 'mdxjsEsm') return []

  if (node.type === 'mdxFlowExpression') {
    const flowExpr = node
    const estree = (flowExpr.data as {estree?: Program} | undefined)?.estree

    const trimmedValue = flowExpr.value.trim()
    if (trimmedValue.startsWith('/*') && trimmedValue.endsWith('*/')) return []

    if (hasJsxInEstree(estree)) { // Check if expression contains JSX
      return evaluateJsxExpression(flowExpr, ctx, async (children, c) => {
        const tempRoot: Root = {type: 'root', children}
        const processed = await processAst(tempRoot, c)
        return processed.children
      })
    }

    const value = evaluateExpression(flowExpr.value, ctx.scope, createExpressionOptions(ctx, flowExpr, 'mdxFlowExpression')) // Standard expression evaluation
    if (value !== '') {
      const paragraph: Paragraph = {
        type: 'paragraph',
        children: [{type: 'text', value}]
      }
      return [paragraph]
    }
    return []
  }

  if (node.type === 'mdxJsxFlowElement') return transformJsxElement(node, ctx)

  if (node.type === 'link') { // Simplify link text that looks like file paths
    const linkNode = node
    const newChildren = await transformChildren(linkNode.children as ChildNode[], ctx)
    const simplifiedChildren = newChildren.map(child => { // Simplify text children that look like file paths
      if (child.type === 'text') return {...child, value: simplifyLinkText(child.value)}
      return child
    })
    return [{...linkNode, children: simplifiedChildren} as RootContent]
  }

  if (!('children' in node && Array.isArray(node.children))) return [node]

  const parentNode = node as Parent
  const newChildren = await transformChildren(parentNode.children as ChildNode[], ctx)
  return [{...node, children: newChildren} as RootContent]
}

/**
 * Transforms JSX elements.
 */
async function transformJsxElement(
  element: MdxJsxFlowElement,
  ctx: ProcessingContext
): Promise<RootContent[]> {
  if (element.name != null && isMdxComponent(element.name, ctx)) return processComponent(element, ctx, processAst)

  const converted = convertJsxToMarkdown(element, ctx)
  if (converted != null) return converted

  return []
}

/**
 * Transforms an array of child nodes.
 */
async function transformChildren(
  children: ChildNode[],
  ctx: ProcessingContext
): Promise<ChildNode[]> {
  const result: ChildNode[] = []

  for (const child of children) {
    if (child.type === 'mdxFlowExpression') {
      const flowExpr = child
      const estree = (flowExpr.data as {estree?: Program} | undefined)?.estree
      const trimmedValue = flowExpr.value.trim()
      if (trimmedValue.startsWith('/*') && trimmedValue.endsWith('*/')) continue
      if (hasJsxInEstree(estree)) {
        const nodes = await evaluateJsxExpression(flowExpr, ctx, async (children, c) => {
          const tempRoot: Root = {type: 'root', children}
          const processed = await processAst(tempRoot, c)
          return processed.children
        })
        for (const node of nodes) result.push(node as ChildNode)
        continue
      }
      const value = evaluateExpression(flowExpr.value, ctx.scope, createExpressionOptions(ctx, flowExpr, 'mdxFlowExpression'))
      if (value !== '') {
        result.push({
          type: 'paragraph',
          children: [{type: 'text', value}]
        } as ChildNode)
      }
      continue
    }

    if (child.type === 'mdxTextExpression') {
      const textExpr = child
      const trimmedValue = textExpr.value.trim()
      if (trimmedValue.startsWith('/*') && trimmedValue.endsWith('*/')) continue
      const value = evaluateExpression(textExpr.value, ctx.scope, createExpressionOptions(ctx, textExpr, 'mdxTextExpression'))
      const textNode: Text = {type: 'text', value}
      result.push(textNode)
      continue
    }

    if (child.type === 'mdxJsxTextElement') {
      const textElement = child
      if (textElement.name != null && isMdxComponent(textElement.name, ctx)) { // Check if it's a registered component first
        const componentResult = await processComponent(textElement, ctx, processAst)
        for (const node of componentResult) {
          if (node.type === 'paragraph' && 'children' in node) result.push(...node.children)
          else result.push(node as ChildNode)
        }
        continue
      }
      const converted = convertJsxToMarkdown(textElement, ctx) // Otherwise try to convert as standard JSX
      if (converted != null) {
        for (const node of converted) {
          if (node.type === 'paragraph' && 'children' in node) result.push(...node.children)
          else result.push(node as ChildNode)
        }
      }
      continue
    }

    if ('children' in child && Array.isArray(child.children)) {
      const parentChild = child as Parent
      const newChildren = await transformChildren(parentChild.children as ChildNode[], ctx)
      if (child.type === 'link') { // Simplify link text that looks like file paths
        const simplifiedChildren = newChildren.map(c => {
          if (c.type === 'text') return {...c, value: simplifyLinkText(c.value)}
          return c
        })
        result.push({...child, children: simplifiedChildren} as ChildNode)
        continue
      }
      result.push({...child, children: newChildren} as ChildNode)
      continue
    }

    result.push(child)
  }

  return result
}
