import type {Program} from 'estree' // AST transformation module for lossless MDX to Markdown conversion // transformer.ts
import type {Paragraph, Parent, Root, RootContent, Text} from 'mdast'
import type {MdxJsxFlowElement, MdxJsxTextElement} from 'mdast-util-mdx'
import type {EvaluateExpressionOptions} from './expression-eval'
import type {ExpressionDiagnosticContext, ProcessingContext} from './types'
import remarkGfm from 'remark-gfm'
import remarkStringify from 'remark-stringify'
import {unified} from 'unified'
import {isMdxComponent, processComponent} from './component-processor'
import {evaluateExpression} from './expression-eval'
import {convertJsxToMarkdown} from './jsx-converter'
import {evaluateJsxExpression, hasJsxInEstree} from './jsx-expression-eval'

type ChildNode = RootContent | Text
type SourceRenderableNode = ChildNode
interface PositionedNode {
  position?: ExpressionDiagnosticContext['position']
}

interface SourceReplacement {
  start: number
  end: number
  value: string
}

const FILE_PATH_SUFFIX_PATTERN = /\.\w+$/u
const INTRINSIC_JSX_NAME_PATTERN = /^[a-z]/u
const SPREAD_ATTRIBUTE_PREFIX_PATTERN = /^\.\.\./u
const TRAILING_NEWLINES_PATTERN = /\n+$/u
const INLINE_RENDERABLE_TYPES = new Set([
  'break',
  'delete',
  'emphasis',
  'html',
  'image',
  'inlineCode',
  'link',
  'strong',
  'text'
])
const MARKDOWN_STRINGIFIER = unified()
  .use(remarkGfm)
  .use(remarkStringify, {
    bullet: '-',
    fence: '`',
    fences: true,
    emphasis: '*',
    strong: '*',
    rule: '-',
    handlers: {
      text(node: {value: string}) {
        return node.value
      }
    }
  })

function createExpressionOptions(
  ctx: ProcessingContext,
  node: {position?: ExpressionDiagnosticContext['position']},
  nodeType: string
): EvaluateExpressionOptions {
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
  if (!(text.includes('/') && FILE_PATH_SUFFIX_PATTERN.test(text))) return text // Check if text looks like a file path (contains / and ends with .ext)

  const lastSlashIndex = text.lastIndexOf('/')
  return text.slice(lastSlashIndex + 1)
}

function isIntrinsicJsxName(name: string | null | undefined): name is string {
  if (name == null || name === '') return false
  return INTRINSIC_JSX_NAME_PATTERN.test(name) || name.includes('-')
}

function isInlineRenderableNode(node: ChildNode): boolean {
  return INLINE_RENDERABLE_TYPES.has(node.type)
}

function getNodeSourceSlice(
  node: PositionedNode,
  ctx: ProcessingContext
): string | undefined {
  const startOffset = node.position?.start.offset
  const endOffset = node.position?.end?.offset

  if (ctx.sourceText == null || startOffset == null || endOffset == null || startOffset >= endOffset) return void 0

  return ctx.sourceText.slice(startOffset, endOffset)
}

function applySourceReplacements(
  sourceSlice: string,
  startOffset: number,
  replacements: SourceReplacement[]
): string {
  let rendered = sourceSlice

  for (const replacement of [...replacements].sort((left, right) => right.start - left.start)) {
    const relativeStart = replacement.start - startOffset
    const relativeEnd = replacement.end - startOffset

    if (relativeStart < 0 || relativeEnd < relativeStart || relativeEnd > rendered.length) continue

    rendered = rendered.slice(0, relativeStart) + replacement.value + rendered.slice(relativeEnd)
  }

  return rendered
}

function escapeHtmlAttributeValue(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
}

function evaluateExpressionValue(
  expression: string,
  ctx: ProcessingContext,
  node: PositionedNode,
  nodeType: string
): unknown {
  const trimmed = expression.trim()
  if (trimmed === '') return ''

  const scopeKeys = Object.keys(ctx.scope)
  const scopeValues = scopeKeys.map(key => ctx.scope[key])

  try {
    // eslint-disable-next-line ts/no-implied-eval, no-new-func
    const fn = new Function(...scopeKeys, `return (${trimmed})`) as (...args: unknown[]) => unknown
    return fn(...scopeValues)
  }
  catch (error) {
    evaluateExpression(expression, ctx.scope, createExpressionOptions(ctx, node, nodeType))
    throw error
  }
}

function stringifyHtmlAttribute(
  name: string,
  value: unknown
): string | null {
  if (value == null || value === false) return null
  if (value === true) return name

  const serialized
    = typeof value === 'string'
      ? value
      : typeof value === 'number' || typeof value === 'bigint'
        ? String(value)
        : typeof value === 'boolean'
          ? String(value)
          : JSON.stringify(value)

  return `${name}="${escapeHtmlAttributeValue(serialized)}"`
}

