import type {CommandPrompt, RulePrompt, SeriName, SkillPrompt, SubAgentPrompt} from '@truenine/plugin-shared'
import type {ProjectConfig} from '@truenine/plugin-shared/types'
import {matchesSeries, resolveEffectiveIncludeSeries} from './seriesFilter'

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

/**
 * Filter commands by project configuration
 * @deprecated Use filterByProjectConfig(commands, config, 'commands') instead
 */
export function filterCommandsByProjectConfig(
  commands: readonly CommandPrompt[],
  projectConfig: ProjectConfig | undefined
): readonly CommandPrompt[] {
  return filterByProjectConfig(commands, projectConfig, 'commands')
}

/**
 * Filter skills by project configuration
 * @deprecated Use filterByProjectConfig(skills, config, 'skills') instead
 */
export function filterSkillsByProjectConfig(
  skills: readonly SkillPrompt[],
  projectConfig: ProjectConfig | undefined
): readonly SkillPrompt[] {
  return filterByProjectConfig(skills, projectConfig, 'skills')
}

/**
 * Filter sub-agents by project configuration
 * @deprecated Use filterByProjectConfig(subAgents, config, 'subAgents') instead
 */
export function filterSubAgentsByProjectConfig(
  subAgents: readonly SubAgentPrompt[],
  projectConfig: ProjectConfig | undefined
): readonly SubAgentPrompt[] {
  return filterByProjectConfig(subAgents, projectConfig, 'subAgents')
}

/**
 * Filter rules by project configuration
 * @deprecated Use filterByProjectConfig(rules, config, 'rules') instead
 */
export function filterRulesByProjectConfig(
  rules: readonly RulePrompt[],
  projectConfig: ProjectConfig | undefined
): readonly RulePrompt[] {
  return filterByProjectConfig(rules, projectConfig, 'rules')
}
