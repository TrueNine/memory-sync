import {createRequire} from 'node:module'
import process from 'node:process'

interface NapiConfigModule {
  loadUserConfig: (cwd: string) => string
  getGlobalConfigPathStr: () => string
  mergeConfigs: (baseJson: string, overJson: string) => string
  loadConfigFromFile: (filePath: string) => string | null
  matchesSeries: (seriName: string | string[] | null | undefined, effectiveIncludeSeries: string[]) => boolean
  resolveEffectiveIncludeSeries: (topLevel: string[] | null | undefined, typeSpecific: string[] | null | undefined) => string[]
  resolveSubSeries: (topLevel: Record<string, string[]> | null | undefined, typeSpecific: Record<string, string[]> | null | undefined) => Record<string, string[]>
}

let napiBinding: NapiConfigModule | null = null

try {
  const _require = createRequire(import.meta.url)
  const {platform, arch} = process
  const platforms: Record<string, [local: string, suffix: string]> = {
    'win32-x64': ['napi-config.win32-x64-msvc', 'win32-x64-msvc'],
    'linux-x64': ['napi-config.linux-x64-gnu', 'linux-x64-gnu'],
    'linux-arm64': ['napi-config.linux-arm64-gnu', 'linux-arm64-gnu'],
    'darwin-arm64': ['napi-config.darwin-arm64', 'darwin-arm64'],
    'darwin-x64': ['napi-config.darwin-x64', 'darwin-x64']
  }
  const entry = platforms[`${platform}-${arch}`]
  if (entry != null) {
    const [local, suffix] = entry
    try {
      napiBinding = _require(`./${local}.node`) as NapiConfigModule
    }
    catch {
      try {
        const pkg = _require(`@truenine/memory-sync-cli-${suffix}`) as Record<string, unknown>
        napiBinding = pkg['config'] as NapiConfigModule
      }
      catch {}
    }
  }
}
catch {} // Native module not available — no pure-TS fallback for config

if (napiBinding == null) {
  console.warn('[tnmsc:config] Native module not available — config operations will return empty/default values. Install the platform-specific package for your OS to enable native config loading.')
}

/**
 * Load and merge user configuration from the given cwd directory.
 * Returns the merged config as a parsed object.
 */
export function loadUserConfig(cwd: string): Record<string, unknown> {
  if (napiBinding == null) return {}
  return JSON.parse(napiBinding.loadUserConfig(cwd)) as Record<string, unknown>
}

/**
 * Get the global config file path (~/.aindex/.tnmsc.json).
 */
export function getGlobalConfigPath(): string {
  if (napiBinding != null) return napiBinding.getGlobalConfigPathStr()

  const home = process.env['HOME'] ?? process.env['USERPROFILE'] ?? '~'
  return `${home}/.aindex/.tnmsc.json`
}

/**
 * Merge two config objects. `over` fields take priority over `base`.
 */
export function mergeConfigs(
  base: Record<string, unknown>,
  over: Record<string, unknown>
): Record<string, unknown> {
  if (napiBinding == null) return {...base, ...over}
  return JSON.parse(napiBinding.mergeConfigs(JSON.stringify(base), JSON.stringify(over))) as Record<string, unknown>
}

/**
 * Load config from a specific file path. Returns null if not found.
 */
export function loadConfigFromFile(filePath: string): Record<string, unknown> | null {
  if (napiBinding == null) return null
  const result = napiBinding.loadConfigFromFile(filePath)
  return result != null ? JSON.parse(result) as Record<string, unknown> : null
}

/**
 * Compute the effective includeSeries as the set union of top-level and
 * type-specific arrays. Returns empty array when both are undefined.
 */
export function resolveEffectiveIncludeSeries(
  topLevel?: readonly string[],
  typeSpecific?: readonly string[]
): string[] {
  if (napiBinding != null) {
    return napiBinding.resolveEffectiveIncludeSeries(
      topLevel != null ? [...topLevel] : void 0,
      typeSpecific != null ? [...typeSpecific] : void 0
    )
  }
  if (topLevel == null && typeSpecific == null) return [] // Pure-TS fallback
  return [...new Set([...topLevel ?? [], ...typeSpecific ?? []])]
}

/**
 * Determine whether a prompt item should be included based on its seriName
 * and the effective includeSeries list.
 */
export function matchesSeries(
  seriName: string | readonly string[] | null | undefined,
  effectiveIncludeSeries: readonly string[]
): boolean {
  if (napiBinding != null) {
    return napiBinding.matchesSeries(
      seriName != null ? typeof seriName === 'string' ? seriName : [...seriName] : seriName,
      [...effectiveIncludeSeries]
    )
  }
  if (seriName == null) return true // Pure-TS fallback
  if (effectiveIncludeSeries.length === 0) return true
  if (typeof seriName === 'string') return effectiveIncludeSeries.includes(seriName)
  return seriName.some(name => effectiveIncludeSeries.includes(name))
}

/**
 * Deep-merge two optional subSeries records. For each key present in either
 * record, the result is the set union of both value arrays.
 */
export function resolveSubSeries(
  topLevel?: Readonly<Record<string, readonly string[]>>,
  typeSpecific?: Readonly<Record<string, readonly string[]>>
): Record<string, string[]> {
  if (napiBinding != null) {
    const toMutable = (r?: Readonly<Record<string, readonly string[]>>): Record<string, string[]> | undefined => {
      if (r == null) return void 0
      const out: Record<string, string[]> = {}
      for (const [k, v] of Object.entries(r)) out[k] = [...v]
      return out
    }
    return napiBinding.resolveSubSeries(toMutable(topLevel), toMutable(typeSpecific))
  }
  if (topLevel == null && typeSpecific == null) return {} // Pure-TS fallback
  const merged: Record<string, string[]> = {}
  for (const [key, values] of Object.entries(topLevel ?? {})) merged[key] = [...values]
  for (const [key, values] of Object.entries(typeSpecific ?? {})) {
    merged[key] = Object.hasOwn(merged, key) ? [...new Set([...merged[key]!, ...values])] : [...values]
  }
  return merged
}
