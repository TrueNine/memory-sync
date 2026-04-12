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

type ScopedTargetOwnership = 'global' | 'workspace' | 'project' | 'external'

const EMPTY_PROJECTS_BY_SERIES: ExecutionPlanProjectsByType = Object.freeze({
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
    ...project.projectType != null ? {projectType: project.projectType} : {}
  }
}

function sortProjects(
  projects: readonly ExecutionPlanProjectSummary[]
): readonly ExecutionPlanProjectSummary[] {
  return [...projects].sort((left, right) => {
    const leftType = left.projectType ?? ''
    const rightType = right.projectType ?? ''
    if (leftType !== rightType)
    { return leftType.localeCompare(rightType) }
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

function groupProjectsByType(
  projects: readonly ExecutionPlanProjectSummary[]
): ExecutionPlanProjectsByType {
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
    if (project.projectType == null) continue
    grouped[project.projectType].push(project)
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

export function createEmptyExecutionPlanProjectsByType(): ExecutionPlanProjectsByType {
  return EMPTY_PROJECTS_BY_SERIES
}

export function resolveExecutionPlan(
  context: OutputCollectedContext,
  executionCwd: string
): ExecutionPlan {
  const cwd = normalizeAbsolutePath(executionCwd)
  const workspaceDir = normalizeAbsolutePath(context.workspace.directory.path)
  const managedProjects = collectManagedProjects(context)
  const projectsByType
    = managedProjects.length === 0
      ? createEmptyExecutionPlanProjectsByType()
      : groupProjectsByType(managedProjects)

  if (cwd === workspaceDir) {
    return {
      scope: 'workspace',
      cwd,
      workspaceDir,
      projectsByType
    }
  }

  const matchedProject = findMatchedProject(cwd, managedProjects)
  if (matchedProject != null) {
    return {
      scope: 'project',
      cwd,
      workspaceDir,
      projectsByType,
      matchedProject
    }
  }

  if (isSameOrChildPath(cwd, workspaceDir)) {
    return {
      scope: 'unsupported',
      cwd,
      workspaceDir,
      projectsByType,
      managedProjects
    }
  }

  return {
    scope: 'external',
    cwd,
    workspaceDir,
    projectsByType
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
