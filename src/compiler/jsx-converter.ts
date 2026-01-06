// jsx-converter.ts
// Converts JSX elements to equivalent Markdown AST nodes

import type {
  Blockquote,
  Code,
  Emphasis,
  Image,
  Link,
  Paragraph,
  RootContent,
  Strong,
} from 'mdast'
import type {
  MdxJsxAttribute,
  MdxJsxFlowElement,
  MdxJsxTextElement,
} from 'mdast-util-mdx'
import type { ProcessingContext } from './types'
import { evaluateExpression } from './expression-eval'

/**
 * Converts a JSX element to equivalent Markdown AST nodes.
 */
export function convertJsxToMarkdown(
  element: MdxJsxFlowElement | MdxJsxTextElement,
  ctx: ProcessingContext,
): RootContent[] | null {
  const name = element.name?.toLowerCase()

  if (name == null) return null

  switch (name) {
    case 'pre':
      return convertPreElement(element, ctx)
    case 'a':
      return convertLinkElement(element, ctx)
    case 'strong':
    case 'b':
      return convertStrongElement(element, ctx)
    case 'em':
    case 'i':
      return convertEmphasisElement(element, ctx)
    case 'img':
      return convertImageElement(element, ctx)
    case 'blockquote':
      return convertBlockquoteElement(element, ctx)
    default:
      return null
  }
}

/**
 * Gets an attribute value from a JSX element.
 */
function getAttributeValue(
  element: MdxJsxFlowElement | MdxJsxTextElement,
  attrName: string,
  ctx: ProcessingContext,
): string | null {
  const attr = element.attributes.find(
    (a): a is MdxJsxAttribute =>
      a.type === 'mdxJsxAttribute' && a.name === attrName,
  )

  if (attr == null) return null

  if (typeof attr.value === 'string') return attr.value

  if (
    attr.value != null
    && typeof attr.value === 'object'
    && attr.value.type === 'mdxJsxAttributeValueExpression'
  ) {
    return evaluateExpression(attr.value.value, ctx.scope)
  }

  if (attr.value === null) return ''

  return null
}

/**
 * Extracts text content from JSX element children.
 */
function extractTextContent(
  element: MdxJsxFlowElement | MdxJsxTextElement,
  ctx: ProcessingContext,
): string {
  let text = ''

  for (const child of element.children) {
    if (child.type === 'text') text += child.value
    else if (child.type === 'mdxTextExpression') text += evaluateExpression(child.value, ctx.scope)
    else if (child.type === 'mdxJsxFlowElement'
      || child.type === 'mdxJsxTextElement') {
      text += extractTextContent(child, ctx)
    }
  }

  return text
}

function convertPreElement(
  element: MdxJsxFlowElement | MdxJsxTextElement,
  ctx: ProcessingContext,
): RootContent[] | null {
  let codeChild: MdxJsxFlowElement | MdxJsxTextElement | null = null

  for (const child of element.children) {
    if (
      (child.type === 'mdxJsxFlowElement'
        || child.type === 'mdxJsxTextElement')
      && child.name?.toLowerCase() === 'code'
    ) {
      codeChild = child
      break
    }

    if (child.type === 'paragraph' && 'children' in child) {
      const paraChildren = child.children as Array<{
        type: string
        name?: string | null
      }>
      for (const paraChild of paraChildren) {
        if (
          (paraChild.type === 'mdxJsxFlowElement'
            || paraChild.type === 'mdxJsxTextElement')
          && paraChild.name?.toLowerCase() === 'code'
        ) {
          codeChild = paraChild as MdxJsxFlowElement | MdxJsxTextElement
          break
        }
      }
      if (codeChild != null) break
    }
  }

  if (codeChild == null) return null

  const className = getAttributeValue(codeChild, 'className', ctx) ?? ''
  const langMatch = className.match(/language-(\w+)/)
  const lang = langMatch?.[1]

  const code = extractTextContent(codeChild, ctx)

  const codeBlock: Code = {
    type: 'code',
    lang: lang ?? null,
    value: code.trim(),
  }

  return [codeBlock]
}

function convertLinkElement(
  element: MdxJsxFlowElement | MdxJsxTextElement,
  ctx: ProcessingContext,
): RootContent[] | null {
  const href = getAttributeValue(element, 'href', ctx)
  if (href == null || href === '') return null

  const text = extractTextContent(element, ctx)
  const title = getAttributeValue(element, 'title', ctx)

  const link: Link = {
    type: 'link',
    url: href,
    title: title ?? null,
    children: [{ type: 'text', value: text }],
  }

  const paragraph: Paragraph = {
    type: 'paragraph',
    children: [link],
  }
  return [paragraph]
}

function convertStrongElement(
  element: MdxJsxFlowElement | MdxJsxTextElement,
  ctx: ProcessingContext,
): RootContent[] | null {
  const text = extractTextContent(element, ctx)

  const strong: Strong = {
    type: 'strong',
    children: [{ type: 'text', value: text }],
  }

  if (element.type !== 'mdxJsxFlowElement') return [{ type: 'paragraph', children: [strong] }]

  const paragraph: Paragraph = {
    type: 'paragraph',
    children: [strong],
  }
  return [paragraph]
}

function convertEmphasisElement(
  element: MdxJsxFlowElement | MdxJsxTextElement,
  ctx: ProcessingContext,
): RootContent[] | null {
  const text = extractTextContent(element, ctx)

  const emphasis: Emphasis = {
    type: 'emphasis',
    children: [{ type: 'text', value: text }],
  }

  if (element.type !== 'mdxJsxFlowElement') return [{ type: 'paragraph', children: [emphasis] }]

  const paragraph: Paragraph = {
    type: 'paragraph',
    children: [emphasis],
  }
  return [paragraph]
}

function convertImageElement(
  element: MdxJsxFlowElement | MdxJsxTextElement,
  ctx: ProcessingContext,
): RootContent[] | null {
  const src = getAttributeValue(element, 'src', ctx)
  if (src == null || src === '') return null

  const alt = getAttributeValue(element, 'alt', ctx) ?? ''
  const title = getAttributeValue(element, 'title', ctx)

  const image: Image = {
    type: 'image',
    url: src,
    alt,
    title: title ?? null,
  }

  if (element.type !== 'mdxJsxFlowElement') return [{ type: 'paragraph', children: [image] }]

  const paragraph: Paragraph = {
    type: 'paragraph',
    children: [image],
  }
  return [paragraph]
}

function convertBlockquoteElement(
  element: MdxJsxFlowElement | MdxJsxTextElement,
  ctx: ProcessingContext,
): RootContent[] | null {
  const text = extractTextContent(element, ctx)

  const blockquote: Blockquote = {
    type: 'blockquote',
    children: [
      {
        type: 'paragraph',
        children: [{ type: 'text', value: text }],
      },
    ],
  }

  return [blockquote]
}
