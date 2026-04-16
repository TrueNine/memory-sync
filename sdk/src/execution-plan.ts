import type {AindexProjectSeriesName} from './adaptors/adaptor-core/AindexConfigDefaults'
import type {
  OutputCollectedContext
} from './adaptors/adaptor-core/InputTypes'
import {getNativeBinding} from './core/native-binding'
import * as executionPlanLegacy from './execution-plan-legacy'

export type ExecutionScope
  = | 'workspace'
    | 'project'
    | 'external'
    | 'unsupported'

export interface ExecutionPlanProjectSummary {
  readonly name: string
  readonly rootDir: string
  readonly projectType?: AindexProjectSeriesName
}

export interface ExecutionPlanProjectsByType {
  readonly app: readonly ExecutionPlanProjectSummary[]
  readonly ext: readonly ExecutionPlanProjectSummary[]
  readonly arch: readonly ExecutionPlanProjectSummary[]
  readonly softwares: readonly ExecutionPlanProjectSummary[]
}

interface ExecutionPlanBase {
  readonly cwd: string
  readonly workspaceDir: string
  readonly projectsByType: ExecutionPlanProjectsByType
}

export interface WorkspaceExecutionPlan extends ExecutionPlanBase {
  readonly scope: 'workspace'
}

export interface ProjectExecutionPlan extends ExecutionPlanBase {
  readonly scope: 'project'
  readonly matchedProject: ExecutionPlanProjectSummary
}

export interface ExternalExecutionPlan extends ExecutionPlanBase {
  readonly scope: 'external'
}

export interface UnsupportedExecutionPlan extends ExecutionPlanBase {
  readonly scope: 'unsupported'
  readonly managedProjects: readonly ExecutionPlanProjectSummary[]
}

export type ExecutionPlan
  = | WorkspaceExecutionPlan
    | ProjectExecutionPlan
    | ExternalExecutionPlan
    | UnsupportedExecutionPlan

interface PathScopedEntry {
  readonly path: string
  readonly scope?: string
}

export function createEmptyExecutionPlanProjectsByType(): ExecutionPlanProjectsByType {
  return {
    app: Object.freeze([]),
    ext: Object.freeze([]),
    arch: Object.freeze([]),
    softwares: Object.freeze([])
  } as unknown as ExecutionPlanProjectsByType
}

export function resolveExecutionPlan(
  context: OutputCollectedContext,
  executionCwd: string
): ExecutionPlan {
  const native = getNativeBinding<{
    resolveExecutionPlan?: (contextJson: string, executionCwd: string) => string
  }>()

  if (native?.resolveExecutionPlan == null) return executionPlanLegacy.resolveExecutionPlan(context, executionCwd)

  const result = native.resolveExecutionPlan(JSON.stringify(context), executionCwd)
  return JSON.parse(result) as ExecutionPlan
}

export function filterPathScopedEntriesForExecutionPlan<
  T extends PathScopedEntry
>(
  entries: readonly T[],
  plan: ExecutionPlan | undefined,
  context: OutputCollectedContext
): T[] {
  if (plan == null) return [...entries]

  const native = getNativeBinding<{
    filterPathScopedEntriesForExecutionPlan?: (
      entries: readonly T[],
      planJson: string,
      contextJson: string
    ) => readonly T[]
  }>()

  if (native?.filterPathScopedEntriesForExecutionPlan == null) return executionPlanLegacy.filterPathScopedEntriesForExecutionPlan(entries, plan, context)

  const filteredPaths = new Set(
    native.filterPathScopedEntriesForExecutionPlan(
      entries,
      JSON.stringify(plan),
      JSON.stringify(context)
    ).map(r => r.path)
  )
  return entries.filter(entry => filteredPaths.has(entry.path))
}