function serializeIntrinsicAttributes(
  attributes: MdxJsxFlowElement['attributes'] | MdxJsxTextElement['attributes'],
  ctx: ProcessingContext
): string {
  const rendered: string[] = []

  for (const attribute of attributes) {
    if (attribute.type === 'mdxJsxAttribute') {
      if (attribute.value == null) {
        rendered.push(attribute.name)
        continue
      }

      if (typeof attribute.value === 'string') {
        rendered.push(`${attribute.name}="${escapeHtmlAttributeValue(attribute.value)}"`)
        continue
      }

      const evaluated = evaluateExpressionValue(
        attribute.value.value,
        ctx,
        attribute,
        'mdxJsxAttributeValueExpression'
      )
      const serialized = stringifyHtmlAttribute(attribute.name, evaluated)
      if (serialized != null) rendered.push(serialized)
      continue
    }

    const spreadExpression = attribute.value.replace(SPREAD_ATTRIBUTE_PREFIX_PATTERN, '').trim()
    const evaluated = evaluateExpressionValue(
      spreadExpression,
      ctx,
      attribute,
      'mdxJsxExpressionAttribute'
    )

    if (evaluated == null || typeof evaluated !== 'object' || Array.isArray(evaluated)) continue

    for (const [name, value] of Object.entries(evaluated as Record<string, unknown>)) {
      const serialized = stringifyHtmlAttribute(name, value)
      if (serialized != null) rendered.push(serialized)
    }
  }

  return rendered.length === 0 ? '' : ` ${rendered.join(' ')}`
}

function stringifyRenderedNodes(nodes: ChildNode[]): string {
  if (nodes.length === 0) return ''

  const root: Root = nodes.every(isInlineRenderableNode)
    ? {
        type: 'root',
        children: [{
          type: 'paragraph',
          children: nodes as Text[]
        } as RootContent]
      }
    : {
        type: 'root',
        children: nodes as RootContent[]
      }

  return MARKDOWN_STRINGIFIER.stringify(root).replace(TRAILING_NEWLINES_PATTERN, '')
}

async function renderGeneratedNodes(nodes: ChildNode[]): Promise<string> {
  return stringifyRenderedNodes(nodes)
}

async function renderSourceAwareNode(
  node: SourceRenderableNode,
  ctx: ProcessingContext
): Promise<string> {
  if (node.type === 'mdxjsEsm') return ''

  if (node.type === 'mdxFlowExpression' || node.type === 'mdxTextExpression') {
    const estree = (node.data as {estree?: Program} | undefined)?.estree
    const trimmedValue = node.value.trim()

    if (trimmedValue.startsWith('/*') && trimmedValue.endsWith('*/')) return ''

    if (hasJsxInEstree(estree)) {
      const rendered = await evaluateJsxExpression(node, ctx, async (children, c) => {
        const tempRoot: Root = {type: 'root', children}
        const processed = await processAst(tempRoot, c)
        return processed.children
      })

      return renderGeneratedNodes(rendered as ChildNode[])
    }

    return evaluateExpression(node.value, ctx.scope, createExpressionOptions(ctx, node, node.type))
  }

  if (node.type === 'mdxJsxFlowElement' || node.type === 'mdxJsxTextElement') {
    if (node.name != null && isMdxComponent(node.name, ctx)) {
      const rendered = await processComponent(node, ctx, processAst)
      return renderGeneratedNodes(rendered as ChildNode[])
    }

    if (isIntrinsicJsxName(node.name)) return renderIntrinsicElement(node, ctx)

    const converted = convertJsxToMarkdown(node, ctx)
    if (converted != null) return renderGeneratedNodes(converted as ChildNode[])

    return ''
  }

  const sourceSlice = getNodeSourceSlice(node, ctx)

  if (!('children' in node) || !Array.isArray(node.children) || node.children.length === 0) {
    if (sourceSlice != null) return sourceSlice
    return renderGeneratedNodes([node])
  }

  if (sourceSlice == null) return renderGeneratedNodes([node])

  const startOffset = node.position?.start.offset
  if (startOffset == null) return sourceSlice

  const replacements: SourceReplacement[] = []
  for (const child of node.children as SourceRenderableNode[]) {
    const childStart = child.position?.start.offset
    const childEnd = child.position?.end?.offset

    if (childStart == null || childEnd == null || childStart > childEnd) continue

    replacements.push({
      start: childStart,
      end: childEnd,
      value: await renderSourceAwareNode(child, ctx)
    })
  }

  return applySourceReplacements(sourceSlice, startOffset, replacements)
}

function isSelfClosingIntrinsicElement(
  element: MdxJsxFlowElement | MdxJsxTextElement,
  ctx: ProcessingContext
): boolean {
  return getNodeSourceSlice(element, ctx)?.trimEnd().endsWith('/>') ?? false
}

async function renderIntrinsicElement(
  element: MdxJsxFlowElement | MdxJsxTextElement,
  ctx: ProcessingContext
): Promise<string> {
  if (!isIntrinsicJsxName(element.name)) return ''

  const attributes = serializeIntrinsicAttributes(element.attributes, ctx)
  const renderedChildren = await Promise.all(
    element.children.map(async child => renderSourceAwareNode(child as SourceRenderableNode, ctx))
  )
  const content = renderedChildren.join('')

  if (content === '' && isSelfClosingIntrinsicElement(element, ctx)) return `<${element.name}${attributes} />`

  return `<${element.name}${attributes}>${content}</${element.name}>`
}

async function preserveIntrinsicFlowElement(
  element: MdxJsxFlowElement,
  ctx: ProcessingContext
): Promise<RootContent[]> {
  const rendered = await renderIntrinsicElement(element, ctx)
  if (rendered === '') return []

  return [{
    type: 'html',
    value: rendered
  } as RootContent]
}

async function preserveIntrinsicTextElement(
  element: MdxJsxTextElement,
  ctx: ProcessingContext
): Promise<ChildNode[]> {
  const rendered = await renderIntrinsicElement(element, ctx)
  if (rendered === '') return []

  return [{
    type: 'text',
    value: rendered
  }]
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

  if (isIntrinsicJsxName(element.name)) return preserveIntrinsicFlowElement(element, ctx)

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
        continue
      }

      if (isIntrinsicJsxName(textElement.name)) {
        result.push(...await preserveIntrinsicTextElement(textElement, ctx))
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
