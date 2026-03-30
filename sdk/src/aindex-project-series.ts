import type {AindexProjectSeriesName, PluginOptions} from '@/plugins/plugin-core'
import {AINDEX_PROJECT_SERIES_NAMES} from '@/plugins/plugin-core'

export interface AindexProjectSeriesConfig {
  readonly name: AindexProjectSeriesName
  readonly src: string
  readonly dist: string
}

export interface AindexProjectSeriesProjectRef {
  readonly projectName: string
  readonly seriesName: AindexProjectSeriesName
  readonly seriesDir: string
}

export interface AindexProjectSeriesProjectNameConflict {
  readonly projectName: string
  readonly refs: readonly AindexProjectSeriesProjectRef[]
}

type AindexProjectSeriesOptions = Required<PluginOptions>['aindex']

export function isAindexProjectSeriesName(value: string): value is AindexProjectSeriesName {
  return AINDEX_PROJECT_SERIES_NAMES.includes(value as AindexProjectSeriesName)
}

export function resolveAindexProjectSeriesConfigs(
  options: Required<PluginOptions>
): readonly AindexProjectSeriesConfig[] {
  return AINDEX_PROJECT_SERIES_NAMES.map(name => buildAindexProjectSeriesConfig(options.aindex, name))
}

export function resolveAindexProjectSeriesConfig(
  options: Required<PluginOptions>,
  seriesName: AindexProjectSeriesName
): AindexProjectSeriesConfig {
  return buildAindexProjectSeriesConfig(options.aindex, seriesName)
}

export function collectAindexProjectSeriesProjectNameConflicts(
  refs: readonly AindexProjectSeriesProjectRef[]
): readonly AindexProjectSeriesProjectNameConflict[] {
  const refsByProjectName = new Map<string, AindexProjectSeriesProjectRef[]>()

  for (const ref of refs) {
    const existingRefs = refsByProjectName.get(ref.projectName)
    if (existingRefs == null) refsByProjectName.set(ref.projectName, [ref])
    else existingRefs.push(ref)
  }

  return Array.from(refsByProjectName.entries(), ([projectName, projectRefs]) => ({
    projectName,
    refs: [...projectRefs]
      .sort((left, right) => left.seriesName.localeCompare(right.seriesName))
  }))
    .filter(conflict => {
      const uniqueSeriesNames = new Set(conflict.refs.map(ref => ref.seriesName))
      return uniqueSeriesNames.size > 1
    })
    .sort((left, right) => left.projectName.localeCompare(right.projectName))
}

function buildAindexProjectSeriesConfig(
  aindexOptions: AindexProjectSeriesOptions,
  seriesName: AindexProjectSeriesName
): AindexProjectSeriesConfig {
  return {
    name: seriesName,
    src: aindexOptions[seriesName].src,
    dist: aindexOptions[seriesName].dist
  }
}
