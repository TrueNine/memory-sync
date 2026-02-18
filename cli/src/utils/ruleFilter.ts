import type {ProjectConfig} from '@/types/ConfigTypes'
import type {RulePrompt} from '@/types/InputTypes'

/**
 * Expand names with their subSeries definitions.
 * Each name in `names` is expanded to include its children from `subSeries`.
 * Expansion is only one level deep.
 */
export function expandWithSubSeries(
  names: readonly string[],
  subSeries: Readonly<Record<string, readonly string[]>>
): readonly string[] {
  const result = new Set<string>(names)

  for (const name of names) {
    if (Object.hasOwn(subSeries, name)) { // (e.g., keys like "constructor" would access Object.prototype.constructor) // Use Object.prototype.hasOwnProperty to avoid prototype pollution
      const children = subSeries[name]
      if (children != null) {
        for (const child of children) result.add(child)
      }
    }
  }

  return [...result]
}

/**
 * Filter rules based on project configuration.
 *
 * Logic:
 * 1. If no projectConfig.rules exists, return all rules (backward compatible)
 * 2. Expand include/exclude with subSeries mappings
 * 3. Rules without seriName are always included (backward compatible)
 * 4. Apply include filter first (if exists)
 * 5. Apply exclude filter second (if exists)
 *
 * @param rules - Array of RulePrompt to filter
 * @param projectConfig - Project configuration containing rules config
 * @returns Filtered array of RulePrompt
 */
export function filterRulesByProjectConfig(
  rules: readonly RulePrompt[],
  projectConfig: ProjectConfig | undefined
): readonly RulePrompt[] {
  const rulesConfig = projectConfig?.rules
  if (rulesConfig == null) return rules

  const {include, exclude, subSeries} = rulesConfig

  let effectiveInclude = include // Expand include with subSeries
  if (effectiveInclude != null && subSeries != null) effectiveInclude = expandWithSubSeries(effectiveInclude, subSeries)

  let effectiveExclude = exclude // Expand exclude with subSeries
  if (effectiveExclude != null && subSeries != null) effectiveExclude = expandWithSubSeries(effectiveExclude, subSeries)

  return rules.filter(rule => {
    if (rule.seriName == null) { // seriName undefined → always output (backward compatible)
      return true
    }

    if (effectiveInclude != null && effectiveInclude.length > 0) { // Include filter
      if (!effectiveInclude.includes(rule.seriName)) return false
    }

    if (effectiveExclude != null && effectiveExclude.length > 0) { // Exclude filter
      if (effectiveExclude.includes(rule.seriName)) return false
    }

    return true
  })
}
