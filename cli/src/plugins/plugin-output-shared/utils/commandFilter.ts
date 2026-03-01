import type {FastCommandPrompt} from '@truenine/plugin-shared'
import type {ProjectConfig} from '@truenine/plugin-shared/types'
import {matchesSeries, resolveEffectiveIncludeSeries} from './seriesFilter'

export function filterCommandsByProjectConfig(
  commands: readonly FastCommandPrompt[],
  projectConfig: ProjectConfig | undefined
): readonly FastCommandPrompt[] {
  const effectiveSeries = resolveEffectiveIncludeSeries(projectConfig?.includeSeries, projectConfig?.commands?.includeSeries)
  return commands.filter(command => matchesSeries(command.seriName, effectiveSeries))
}
