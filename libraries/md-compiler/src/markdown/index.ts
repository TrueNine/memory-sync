import type {Root, RootContent} from 'mdast'
import * as YAML from 'yaml'

import {parseMdx} from '@/compiler'
import {getNapiMdCompilerBinding} from '../native-binding'

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
  readonly blankLineAfter?: boolean
}

function shouldUseBlankLineAfter(options?: BuildMarkdownOptions): boolean {
  return options?.blankLineAfter ?? true
}

function cleanFrontMatter(frontMatter: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(frontMatter).filter(([, value]) => value != null)
  )
}

export function buildFrontMatter(
  frontMatter: Record<string, unknown>,
  options?: BuildMarkdownOptions
): string {
  const cleanedFrontMatter = cleanFrontMatter(frontMatter)
  if (Object.keys(cleanedFrontMatter).length === 0) return '---\n---'

  if ((options?.singleQuote == null || !options.singleQuote) && (options?.lineWidth == null || options.lineWidth === 0)) {
    return getNapiMdCompilerBinding().buildFrontMatter(JSON.stringify(cleanedFrontMatter))
  }

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
  const separator = shouldUseBlankLineAfter(options) ? '\n\n' : '\n'
  return `${fmStr}${separator}${content}`
}

export function buildRawFrontMatter(
  frontMatter: Record<string, unknown>,
  options?: BuildMarkdownOptions
): string {
  const cleanedFrontMatter = cleanFrontMatter(frontMatter)
  if (Object.keys(cleanedFrontMatter).length === 0) return ''
  return YAML.stringify(cleanedFrontMatter, {
    singleQuote: options?.singleQuote ?? false,
    lineWidth: options?.lineWidth ?? 0
  }).trimEnd()
}

export function wrapRawFrontMatter(rawYamlContent: string): string {
  const trimmed = rawYamlContent.trim()
  if (trimmed.length === 0) return '---\n---'
  return `---\n${trimmed}\n---`
}

export function buildMarkdownWithRawFrontMatter(
  rawFrontMatter: string,
  content: string,
  options?: BuildMarkdownOptions
): string {
  const wrapped = wrapRawFrontMatter(rawFrontMatter)
  const separator = shouldUseBlankLineAfter(options) ? '\n\n' : '\n'
  return `${wrapped}${separator}${content}`
}

export function doubleQuoted(value: string): unknown {
  const scalar = new YAML.Scalar(value)
  scalar.type = YAML.Scalar.QUOTE_DOUBLE
  return scalar
}

export function parseMarkdown<Y = Record<string, unknown>>(rawContent: string): ParsedMarkdown<Y> {
  const bindingResult = getNapiMdCompilerBinding().parseMarkdown(rawContent)
  const ast = parseMdx(rawContent)
  const markdownContents: RootContent[] = []

  for (const node of ast.children as (RootContent & {type: string})[]) {
    if (node.type !== 'yaml') markdownContents.push(node)
  }

  let yamlFrontMatter: Y | undefined
  if (bindingResult.yamlFrontMatterJson != null) {
    yamlFrontMatter = JSON.parse(bindingResult.yamlFrontMatterJson) as Y
  }

  return {
    ...yamlFrontMatter != null && {yamlFrontMatter},
    ...bindingResult.rawFrontMatter != null && {rawFrontMatter: bindingResult.rawFrontMatter},
    markdownAst: ast,
    markdownContents,
    contentWithoutFrontMatter: bindingResult.contentWithoutFrontMatter
  }
}

export function transformMdxReferencesToMd(content: string): string {
  return getNapiMdCompilerBinding().transformMdxReferencesToMd(content)
}
