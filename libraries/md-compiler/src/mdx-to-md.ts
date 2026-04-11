import type {ExportMetadata, MdxToMdOptions, MdxToMdResult, MetadataSource} from '@/compiler'
import {getNapiMdCompilerBinding} from './native-binding'

type NativeCompileMetadata = ExportMetadata & {
  readonly source: MetadataSource
}

interface NativeCompileResult {
  readonly content: string
  readonly metadata?: NativeCompileMetadata
}

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
  const raw = getNapiMdCompilerBinding().compileMdxToMd(content, serializeOptions(options))
  const result = JSON.parse(raw) as NativeCompileResult

  if (options?.extractMetadata === true) {
    return {
      content: result.content,
      metadata: result.metadata ?? {
        fields: {},
        source: 'yaml'
      }
    }
  }

  return result.content
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
            codeStyles: options.globalScope.codeStyles,
            tool: options.globalScope.tool
          }
        }
      : {}
  }

  return JSON.stringify(normalized)
}
