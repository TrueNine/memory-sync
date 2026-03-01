/**
 * Plugin Dependency Resolver Module
 * Handles dependency graph building, validation, and topological sorting
 */

import type {Plugin, PluginKind} from '@truenine/plugin-shared'
import {CircularDependencyError, MissingDependencyError} from '@truenine/plugin-shared'

/**
 * Build dependency graph from plugins
 */
export function buildDependencyGraph<T extends PluginKind>(
  plugins: readonly Plugin<T>[]
): Map<string, string[]> {
  const graph = new Map<string, string[]>()
  for (const plugin of plugins) {
    const deps = plugin.dependsOn ?? []
    graph.set(plugin.name, [...deps])
  }
  return graph
}

/**
 * Validate that all plugin dependencies exist
 */
export function validateDependencies<T extends PluginKind>(
  plugins: readonly Plugin<T>[]
): void {
  const pluginNames = new Set(plugins.map(p => p.name))
  for (const plugin of plugins) {
    const deps = plugin.dependsOn ?? []
    for (const dep of deps) {
      if (!pluginNames.has(dep)) throw new MissingDependencyError(plugin.name, dep)
    }
  }
}

/**
 * Find cycle path in dependency graph for error reporting
 */
function findCyclePath<T extends PluginKind>(
  plugins: readonly Plugin<T>[],
  inDegree: Map<string, number>
): string[] {
  const cycleNodes = new Set<string>() // Find nodes that are part of a cycle (in-degree > 0)
  for (const [name, degree] of inDegree) {
    if (degree > 0) cycleNodes.add(name)
  }

  const deps = new Map<string, string[]>() // Build dependency map for cycle nodes
  for (const plugin of plugins) {
    if (cycleNodes.has(plugin.name)) {
      const pluginDeps = (plugin.dependsOn ?? []).filter(d => cycleNodes.has(d))
      deps.set(plugin.name, pluginDeps)
    }
  }

  const visited = new Set<string>() // DFS to find cycle path
  const path: string[] = []

  const dfs = (node: string): boolean => {
    if (path.includes(node)) {
      path.push(node) // Found cycle, add closing node to complete the cycle
      return true
    }
    if (visited.has(node)) return false

    visited.add(node)
    path.push(node)

    for (const dep of deps.get(node) ?? []) {
      if (dfs(dep)) return true
    }

    path.pop()
    return false
  }

  for (const node of cycleNodes) { // Start DFS from any cycle node
    if (dfs(node)) {
      const cycleStart = path.indexOf(path.at(-1)!) // Extract just the cycle portion
      return path.slice(cycleStart)
    }
    visited.clear()
    path.length = 0
  }

  return [...cycleNodes] // Fallback: return all cycle nodes
}

/**
 * Topologically sort plugins based on dependencies.
 * Uses Kahn's algorithm with registration order preservation.
 */
export function topologicalSort<T extends PluginKind>(
  plugins: readonly Plugin<T>[]
): Plugin<T>[] {
  validateDependencies(plugins) // Validate dependencies first

  const pluginMap = new Map<string, Plugin<T>>() // Build plugin map for quick lookup
  for (const plugin of plugins) pluginMap.set(plugin.name, plugin)

  const inDegree = new Map<string, number>() // Build in-degree map (count of incoming edges)
  for (const plugin of plugins) inDegree.set(plugin.name, 0)

  const dependents = new Map<string, string[]>() // Build adjacency list (dependents for each plugin)
  for (const plugin of plugins) dependents.set(plugin.name, [])

  for (const plugin of plugins) { // Populate in-degree and dependents
    const deps = plugin.dependsOn ?? []
    for (const dep of deps) {
      inDegree.set(plugin.name, (inDegree.get(plugin.name) ?? 0) + 1) // Increment in-degree for current plugin
      const depList = dependents.get(dep) ?? [] // Add current plugin as dependent of dep
      depList.push(plugin.name)
      dependents.set(dep, depList)
    }
  }

  const queue: string[] = [] // Use registration order for initial queue // Initialize queue with plugins that have no dependencies (in-degree = 0)
  for (const plugin of plugins) {
    if (inDegree.get(plugin.name) === 0) queue.push(plugin.name)
  }

  const result: Plugin<T>[] = [] // Process queue
  while (queue.length > 0) {
    const current = queue.shift()! // Take first element to preserve registration order
    const plugin = pluginMap.get(current)!
    result.push(plugin)

    const currentDependents = dependents.get(current) ?? [] // Process dependents in registration order
    const sortedDependents = currentDependents.sort((a, b) => { // Sort dependents by their original registration order
      const indexA = plugins.findIndex(p => p.name === a)
      const indexB = plugins.findIndex(p => p.name === b)
      return indexA - indexB
    })

    for (const dependent of sortedDependents) {
      const newDegree = (inDegree.get(dependent) ?? 0) - 1
      inDegree.set(dependent, newDegree)
      if (newDegree === 0) queue.push(dependent)
    }
  }

  if (result.length === plugins.length) return result // Check for cycle: if not all plugins are in result, there's a cycle

  const cyclePath = findCyclePath(plugins, inDegree)
  throw new CircularDependencyError(cyclePath)
}
