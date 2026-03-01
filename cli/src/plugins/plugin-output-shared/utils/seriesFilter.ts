/** Core series filtering helpers. Delegates to Rust NAPI via `@truenine/config` when available, falls back to pure-TS implementations otherwise. */
import {createRequire} from 'node:module'

function resolveEffectiveIncludeSeriesTS(topLevel?: readonly string[], typeSpecific?: readonly string[]): string[] {
  if (topLevel == null && typeSpecific == null) return []
  return [...new Set([...topLevel ?? [], ...typeSpecific ?? []])]
}

function matchesSeriesTS(seriName: string | readonly string[] | null | undefined, effectiveIncludeSeries: readonly string[]): boolean {
  if (seriName == null) return true
  if (effectiveIncludeSeries.length === 0) return true
  if (typeof seriName === 'string') return effectiveIncludeSeries.includes(seriName)
  return seriName.some(name => effectiveIncludeSeries.includes(name))
}

function resolveSubSeriesTS(
  topLevel?: Readonly<Record<string, readonly string[]>>,
  typeSpecific?: Readonly<Record<string, readonly string[]>>
): Record<string, string[]> {
  if (topLevel == null && typeSpecific == null) return {}
  const merged: Record<string, string[]> = {}
  for (const [key, values] of Object.entries(topLevel ?? {})) merged[key] = [...values]
  for (const [key, values] of Object.entries(typeSpecific ?? {})) {
    merged[key] = Object.hasOwn(merged, key) ? [...new Set([...merged[key]!, ...values])] : [...values]
  }
  return merged
}

interface SeriesFilterFns {
  resolveEffectiveIncludeSeries: typeof resolveEffectiveIncludeSeriesTS
  matchesSeries: typeof matchesSeriesTS
  resolveSubSeries: typeof resolveSubSeriesTS
}

function tryLoadNapi(): SeriesFilterFns | undefined {
  try {
    const _require = createRequire(import.meta.url)
    const napi = _require('@truenine/config') as SeriesFilterFns
    if (typeof napi.matchesSeries === 'function'
      && typeof napi.resolveEffectiveIncludeSeries === 'function'
      && typeof napi.resolveSubSeries === 'function') return napi
  }
  catch { /* NAPI unavailable — pure-TS fallback will be used */ }
  return void 0
}

const {
  resolveEffectiveIncludeSeries,
  matchesSeries,
  resolveSubSeries
}: SeriesFilterFns = tryLoadNapi() ?? {
  resolveEffectiveIncludeSeries: resolveEffectiveIncludeSeriesTS,
  matchesSeries: matchesSeriesTS,
  resolveSubSeries: resolveSubSeriesTS
}

export {
  matchesSeries,
  resolveEffectiveIncludeSeries,
  resolveSubSeries
}
