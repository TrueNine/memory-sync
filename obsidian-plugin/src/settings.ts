import type {TnmsoSettings} from './compiler/types'

export const DEFAULT_SETTINGS: TnmsoSettings = {
  compiledPreviewEnabled: true,
  scope: {},
}

export type ScopeParseResult =
  | {ok: true, scope: Record<string, unknown>}
  | {ok: false, message: string}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

function sanitizeRecord(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => !['__proto__', 'constructor', 'prototype'].includes(key)),
  )
}

export function normalizeSettings(value: unknown): TnmsoSettings {
  if (!isRecord(value)) return {...DEFAULT_SETTINGS}
  return {
    compiledPreviewEnabled: typeof value.compiledPreviewEnabled === 'boolean'
      ? value.compiledPreviewEnabled
      : DEFAULT_SETTINGS.compiledPreviewEnabled,
    scope: isRecord(value.scope) ? sanitizeRecord(value.scope) : {},
  }
}

export function parseScopeText(source: string): ScopeParseResult {
  try {
    const value: unknown = JSON.parse(source)
    if (!isRecord(value)) {
      return {ok: false, message: 'Scope must be a JSON object.'}
    }
    return {ok: true, scope: sanitizeRecord(value)}
  } catch (error) {
    return {ok: false, message: error instanceof Error ? error.message : String(error)}
  }
}
