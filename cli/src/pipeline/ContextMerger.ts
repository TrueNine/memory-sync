/**
 * Context Merger Module
 * Handles merging of partial CollectedInputContext objects
 */

import type {CollectedInputContext, Workspace} from '@truenine/plugin-shared'

/**
 * Merge strategy types for context fields
 */
type MergeStrategy = 'concat' | 'override' | 'mergeProjects'

/**
 * Field merge configuration
 */
interface FieldConfig<T> {
  readonly strategy: MergeStrategy
  readonly getter: (ctx: Partial<CollectedInputContext>) => T | undefined
}

/**
 * Merge configuration for all CollectedInputContext fields
 */
const FIELD_CONFIGS: Record<string, FieldConfig<unknown>> = {
  workspace: {
    strategy: 'mergeProjects',
    getter: ctx => ctx.workspace
  },
  vscodeConfigFiles: {
    strategy: 'concat',
    getter: ctx => ctx.vscodeConfigFiles
  },
  jetbrainsConfigFiles: {
    strategy: 'concat',
    getter: ctx => ctx.jetbrainsConfigFiles
  },
  editorConfigFiles: {
    strategy: 'concat',
    getter: ctx => ctx.editorConfigFiles
  },
  commands: {
    strategy: 'concat',
    getter: ctx => ctx.commands
  },
  subAgents: {
    strategy: 'concat',
    getter: ctx => ctx.subAgents
  },
  skills: {
    strategy: 'concat',
    getter: ctx => ctx.skills
  },
  rules: {
    strategy: 'concat',
    getter: ctx => ctx.rules
  },
  aiAgentIgnoreConfigFiles: {
    strategy: 'concat',
    getter: ctx => ctx.aiAgentIgnoreConfigFiles
  },
  readmePrompts: {
    strategy: 'concat',
    getter: ctx => ctx.readmePrompts
  },
  globalMemory: { // Override fields (last one wins)
    strategy: 'override',
    getter: ctx => ctx.globalMemory
  },
  shadowSourceProjectDir: {
    strategy: 'override',
    getter: ctx => ctx.shadowSourceProjectDir
  },
  globalGitIgnore: {
    strategy: 'override',
    getter: ctx => ctx.globalGitIgnore
  },
  shadowGitExclude: {
    strategy: 'override',
    getter: ctx => ctx.shadowGitExclude
  }
} as const

/**
 * Merge two arrays by concatenating them
 */
function mergeArrays<T>(base: readonly T[] | undefined, addition: readonly T[] | undefined): readonly T[] {
  if (addition == null) return base ?? []
  if (base == null) return addition
  return [...base, ...addition]
}

/**
 * Merge workspace projects. Later projects with the same name replace earlier ones.
 */
function mergeWorkspaceProjects(base: Workspace, addition: Workspace): Workspace {
  const projectMap = new Map<string | undefined, typeof base.projects[0]>()
  for (const project of base.projects) projectMap.set(project.name, project)
  for (const project of addition.projects) projectMap.set(project.name, project)
  return {
    directory: addition.directory ?? base.directory,
    projects: [...projectMap.values()]
  }
}

/**
 * Merge workspace fields
 */
function mergeWorkspace(base: Workspace | undefined, addition: Workspace | undefined): Workspace | undefined {
  if (addition == null) return base
  if (base == null) return addition
  return mergeWorkspaceProjects(base, addition)
}

/**
 * Merge a single field based on its strategy
 */
function mergeField<T>(
  base: T | undefined,
  addition: T | undefined,
  strategy: MergeStrategy
): T | undefined {
  switch (strategy) {
    case 'concat': return mergeArrays(base as unknown[], addition as unknown[]) as unknown as T
    case 'override': return addition ?? base
    case 'mergeProjects': return mergeWorkspace(base as unknown as Workspace, addition as unknown as Workspace) as unknown as T
    default: return addition ?? base
  }
}

/**
 * Build merge result object from merged fields
 */
function buildMergeResult(
  mergedFields: Map<string, unknown>
): Partial<CollectedInputContext> {
  const result: Record<string, unknown> = {}

  for (const [key, value] of mergedFields) {
    if (value != null) result[key] = value
  }

  return result as Partial<CollectedInputContext>
}

