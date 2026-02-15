import type {Root, RootContent} from 'mdast'
import * as YAML from 'yaml'
import {parseMdx} from '../compiler/parser'

export interface ParsedMarkdown<Y = Record<string, unknown>> {
  readonly yamlFrontMatter?: Y
  readonly rawFrontMatter?: string
  readonly markdownAst: Root
  readonly markdownContents: readonly RootContent[]
  readonly contentWithoutFrontMatter: string
}

export interface BuildMarkdownOptions {
  readonly singleQuote?: boolean
  readonly lineWidth?: number
}

export function buildFrontMatter(
  frontMatter: Record<string, unknown>,
  options?: BuildMarkdownOptions
): string {
  const cleanedFrontMatter = Object.fromEntries(
    Object.entries(frontMatter).filter(([_, v]) => v != null)
  )
  if (Object.keys(cleanedFrontMatter).length === 0) return '---\n---'
  const yamlStr = YAML.stringify(cleanedFrontMatter, {
    singleQuote: options?.singleQuote ?? false,
    lineWidth: options?.lineWidth ?? 0
  }).trimEnd()
  return `---\n${yamlStr}\n---`
}

export function buildMarkdownWithFrontMatter(
  frontMatter: Record<string, unknown> | undefined | null,
  content: string,
  options?: BuildMarkdownOptions
): string {
  if (frontMatter == null || Object.keys(frontMatter).length === 0) return content
  const fmStr = buildFrontMatter(frontMatter, options)
  return `${fmStr}\n${content}`
}

export function buildRawFrontMatter(
  frontMatter: Record<string, unknown>,
  options?: BuildMarkdownOptions
): string {
  const cleanedFrontMatter = Object.fromEntries(
    Object.entries(frontMatter).filter(([_, v]) => v != null)
  )
  if (Object.keys(cleanedFrontMatter).length === 0) return ''
  return YAML.stringify(cleanedFrontMatter, {
    singleQuote: options?.singleQuote ?? false,
    lineWidth: options?.lineWidth ?? 0
  }).trimEnd()
}

export function parseMarkdown<Y = Record<string, unknown>>(rawContent: string): ParsedMarkdown<Y> {
  const ast = parseMdx(rawContent)
  let yamlFrontMatter: Y | undefined,
    rawFrontMatter: string | undefined
  const markdownContents: RootContent[] = []
  for (const node of ast.children as (RootContent & {type: string, value?: string})[]) {
    if (node.type === 'yaml') {
      rawFrontMatter = node.value
      try {
        yamlFrontMatter = YAML.parse(node.value ?? '') as Y
      }
      catch {}
    } else markdownContents.push(node)
  }
  let contentWithoutFrontMatter = rawContent
  if (rawFrontMatter != null) {
    const frontMatterRegex = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/
    contentWithoutFrontMatter = rawContent.replace(frontMatterRegex, '')
  }
  return {
    ...yamlFrontMatter != null && {yamlFrontMatter},
    ...rawFrontMatter != null && {rawFrontMatter},
    markdownAst: ast,
    markdownContents,
    contentWithoutFrontMatter
  }
}

export function transformMdxReferencesToMd(content: string): string {
  return content.replaceAll(
    /(!?\[)([^\]]*)(\]\()([^)]+)(\))/g,
    (_match, prefix: string, text: string, middle: string, url: string, suffix: string) => {
      const transformedText = text
        .replaceAll(/\.mdx$/g, '.md')
        .replaceAll(/\.mdx(?=#|\?|$)/g, '.md')
      if (/^(?:https?:)?\/\//.test(url)) return `${prefix}${transformedText}${middle}${url}${suffix}`
      const transformedUrl = url
        .replace(/\.mdx$/, '.md')
        .replace(/\.mdx#/, '.md#')
        .replace(/\.mdx\?/, '.md?')
      return `${prefix}${transformedText}${middle}${transformedUrl}${suffix}`
    }
  )
}
