import type {InputCollectedContext} from '../adaptors/adaptor-core'
import {getNativeBinding} from '@/core/native-binding'

interface NativeContextMergerBinding {
  mergeContexts?: (base: InputCollectedContext, addition: InputCollectedContext) => InputCollectedContext
  buildDependencyContext?: (deps: string[], outputsByPluginJson: string) => InputCollectedContext
}

export function mergeContexts(base: Partial<InputCollectedContext>, addition: Partial<InputCollectedContext>): Partial<InputCollectedContext> {
  const binding = getNativeBinding<NativeContextMergerBinding>()
  if (binding?.mergeContexts != null) {
    try {
      return binding.mergeContexts(base as InputCollectedContext, addition as InputCollectedContext) as Partial<InputCollectedContext>
    } catch {
      // fall through
    }
  }
  return mergeContextsFallback(base, addition)
}

function mergeArrays<T>(base: readonly T[] | undefined, addition: readonly T[] | undefined): readonly T[] {
  if (addition == null) return base ?? []
  if (base == null) return addition
  return [...base, ...addition]
}

function buildProjectMergeKey(project: {name?: string, projectType?: string, isWorkspaceRootProject?: boolean}): string {
  if (project.isWorkspaceRootProject === true) return `workspace-root:${project.name ?? ''}`
  const projectType = project.projectType ?? 'workspace'
  return `${projectType}:${project.name ?? ''}`
}

function mergeWorkspaceProjects(
  base: {directory: string, projects: {name?: string, projectType?: string, isWorkspaceRootProject?: boolean}[]},
  addition: {directory: string, projects: {name?: string, projectType?: string, isWorkspaceRootProject?: boolean}[]}
): {directory: string, projects: {name?: string, projectType?: string, isWorkspaceRootProject?: boolean}[]} {
  const projectMap = new Map<string, (typeof base.projects)[0]>()
  for (const project of base.projects) projectMap.set(buildProjectMergeKey(project), project)
  for (const project of addition.projects) {
    projectMap.set(buildProjectMergeKey(project), project)
  }
  return {
    directory: addition.directory ?? base.directory,
    projects: [...projectMap.values()]
  }
}

function mergeContextsFallback(base: Partial<InputCollectedContext>, addition: Partial<InputCollectedContext>): Partial<InputCollectedContext> {
  const result: Partial<InputCollectedContext> = {}

  if (addition.workspace != null || base.workspace != null) {
    if (addition.workspace == null) {
      (result as Record<string, unknown>)['workspace'] = base.workspace
    } else if (base.workspace == null) {
      (result as Record<string, unknown>)['workspace'] = addition.workspace
    } else {
      (result as Record<string, unknown>)['workspace'] = mergeWorkspaceProjects(
        base.workspace as unknown as {directory: string, projects: {name?: string, projectType?: string, isWorkspaceRootProject?: boolean}[]},
        addition.workspace as unknown as {directory: string, projects: {name?: string, projectType?: string, isWorkspaceRootProject?: boolean}[]}
      )
    }
  }

  const concatFields: (keyof InputCollectedContext)[] = [
    'vscodeConfigFiles',
    'zedConfigFiles',
    'jetbrainsConfigFiles',
    'editorConfigFiles',
    'commands',
    'subAgents',
    'skills',
    'rules',
    'readmePrompts',
    'aiAgentIgnoreConfigFiles'
  ]

  for (const field of concatFields) {
    const merged = mergeArrays(base[field] as unknown as readonly unknown[] | undefined, addition[field] as unknown as readonly unknown[] | undefined)
    if (merged.length > 0) {
      (result as Record<string, unknown>)[field] = merged
    }
  }

  const overrideFields: (keyof InputCollectedContext)[] = ['globalMemory', 'aindexDir', 'globalGitIgnore', 'shadowGitExclude']

  for (const field of overrideFields) {
    const merged = (addition[field] ?? base[field]) as unknown
    if (merged != null) {
      (result as Record<string, unknown>)[field] = merged
    }
  }

  return result
}

export function buildDependencyContext(
  plugin: {dependsOn?: readonly string[]},
  outputsByPlugin: Map<string, Partial<InputCollectedContext>>,
  mergeFn?: (base: Partial<InputCollectedContext>, addition: Partial<InputCollectedContext>) => Partial<InputCollectedContext>
): Partial<InputCollectedContext> {
  const binding = getNativeBinding<NativeContextMergerBinding>()
  if (binding?.buildDependencyContext != null) {
    try {
      const outputs: Record<string, InputCollectedContext> = {}
      for (const [key, value] of outputsByPlugin) {
        outputs[key] = value as InputCollectedContext
      }
      return binding.buildDependencyContext([...plugin.dependsOn ?? []], JSON.stringify(outputs)) as Partial<InputCollectedContext>
    } catch {
      // fall through
    }
  }

  const deps = plugin.dependsOn ?? []
  if (deps.length === 0) return {}

  const visited = new Set<string>()
  let merged: Partial<InputCollectedContext> = {}
  const merger = mergeFn ?? mergeContextsFallback
  for (const depName of deps) {
    if (visited.has(depName)) continue
    visited.add(depName)
    const depOutput = outputsByPlugin.get(depName)
    if (depOutput != null) merged = merger(merged, depOutput)
  }

  return merged
}
