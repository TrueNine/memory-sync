import type {ExportMetadata, MetadataSource} from './compiler/export-parser'
import type {MdxToMdOptions, MdxToMdResult} from './compiler/types'
import {createRequire} from 'node:module'
import process from 'node:process'
import {mdxToMd as fallbackMdxToMd} from './compiler/mdx-to-md'

interface NapiMdCompilerModule {
  compileMdxToMd: (content: string, optionsJson?: string | null) => string
}

type NativeCompileMetadata = ExportMetadata & {
  readonly source: MetadataSource
}

interface NativeCompileResult {
  readonly content: string
  readonly metadata?: NativeCompileMetadata
}

const CODE_FENCE_PATTERN = /^\s*(```|~~~)/u
const RESIDUAL_MODULE_SYNTAX_PATTERNS = [
  /^\s*export\s+default\b/u,
  /^\s*export\s+const\b/u,
  /^\s*import\b/u
]

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
      napiBinding = require(`./${local}.node`) as NapiMdCompilerModule
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
catch {}

export async function mdxToMd(
  content: string,
  options?: MdxToMdOptions & {extractMetadata?: false}
): Promise<string>

export async function mdxToMd(
  content: string,
  options: MdxToMdOptions & {extractMetadata: true}
): Promise<MdxToMdResult>

export async function mdxToMd(
  content: string,
  options?: MdxToMdOptions
): Promise<string | MdxToMdResult> {
  const metadataOptions
    = options?.extractMetadata === true
      ? {
        ...options,
        extractMetadata: true
      } satisfies MdxToMdOptions & {extractMetadata: true}
      : null

  const nativeResult = tryNativeCompile(content, options)
  if (nativeResult != null) {
    if (metadataOptions != null) {
      const {metadata} = nativeResult
      if (metadata == null || hasResidualModuleSyntax(nativeResult.content)) return fallbackMdxToMd(content, metadataOptions)

      return {
        content: nativeResult.content,
        metadata
      }
    }

    return nativeResult.content
  }

  if (metadataOptions != null) return fallbackMdxToMd(content, metadataOptions)

  if (options == null) return fallbackMdxToMd(content)

  const fallbackOptions: MdxToMdOptions & {extractMetadata: false} = {
    ...options,
    extractMetadata: false
  }

  return fallbackMdxToMd(content, fallbackOptions)
}

function tryNativeCompile(
  content: string,
  options?: MdxToMdOptions
): NativeCompileResult | null {
  if (napiBinding == null) return null

  try {
    const raw = napiBinding.compileMdxToMd(content, serializeOptions(options))
    const result = JSON.parse(raw) as NativeCompileResult
    if (options?.extractMetadata === true && result.metadata == null) return null
    return result
  }
  catch {
    return null
  }
}

function serializeOptions(options?: MdxToMdOptions): string | null {
  if (options == null) return null

  const normalized = {
    ...options,
    ...options.globalScope != null
      ? {
          globalScope: {
            os: options.globalScope.os,
            env: options.globalScope.env,
            profile: options.globalScope.profile,
            tool: options.globalScope.tool
          }
        }
      : {}
  }

  return JSON.stringify(normalized)
}

function hasResidualModuleSyntax(content: string): boolean {
  let activeFence: string | undefined

  for (const line of content.split(/\r?\n/u)) {
    const fenceMatch = CODE_FENCE_PATTERN.exec(line)
    if (fenceMatch?.[1] != null) {
      const marker = fenceMatch[1]
      if (activeFence == null) activeFence = marker
      else if (activeFence === marker) activeFence = void 0
      continue
    }

    if (activeFence != null) continue
    if (RESIDUAL_MODULE_SYNTAX_PATTERNS.some(pattern => pattern.test(line))) return true
  }

  return false
}
