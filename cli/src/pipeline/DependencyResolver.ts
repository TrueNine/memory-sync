/**
 * Dependency Resolver Module
 * Handles dependency graph building, validation, and topological sorting
 */

import type {DependencyNode} from '../plugins/plugin-core'
import {CircularDependencyError, MissingDependencyError} from '../plugins/plugin-core'

/**
 * Find cycle path in dependency graph for error reporting
 */
function findCyclePath<T extends DependencyNode>(
  nodes: readonly T[],
  inDegree: Map<string, number>
): string[] {
  const cycleNodes = new Set<string>() // Find nodes that are part of a cycle (in-degree > 0)
  for (const [name, degree] of inDegree) {
    if (degree > 0) cycleNodes.add(name)
  }

  const deps = new Map<string, string[]>() // Build dependency map for cycle nodes
  for (const node of nodes) {
    if (cycleNodes.has(node.name)) {
      const nodeDeps = (node.dependsOn ?? []).filter(d => cycleNodes.has(d))
      deps.set(node.name, nodeDeps)
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
 * Topologically sort dependency nodes based on dependencies.
 * Uses Kahn's algorithm with registration order preservation.
 */
export function topologicalSort<T extends DependencyNode>(
  nodes: readonly T[]
): T[] {
  const nodeNames = new Set(nodes.map(node => node.name)) // Validate dependencies first
  for (const node of nodes) {
    const deps = node.dependsOn ?? []
    for (const dep of deps) {
      if (!nodeNames.has(dep)) throw new MissingDependencyError(node.name, dep)
    }
  }

  const nodeMap = new Map<string, T>() // Build node map for quick lookup
  for (const node of nodes) nodeMap.set(node.name, node)

  const inDegree = new Map<string, number>() // Build in-degree map (count of incoming edges)
  for (const node of nodes) inDegree.set(node.name, 0)

  const dependents = new Map<string, string[]>() // Build adjacency list (dependents for each node)
  for (const node of nodes) dependents.set(node.name, [])

  for (const node of nodes) { // Populate in-degree and dependents
    const deps = node.dependsOn ?? []
    for (const dep of deps) {
      inDegree.set(node.name, (inDegree.get(node.name) ?? 0) + 1) // Increment in-degree for current node
      const depList = dependents.get(dep) ?? [] // Add current node as dependent of dep
      depList.push(node.name)
      dependents.set(dep, depList)
    }
  }

  const queue: string[] = [] // Use registration order for initial queue // Initialize queue with nodes that have no dependencies (in-degree = 0)
  for (const node of nodes) {
    if (inDegree.get(node.name) === 0) queue.push(node.name)
  }

  const result: T[] = [] // Process queue
  const nodeIndexMap = new Map<string, number>() // Pre-compute node indices for O(1) lookup - fixes O(n²) complexity
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]
    if (node != null) nodeIndexMap.set(node.name, i)
  }

  while (queue.length > 0) {
    const current = queue.shift()! // Take first element to preserve registration order
    const node = nodeMap.get(current)!
    result.push(node)

    const currentDependents = dependents.get(current) ?? [] // Process dependents in registration order
    const sortedDependents = currentDependents.sort((a, b) => { // Sort dependents by their original registration order
      const indexA = nodeIndexMap.get(a) ?? -1
      const indexB = nodeIndexMap.get(b) ?? -1
      return indexA - indexB
    })

    for (const dependent of sortedDependents) {
      const newDegree = (inDegree.get(dependent) ?? 0) - 1
      inDegree.set(dependent, newDegree)
      if (newDegree === 0) queue.push(dependent)
    }
  }

  if (result.length === nodes.length) return result // Check for cycle: if not all nodes are in result, there's a cycle

  const cyclePath = findCyclePath(nodes, inDegree)
  throw new CircularDependencyError(cyclePath)
}