/**
 * Merge two partial CollectedInputContext objects
 * Uses configuration-driven approach to reduce code duplication
 */
export function mergeContexts(
  base: Partial<CollectedInputContext>,
  addition: Partial<CollectedInputContext>
): Partial<CollectedInputContext> {
  const mergedFields = new Map<string, unknown>()

  for (const [fieldName, config] of Object.entries(FIELD_CONFIGS)) { // Process each configured field
    const baseValue = config.getter(base)
    const additionValue = config.getter(addition)
    const mergedValue = mergeField(baseValue, additionValue, config.strategy)
    mergedFields.set(fieldName, mergedValue)
  }

  return buildMergeResult(mergedFields)
}

/**
 * Legacy merge function for backwards compatibility
 * Uses the optimized configuration-driven approach
 */
export function mergeContextsLegacy(
  base: Partial<CollectedInputContext>,
  addition: Partial<CollectedInputContext>
): Partial<CollectedInputContext> {
  return mergeContexts(base, addition)
}

/**
 * Build dependency context from plugin outputs
 */
export function buildDependencyContext(
  plugin: {dependsOn?: readonly string[]},
  outputsByPlugin: Map<string, Partial<CollectedInputContext>>,
  mergeFn: (base: Partial<CollectedInputContext>, addition: Partial<CollectedInputContext>) => Partial<CollectedInputContext>
): Partial<CollectedInputContext> {
  const deps = plugin.dependsOn ?? []
  if (deps.length === 0) return {}

  const allDeps = collectTransitiveDependencies(plugin, outputsByPlugin)

  let merged: Partial<CollectedInputContext> = {}
  for (const depName of allDeps) {
    const depOutput = outputsByPlugin.get(depName)
    if (depOutput != null) merged = mergeFn(merged, depOutput)
  }

  return merged
}

/**
 * Collect transitive dependencies for a plugin
 */
function collectTransitiveDependencies(
  plugin: {dependsOn?: readonly string[]},
  outputsByPlugin: Map<string, Partial<CollectedInputContext>>
): string[] {
  const visited = new Set<string>()
  const result: string[] = []

  const visit = (deps: readonly string[]): void => {
    for (const dep of deps) {
      if (visited.has(dep)) continue
      visited.add(dep)

      const depOutput = outputsByPlugin.get(dep)
      if (depOutput != null) result.push(dep)
    }
  }

  visit(plugin.dependsOn ?? [])
  return result
}

/**
 * Collect transitive dependencies for a plugin with full dependency resolution
 */
export function collectTransitiveDependenciesFull(
  plugin: {dependsOn?: readonly string[]},
  _outputsByPlugin: Map<string, Partial<CollectedInputContext>>,
  pluginRegistry: Map<string, {dependsOn?: readonly string[]}>
): string[] {
  const visited = new Set<string>()
  const result: string[] = []

  const visit = (deps: readonly string[]): void => {
    for (const dep of deps) {
      if (visited.has(dep)) continue
      visited.add(dep)

      result.push(dep)

      const depPlugin = pluginRegistry.get(dep) // Recursively visit dependencies of this dependency
      if (depPlugin != null) visit(depPlugin.dependsOn ?? [])
    }
  }

  visit(plugin.dependsOn ?? [])
  return result
}

/**
 * Build dependency context with full transitive dependency resolution
 */
export function buildDependencyContextFull(
  plugin: {name: string, dependsOn?: readonly string[]},
  outputsByPlugin: Map<string, Partial<CollectedInputContext>>,
  pluginRegistry: Map<string, {dependsOn?: readonly string[]}>,
  mergeFn: (base: Partial<CollectedInputContext>, addition: Partial<CollectedInputContext>) => Partial<CollectedInputContext>
): Partial<CollectedInputContext> {
  const deps = plugin.dependsOn ?? []
  if (deps.length === 0) return {}

  const allDeps = collectTransitiveDependenciesFull(plugin, outputsByPlugin, pluginRegistry)

  let merged: Partial<CollectedInputContext> = {}
  for (const depName of allDeps) {
    const depOutput = outputsByPlugin.get(depName)
    if (depOutput != null) merged = mergeFn(merged, depOutput)
  }

  return merged
}
