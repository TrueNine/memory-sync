/** Core series filtering helpers. Delegates to the unified CLI Rust NAPI when available, falls back to pure-TS implementations otherwise. */
import {createRequire} from 'node:module'
import process from 'node:process'

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

function isSeriesFilterFns(candidate: unknown): candidate is SeriesFilterFns {
  if (candidate == null || typeof candidate !== 'object') return false
  const c = candidate as Record<string, unknown>
  return typeof c['matchesSeries'] === 'function'
    && typeof c['resolveEffectiveIncludeSeries'] === 'function'
    && typeof c['resolveSubSeries'] === 'function'
}

function tryLoadNapi(): SeriesFilterFns | undefined {
  const suffixMap: Record<string, string> = {
    'win32-x64': 'win32-x64-msvc',
    'linux-x64': 'linux-x64-gnu',
    'linux-arm64': 'linux-arm64-gnu',
    'darwin-arm64': 'darwin-arm64',
    'darwin-x64': 'darwin-x64'
  }
  const suffix = suffixMap[`${process.platform}-${process.arch}`]
  if (suffix == null) return void 0

  const packageName = `@truenine/memory-sync-cli-${suffix}`
  const binaryFile = `napi-memory-sync-cli.${suffix}.node`

  try {
    const _require = createRequire(import.meta.url)
    const candidates = [
      packageName,
      `${packageName}/${binaryFile}`,
      `./${binaryFile}`
    ]

    for (const specifier of candidates) {
      try {
        const loaded = _require(specifier) as unknown
        const possible = [loaded, (loaded as {default?: unknown})?.default, (loaded as {config?: unknown})?.config]
        for (const candidate of possible) {
          if (isSeriesFilterFns(candidate)) return candidate
        }
      }
      catch {}
    }
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
