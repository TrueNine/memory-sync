import {getNapiMdCompilerBinding} from './native-binding'

export interface BuildTomlDocumentOptions {
  readonly fieldOrder?: readonly string[]
}

export interface BuildPromptTomlArtifactOptions extends BuildTomlDocumentOptions {
  readonly content: string
  readonly bodyFieldName: string
  readonly frontMatter?: Readonly<Record<string, unknown>>
  readonly fieldNameMap?: Readonly<Record<string, string>>
  readonly excludedKeys?: readonly string[]
  readonly extraFields?: Readonly<Record<string, unknown>>
}

function normalizeForNative(value: unknown): unknown {
  if (value == null) return value
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'bigint') return value.toString()

  if (Array.isArray(value)) return value.map(item => normalizeForNative(item))

  if (typeof value !== 'object') return value

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([key, nested]) => [key, normalizeForNative(nested)] as const)
  )
}

function serializeForNative(value: unknown): string {
  return JSON.stringify(normalizeForNative(value))
}

export function buildTomlDocument(
  value: Readonly<Record<string, unknown>>,
  options?: BuildTomlDocumentOptions
): string {
  return getNapiMdCompilerBinding().buildTomlDocument!(
    serializeForNative(value),
    options == null ? null : serializeForNative(options)
  )
}

export function buildPromptTomlArtifact(options: BuildPromptTomlArtifactOptions): string {
  return getNapiMdCompilerBinding().buildPromptTomlArtifact!(
    serializeForNative(options)
  )
}
