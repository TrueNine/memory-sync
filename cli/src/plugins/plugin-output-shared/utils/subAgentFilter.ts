import type {SubAgentPrompt} from '@truenine/plugin-shared'
import type {ProjectConfig} from '@truenine/plugin-shared/types'
import {matchesSeries, resolveEffectiveIncludeSeries} from './seriesFilter'

export function filterSubAgentsByProjectConfig(
  subAgents: readonly SubAgentPrompt[],
  projectConfig: ProjectConfig | undefined
): readonly SubAgentPrompt[] {
  const effectiveSeries = resolveEffectiveIncludeSeries(projectConfig?.includeSeries, projectConfig?.subAgents?.includeSeries)
  return subAgents.filter(subAgent => matchesSeries(subAgent.seriName, effectiveSeries))
}
