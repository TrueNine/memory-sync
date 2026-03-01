import type {SkillPrompt} from '@truenine/plugin-shared'
import type {ProjectConfig} from '@truenine/plugin-shared/types'
import {matchesSeries, resolveEffectiveIncludeSeries} from './seriesFilter'

export function filterSkillsByProjectConfig(
  skills: readonly SkillPrompt[],
  projectConfig: ProjectConfig | undefined
): readonly SkillPrompt[] {
  const effectiveSeries = resolveEffectiveIncludeSeries(projectConfig?.includeSeries, projectConfig?.skills?.includeSeries)
  return skills.filter(skill => matchesSeries(skill.seriName, effectiveSeries))
}
