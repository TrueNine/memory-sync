import type {RulePrompt} from '../../types'
import type {Project, ProjectConfig} from '../../types'
import {filterByProjectConfig} from './filters'
import {resolveSubSeries} from './seriesFilter'

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

function normalizeRuleScope(rule: RulePrompt): string {
  return rule.scope ?? 'project'
}

/**
 * Returns project-scoped rules for a given project, with sub-series glob prefix applied.
 */
export function getProjectRules(rules: readonly RulePrompt[], project: Project): readonly RulePrompt[] {
  const projectRules = rules.filter(r => normalizeRuleScope(r) === 'project')
  return applySubSeriesGlobPrefix(filterByProjectConfig(projectRules, project.projectConfig, 'rules'), project.projectConfig)
}

/**
 * Returns global-scoped rules from the given rule list.
 */
export function getGlobalRules(rules: readonly RulePrompt[]): readonly RulePrompt[] {
  return rules.filter(r => normalizeRuleScope(r) === 'global')
}
