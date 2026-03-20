import type {
  ProjectConfig,
  RulePrompt,
  SeriName
} from './types'
import * as fs from 'node:fs'
import {createRequire} from 'node:module'
import * as path from 'node:path'
import process from 'node:process'

/** Core series filtering helpers. Delegates to the unified CLI Rust NAPI when available, falls back to pure-TS implementations otherwise. */
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
    const existingValues = merged[key] ?? []
    merged[key] = Object.hasOwn(merged, key) ? [...new Set([...existingValues, ...values])] : [...values]
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
  catch {
  } // NAPI unavailable — pure-TS fallback will be used.
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
  const effectiveSeries = resolveEffectiveIncludeSeries(
    projectConfig?.includeSeries,
    projectConfig?.[configPath]?.includeSeries
  )
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

function extractPrefixAndBaseGlob(
  glob: string,
  prefixes: readonly string[]
): {prefix: string | null, baseGlob: string} {
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

export function applySubSeriesGlobPrefix(
  rules: readonly RulePrompt[],
  projectConfig: ProjectConfig | undefined
): readonly RulePrompt[] {
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
      const matched = Array.isArray(rule.seriName)
        ? rule.seriName.some(name => seriNames.includes(name))
        : seriNames.includes(rule.seriName)
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

/**
 * Resolves the actual `.git/info` directory for a given project path.
 * Handles both regular git repos (`.git` is a directory) and submodules/worktrees (`.git` is a file with `gitdir:` pointer).
 * Returns `null` if no valid git info directory can be resolved.
 */
export function resolveGitInfoDir(projectDir: string): string | null {
  const dotGitPath = path.join(projectDir, '.git')

  if (!fs.existsSync(dotGitPath)) return null

  const stat = fs.lstatSync(dotGitPath)

  if (stat.isDirectory()) {
    const infoDir = path.join(dotGitPath, 'info')
    return infoDir
  }

  if (stat.isFile()) {
    try {
      const content = fs.readFileSync(dotGitPath, 'utf8').trim()
      const match = /^gitdir: (.+)$/.exec(content)
      if (match?.[1] != null) {
        const gitdir = path.resolve(projectDir, match[1])
        return path.join(gitdir, 'info')
      }
    }
    catch {
    } // ignore read errors
  }

  return null
}

/**
 * Recursively discovers all `.git` entries (directories or files) under a given root,
 * skipping common non-source directories.
 * Returns absolute paths of directories containing a `.git` entry.
 */
export function findAllGitRepos(rootDir: string, maxDepth = 5): string[] {
  const results: string[] = []
  const SKIP_DIRS = new Set(['node_modules', '.turbo', 'dist', 'build', 'out', '.cache'])

  function walk(dir: string, depth: number): void {
    if (depth > maxDepth) return

    let entries: fs.Dirent[]
    try {
      const raw = fs.readdirSync(dir, {withFileTypes: true})
      if (!Array.isArray(raw)) return
      entries = raw
    }
    catch {
      return
    }

    const hasGit = entries.some(e => e.name === '.git')
    if (hasGit && dir !== rootDir) results.push(dir)

    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      if (entry.name === '.git' || SKIP_DIRS.has(entry.name)) continue
      walk(path.join(dir, entry.name), depth + 1)
    }
  }

  walk(rootDir, 0)
  return results
}

/**
 * Scans `.git/modules/` directory recursively to find all submodule `info/` dirs.
 * Handles nested submodules (modules within modules).
 * Returns absolute paths of `info/` directories.
 */
export function findGitModuleInfoDirs(dotGitDir: string): string[] {
  const modulesDir = path.join(dotGitDir, 'modules')
  if (!fs.existsSync(modulesDir)) return []

  const results: string[] = []

  function walk(dir: string): void {
    let entries: fs.Dirent[]
    try {
      const raw = fs.readdirSync(dir, {withFileTypes: true})
      if (!Array.isArray(raw)) return
      entries = raw
    }
    catch {
      return
    }

    const hasInfo = entries.some(e => e.name === 'info' && e.isDirectory())
    if (hasInfo) results.push(path.join(dir, 'info'))

    const nestedModules = entries.find(e => e.name === 'modules' && e.isDirectory())
    if (nestedModules == null) return

    let subEntries: fs.Dirent[]
    try {
      const raw = fs.readdirSync(path.join(dir, 'modules'), {withFileTypes: true})
      if (!Array.isArray(raw)) return
      subEntries = raw
    }
    catch {
      return
    }
    for (const sub of subEntries) {
      if (sub.isDirectory()) walk(path.join(dir, 'modules', sub.name))
    }
  }

  let topEntries: fs.Dirent[]
  try {
    const raw = fs.readdirSync(modulesDir, {withFileTypes: true})
    if (!Array.isArray(raw)) return results
    topEntries = raw
  }
  catch {
    return results
  }

  for (const entry of topEntries) {
    if (entry.isDirectory()) walk(path.join(modulesDir, entry.name))
  }

  return results
}
