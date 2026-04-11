import type {AindexProjectSeriesName} from './adaptors/adaptor-core/AindexConfigDefaults'
import type {
  OutputCollectedContext,
  Project
} from './adaptors/adaptor-core/InputTypes'
import * as path from 'node:path'

export type ExecutionScope
  = | 'workspace'
    | 'project'
    | 'external'
    | 'unsupported'

export interface ExecutionPlanProjectSummary {
  readonly name: string
  readonly rootDir: string
  readonly series?: AindexProjectSeriesName
}

export interface ExecutionPlanProjectsBySeries {
  readonly app: readonly ExecutionPlanProjectSummary[]
  readonly ext: readonly ExecutionPlanProjectSummary[]
  readonly arch: readonly ExecutionPlanProjectSummary[]
  readonly softwares: readonly ExecutionPlanProjectSummary[]
}

interface ExecutionPlanBase {
  readonly cwd: string
  readonly workspaceDir: string
  readonly projectsBySeries: ExecutionPlanProjectsBySeries
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

type ScopedTargetOwnership = 'global' | 'workspace' | 'project' | 'external'

const EMPTY_PROJECTS_BY_SERIES: ExecutionPlanProjectsBySeries = Object.freeze({
  app: Object.freeze([]),
  ext: Object.freeze([]),
  arch: Object.freeze([]),
  softwares: Object.freeze([])
})

function normalizeAbsolutePath(rawPath: string): string {
  return path.resolve(rawPath)
}

function isSameOrChildPath(candidatePath: string, parentPath: string): boolean {
  const normalizedCandidate = normalizeAbsolutePath(candidatePath)
  const normalizedParent = normalizeAbsolutePath(parentPath)
  if (normalizedCandidate === normalizedParent) return true
  const relativePath = path.relative(normalizedParent, normalizedCandidate)
  return (
    relativePath.length > 0
    && relativePath !== '..'
    && !relativePath.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relativePath)
  )
}

function toManagedProjectSummary(
  project: Project
): ExecutionPlanProjectSummary | undefined {
  if (project.isWorkspaceRootProject === true) return void 0
  const projectName = project.name
  const projectRootDir = project.dirFromWorkspacePath?.getAbsolutePath()
  if (projectName == null || projectRootDir == null) return void 0

  return {
    name: projectName,
    rootDir: normalizeAbsolutePath(projectRootDir),
    ...project.promptSeries != null ? {series: project.promptSeries} : {}
  }
}

function sortProjects(
  projects: readonly ExecutionPlanProjectSummary[]
): readonly ExecutionPlanProjectSummary[] {
  return [...projects].sort((left, right) => {
    const leftSeries = left.series ?? ''
    const rightSeries = right.series ?? ''
    if (leftSeries !== rightSeries)
    { return leftSeries.localeCompare(rightSeries) }
    return left.name.localeCompare(right.name)
  })
}

function collectManagedProjects(
  context: OutputCollectedContext
): readonly ExecutionPlanProjectSummary[] {
  return sortProjects(
    context.workspace.projects
      .map(toManagedProjectSummary)
      .filter(
        (project): project is ExecutionPlanProjectSummary => project != null
      )
  )
}

function groupProjectsBySeries(
  projects: readonly ExecutionPlanProjectSummary[]
): ExecutionPlanProjectsBySeries {
  const grouped: Record<
    AindexProjectSeriesName,
    ExecutionPlanProjectSummary[]
  > = {
    app: [],
    ext: [],
    arch: [],
    softwares: []
  }

  for (const project of projects) {
    if (project.series == null) continue
    grouped[project.series].push(project)
  }

  return {
    app: Object.freeze([...grouped.app]),
    ext: Object.freeze([...grouped.ext]),
    arch: Object.freeze([...grouped.arch]),
    softwares: Object.freeze([...grouped.softwares])
  }
}

function findMatchedProject(
  cwd: string,
  managedProjects: readonly ExecutionPlanProjectSummary[]
): ExecutionPlanProjectSummary | undefined {
  const matches = managedProjects.filter(project =>
    isSameOrChildPath(cwd, project.rootDir))
  if (matches.length === 0) return void 0

  return [...matches].sort(
    (left, right) => right.rootDir.length - left.rootDir.length
  )[0]
}

export function createEmptyExecutionPlanProjectsBySeries(): ExecutionPlanProjectsBySeries {
  return EMPTY_PROJECTS_BY_SERIES
}

export function resolveExecutionPlan(
  context: OutputCollectedContext,
  executionCwd: string
): ExecutionPlan {
  const cwd = normalizeAbsolutePath(executionCwd)
  const workspaceDir = normalizeAbsolutePath(context.workspace.directory.path)
  const managedProjects = collectManagedProjects(context)
  const projectsBySeries
    = managedProjects.length === 0
      ? createEmptyExecutionPlanProjectsBySeries()
      : groupProjectsBySeries(managedProjects)

  if (cwd === workspaceDir) {
    return {
      scope: 'workspace',
      cwd,
      workspaceDir,
      projectsBySeries
    }
  }

  const matchedProject = findMatchedProject(cwd, managedProjects)
  if (matchedProject != null) {
    return {
      scope: 'project',
      cwd,
      workspaceDir,
      projectsBySeries,
      matchedProject
    }
  }

  if (isSameOrChildPath(cwd, workspaceDir)) {
    return {
      scope: 'unsupported',
      cwd,
      workspaceDir,
      projectsBySeries,
      managedProjects
    }
  }

  return {
    scope: 'external',
    cwd,
    workspaceDir,
    projectsBySeries
  }
}

function isGlobalScopedEntry(scope: string | undefined): boolean {
  return scope === 'global' || scope === 'xdgConfig'
}

function classifyPathScopedEntry(
  entry: PathScopedEntry,
  workspaceDir: string,
  managedProjects: readonly ExecutionPlanProjectSummary[]
): ScopedTargetOwnership {
  if (isGlobalScopedEntry(entry.scope)) return 'global'

  const entryPath = normalizeAbsolutePath(entry.path)
  const ownerProject = findMatchedProject(entryPath, managedProjects)
  if (ownerProject != null) return 'project'
  if (isSameOrChildPath(entryPath, workspaceDir)) return 'workspace'
  return 'external'
}

function shouldIncludeTargetOwnership(
  plan: ExecutionPlan,
  ownership: ScopedTargetOwnership,
  entryPath: string,
  managedProjects: readonly ExecutionPlanProjectSummary[]
): boolean {
  if (plan.scope === 'unsupported') return false
  if (ownership === 'global') return true
  if (plan.scope === 'external') return true
  if (plan.scope === 'workspace') return ownership === 'workspace'
  if (ownership !== 'project') return false

  const matchedProject = findMatchedProject(entryPath, managedProjects)
  return matchedProject?.rootDir === plan.matchedProject.rootDir
}

export function filterPathScopedEntriesForExecutionPlan<
  T extends PathScopedEntry
>(
  entries: readonly T[],
  plan: ExecutionPlan | undefined,
  context: OutputCollectedContext
): T[] {
  if (plan == null) return [...entries]

  const workspaceDir = normalizeAbsolutePath(context.workspace.directory.path)
  const managedProjects = collectManagedProjects(context)

  return entries.filter(entry =>
    shouldIncludeTargetOwnership(
      plan,
      classifyPathScopedEntry(entry, workspaceDir, managedProjects),
      entry.path,
      managedProjects
    ))
}
