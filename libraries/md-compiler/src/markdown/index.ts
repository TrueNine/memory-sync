import type {Root, RootContent} from 'mdast'
import {readdirSync} from 'node:fs'
import {createRequire} from 'node:module'
import {dirname, join} from 'node:path'
import process from 'node:process'
import * as YAML from 'yaml'

import {parseMdx} from '@/compiler' // Napi binding types
import {shouldSkipNativeBinding} from '../native-binding'

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

const FRONT_MATTER_PATTERN = /^---\r?\n[\s\S]*?\r?\n---(?:(?:\r?\n){1,2}|$)/u
const MDX_REFERENCE_PATTERN = /(!?\[)([^\]]*)(\]\()([^)]+)(\))/gu
const TRAILING_MDX_EXTENSION_PATTERN = /\.mdx$/u
const LINK_TEXT_MDX_EXTENSION_PATTERN = /\.mdx(?=#|\?|$)/gu
const EXTERNAL_URL_PATTERN = /^(?:https?:)?\/\//u
const URL_TRAILING_MDX_EXTENSION_PATTERN = /\.mdx$/u
const URL_HASH_MDX_EXTENSION_PATTERN = /\.mdx#/u
const URL_QUERY_MDX_EXTENSION_PATTERN = /\.mdx\?/u
let napiBinding: NapiMdCompilerModule | null = null

function isNapiMdCompilerModule(value: unknown): value is NapiMdCompilerModule {
  if (value == null || typeof value !== 'object') return false

  const candidate = value as Partial<NapiMdCompilerModule>
  return typeof candidate.buildFrontMatter === 'function'
    && typeof candidate.buildMarkdownWithFrontMatter === 'function'
    && typeof candidate.parseMarkdown === 'function'
    && typeof candidate.transformMdxReferencesToMd === 'function'
}

function loadBindingFromCliBinaryPackage(
  requireFn: ReturnType<typeof createRequire>,
  suffix: string
): NapiMdCompilerModule | null {
  const packageName = `@truenine/memory-sync-cli-${suffix}`

  try {
    const pkg = requireFn(packageName) as Record<string, unknown>
    const binding = pkg['mdCompiler']

    if (isNapiMdCompilerModule(binding)) return binding
  }
  catch {
  } // Fall through to the package-directory probe below.

  try {
    const packageJsonPath = requireFn.resolve(`${packageName}/package.json`)
    const packageDir = dirname(packageJsonPath)
    const bindingCandidates = readdirSync(packageDir)
      .filter(fileName => fileName.startsWith('napi-md-compiler.') && fileName.endsWith('.node'))
      .sort()

    for (const candidateFile of bindingCandidates) {
      const binding = requireFn(join(packageDir, candidateFile)) as unknown
      if (isNapiMdCompilerModule(binding)) return binding
    }
  }
  catch {
    return null
  }

  return null
}

try {
  if (!shouldSkipNativeBinding()) {
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
        napiBinding = loadBindingFromCliBinaryPackage(require, suffix)
      }
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
  readonly blankLineAfter?: boolean
} // buildFrontMatter

function shouldUseBlankLineAfter(options?: BuildMarkdownOptions): boolean {
  return options?.blankLineAfter ?? true
}

export function buildFrontMatter(
  frontMatter: Record<string, unknown>,
  options?: BuildMarkdownOptions
): string {
  if (napiBinding != null && options == null) return napiBinding.buildFrontMatter(JSON.stringify(frontMatter))
  const cleanedFrontMatter = Object.fromEntries(
    Object.entries(frontMatter).filter(([, value]) => value != null)
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
  if (frontMatter == null || Object.keys(frontMatter).length === 0) return content
  const fmStr = buildFrontMatter(frontMatter, options)
  const separator = shouldUseBlankLineAfter(options) ? '\n\n' : '\n'
  return `${fmStr}${separator}${content}`
} // buildRawFrontMatter — TS only (no napi equivalent needed)

export function buildRawFrontMatter(
  frontMatter: Record<string, unknown>,
  options?: BuildMarkdownOptions
): string {
  const cleanedFrontMatter = Object.fromEntries(
    Object.entries(frontMatter).filter(([, value]) => value != null)
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
  content: string,
  options?: BuildMarkdownOptions
): string {
  const wrapped = wrapRawFrontMatter(rawFrontMatter)
  const separator = shouldUseBlankLineAfter(options) ? '\n\n' : '\n'
  return `${wrapped}${separator}${content}`
} // doubleQuoted — TS only (YAML-specific helper)

export function doubleQuoted(value: string): unknown {
  const scalar = new YAML.Scalar(value)
  scalar.type = YAML.Scalar.QUOTE_DOUBLE
  return scalar
} // parseMarkdown

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
    contentWithoutFrontMatter = rawContent.replace(FRONT_MATTER_PATTERN, '')
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
    MDX_REFERENCE_PATTERN,
    (_match, prefix: string, text: string, middle: string, url: string, suffix: string) => {
      const transformedText = text
        .replace(TRAILING_MDX_EXTENSION_PATTERN, '.md')
        .replaceAll(LINK_TEXT_MDX_EXTENSION_PATTERN, '.md')

      if (EXTERNAL_URL_PATTERN.test(url)) return `${prefix}${transformedText}${middle}${url}${suffix}`

      const transformedUrl = url
        .replace(URL_TRAILING_MDX_EXTENSION_PATTERN, '.md')
        .replace(URL_HASH_MDX_EXTENSION_PATTERN, '.md#')
        .replace(URL_QUERY_MDX_EXTENSION_PATTERN, '.md?')

      return `${prefix}${transformedText}${middle}${transformedUrl}${suffix}`
    }
  )
}
