import type {Root, RootContent} from 'mdast'
import {createRequire} from 'node:module'
import process from 'node:process'
import * as YAML from 'yaml'

import {parseMdx} from '../compiler/parser' // Napi binding types

interface NapiMdCompilerModule {
  buildFrontMatter: (frontMatterJson: string) => string
  buildMarkdownWithFrontMatter: (frontMatterJson: string | null | undefined, content: string) => string
  parseMarkdown: (rawContent: string) => {
    yamlFrontMatterJson?: string
    rawFrontMatter?: string
    contentWithoutFrontMatter: string
  }
  transformMdxReferencesToMd: (content: string) => string
}

let napiBinding: NapiMdCompilerModule | null = null

try {
  const require = createRequire(import.meta.url)
  const {platform, arch} = process
  const platforms: Record<string, [local: string, suffix: string]> = {
    'win32-x64': ['napi-md-compiler.win32-x64-msvc', 'win32-x64-msvc'],
    'linux-x64': ['napi-md-compiler.linux-x64-gnu', 'linux-x64-gnu'],
    'linux-arm64': ['napi-md-compiler.linux-arm64-gnu', 'linux-arm64-gnu'],
    'darwin-arm64': ['napi-md-compiler.darwin-arm64', 'darwin-arm64'],
    'darwin-x64': ['napi-md-compiler.darwin-x64', 'darwin-x64']
  }
  const entry = platforms[`${platform}-${arch}`]
  if (entry != null) {
    const [local, suffix] = entry
    try {
      napiBinding = require(`../${local}.node`) as NapiMdCompilerModule
    }
    catch {
      try {
        const pkg = require(`@truenine/memory-sync-cli-${suffix}`) as Record<string, unknown>
        napiBinding = pkg['mdCompiler'] as NapiMdCompilerModule
      }
      catch {}
    }
  }
}
catch {} // Native module not available — fall back to pure-TS implementation

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
} // buildFrontMatter

export function buildFrontMatter(
  frontMatter: Record<string, unknown>,
  options?: BuildMarkdownOptions
): string {
  if (napiBinding != null && options == null) return napiBinding.buildFrontMatter(JSON.stringify(frontMatter))
  const cleanedFrontMatter = Object.fromEntries(
    Object.entries(frontMatter).filter(([_, v]) => v != null)
  )
  if (Object.keys(cleanedFrontMatter).length === 0) return '---\n---'
  const yamlStr = YAML.stringify(cleanedFrontMatter, {
    singleQuote: options?.singleQuote ?? false,
    lineWidth: options?.lineWidth ?? 0
  }).trimEnd()
  return `---\n${yamlStr}\n---`
} // buildMarkdownWithFrontMatter

export function buildMarkdownWithFrontMatter(
  frontMatter: Record<string, unknown> | undefined | null,
  content: string,
  options?: BuildMarkdownOptions
): string {
  if (napiBinding != null && options == null) {
    if (frontMatter == null || Object.keys(frontMatter).length === 0) return content
    return napiBinding.buildMarkdownWithFrontMatter(JSON.stringify(frontMatter), content)
  }
  if (frontMatter == null || Object.keys(frontMatter).length === 0) return content
  const fmStr = buildFrontMatter(frontMatter, options)
  return `${fmStr}\n${content}`
} // buildRawFrontMatter — TS only (no napi equivalent needed)

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

export function wrapRawFrontMatter(rawYamlContent: string): string {
  const trimmed = rawYamlContent.trim()
  if (trimmed.length === 0) return '---\n---'
  return `---\n${trimmed}\n---`
}

/**
 * Builds complete markdown content with raw (pre-serialized) front matter.
 * Use this when you have pre-serialized YAML that should not be re-parsed.
 */
export function buildMarkdownWithRawFrontMatter(
  rawFrontMatter: string,
  content: string
): string {
  const wrapped = wrapRawFrontMatter(rawFrontMatter)
  return `${wrapped}\n${content}`
} // doubleQuoted — TS only (YAML-specific helper)

export function doubleQuoted(value: string): unknown {
  const s = new YAML.Scalar(value)
  s.type = YAML.Scalar.QUOTE_DOUBLE
  return s
} // parseMarkdown

export function parseMarkdown<Y = Record<string, unknown>>(rawContent: string): ParsedMarkdown<Y> {
  if (napiBinding != null) {
    const result = napiBinding.parseMarkdown(rawContent)
    const yamlFrontMatter = result.yamlFrontMatterJson != null
      ? JSON.parse(result.yamlFrontMatterJson) as Y
      : void 0
    const ast = parseMdx(rawContent) // Still need the AST for consumers that use markdownAst/markdownContents
    const markdownContents: RootContent[] = []
    for (const node of ast.children as (RootContent & {type: string})[]) {
      if (node.type !== 'yaml') markdownContents.push(node)
    }
    return {
      ...yamlFrontMatter != null && {yamlFrontMatter},
      ...result.rawFrontMatter != null && {rawFrontMatter: result.rawFrontMatter},
      markdownAst: ast,
      markdownContents,
      contentWithoutFrontMatter: result.contentWithoutFrontMatter
    }
  }
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
} // transformMdxReferencesToMd

export function transformMdxReferencesToMd(content: string): string {
  if (napiBinding != null) return napiBinding.transformMdxReferencesToMd(content)
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
