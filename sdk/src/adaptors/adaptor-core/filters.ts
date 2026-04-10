import type {ProjectConfig, RulePrompt, SeriName} from './types'
import {getNativeBinding} from '@/core/native-binding'

interface SeriesFilterFns {
  readonly resolveEffectiveIncludeSeries: (topLevel?: readonly string[], typeSpecific?: readonly string[]) => string[]
  readonly matchesSeries: (seriName: string | readonly string[] | null | undefined, effectiveIncludeSeries: readonly string[]) => boolean
  readonly resolveSubSeries: (
    topLevel?: Readonly<Record<string, readonly string[]>>,
    typeSpecific?: Readonly<Record<string, readonly string[]>>
  ) => Record<string, string[]>
}

let seriesFilterFnsCache: SeriesFilterFns | undefined

function getSeriesFilterFns(): SeriesFilterFns {
  if (seriesFilterFnsCache != null) return seriesFilterFnsCache

  const candidate = getNativeBinding<SeriesFilterFns>()
  if (candidate == null) {
    throw new TypeError('Native series-filter binding is required. Build or install the Rust NAPI package before running tnmsc.')
  }
  if (
    typeof candidate.matchesSeries !== 'function'
    || typeof candidate.resolveEffectiveIncludeSeries !== 'function'
    || typeof candidate.resolveSubSeries !== 'function'
  ) {
    throw new TypeError('Native series-filter binding is incomplete. Rebuild the Rust NAPI package before running tnmsc.')
  }
  seriesFilterFnsCache = candidate
  return candidate
}

function resolveEffectiveIncludeSeries(topLevel?: readonly string[], typeSpecific?: readonly string[]): string[] {
  return getSeriesFilterFns().resolveEffectiveIncludeSeries(topLevel, typeSpecific)
}

function matchesSeries(seriName: string | readonly string[] | null | undefined, effectiveIncludeSeries: readonly string[]): boolean {
  return getSeriesFilterFns().matchesSeries(seriName, effectiveIncludeSeries)
}

function resolveSubSeries(
  topLevel?: Readonly<Record<string, readonly string[]>>,
  typeSpecific?: Readonly<Record<string, readonly string[]>>
): Record<string, string[]> {
  return getSeriesFilterFns().resolveSubSeries(topLevel, typeSpecific)
}

/**
 * Interface for items that can be filtered by series name
 */
export interface SeriesFilterable {
  readonly seriName?: SeriName
}

/**
 * Configuration path types for project config lookup
 */
export type FilterConfigPath = 'commands' | 'skills' | 'subAgents' | 'rules'

export function filterByProjectConfig<T extends SeriesFilterable>(
  items: readonly T[],
  projectConfig: ProjectConfig | undefined,
  configPath: FilterConfigPath
): readonly T[] {
  const effectiveSeries = resolveEffectiveIncludeSeries(projectConfig?.includeSeries, projectConfig?.[configPath]?.includeSeries)
  return items.filter(item => matchesSeries(item.seriName, effectiveSeries))
}

export function normalizeSubdirPath(subdir: string): string {
  let normalized = subdir.replaceAll(/\.\/+/g, '')
  normalized = normalized.replaceAll(/\/+$/g, '')
  return normalized
}

function smartConcatGlob(prefix: string, glob: string): string {
  if (glob.startsWith('**/')) return `${prefix}/${glob}`
  if (glob.startsWith('*')) return `${prefix}/**/${glob}`
  return `${prefix}/${glob}`
}

function extractPrefixAndBaseGlob(glob: string, prefixes: readonly string[]): {prefix: string | null, baseGlob: string} {
  for (const prefix of prefixes) {
    const normalizedPrefix = prefix.replaceAll(/\/+$/g, '')
    const patterns = [
      {prefix: normalizedPrefix, pattern: `${normalizedPrefix}/`},
      {prefix: normalizedPrefix, pattern: `${normalizedPrefix}\\`}
    ]
    for (const {prefix: p, pattern} of patterns) {
      if (glob.startsWith(pattern)) return {prefix: p, baseGlob: glob.slice(pattern.length)}
    }
    if (glob === normalizedPrefix) return {prefix: normalizedPrefix, baseGlob: '**/*'}
  }
  return {prefix: null, baseGlob: glob}
}

export function applySubSeriesGlobPrefix(rules: readonly RulePrompt[], projectConfig: ProjectConfig | undefined): readonly RulePrompt[] {
  const subSeries = resolveSubSeries(projectConfig?.subSeries, projectConfig?.rules?.subSeries)
  if (Object.keys(subSeries).length === 0) return rules

  const normalizedSubSeries: Record<string, readonly string[]> = {}
  for (const [subdir, seriNames] of Object.entries(subSeries)) {
    const normalizedSubdir = normalizeSubdirPath(subdir)
    normalizedSubSeries[normalizedSubdir] = seriNames
  }

  const allPrefixes = Object.keys(normalizedSubSeries)

  return rules.map(rule => {
    if (rule.seriName == null) return rule

    const matchedPrefixes: string[] = []
    for (const [subdir, seriNames] of Object.entries(normalizedSubSeries)) {
      const matched = Array.isArray(rule.seriName) ? rule.seriName.some(name => seriNames.includes(name)) : seriNames.includes(rule.seriName)
      if (matched) matchedPrefixes.push(subdir)
    }

    if (matchedPrefixes.length === 0) return rule

    const newGlobs: string[] = []
    for (const originalGlob of rule.globs) {
      const {prefix: existingPrefix, baseGlob} = extractPrefixAndBaseGlob(originalGlob, allPrefixes)

      if (existingPrefix != null) newGlobs.push(originalGlob)

      for (const prefix of matchedPrefixes) {
        if (prefix === existingPrefix) continue
        const newGlob = smartConcatGlob(prefix, baseGlob)
        if (!newGlobs.includes(newGlob)) newGlobs.push(newGlob)
      }
    }

    return {
      ...rule,
      globs: newGlobs
    }
  })
}
