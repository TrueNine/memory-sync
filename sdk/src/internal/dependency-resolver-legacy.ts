/**
 * Dependency Resolver Module (Legacy TypeScript Implementation)
 * Handles dependency graph building, validation, and topological sorting
 */
import type {DependencyNode} from '../adaptors/adaptor-core'
import {CircularDependencyError, MissingDependencyError} from '../adaptors/adaptor-core'

function findCyclePath<T extends DependencyNode>(
  nodes: readonly T[],
  inDegree: Map<string, number>
): string[] {
  const cycleNodes = new Set<string>()
  for (const [name, degree] of inDegree) {
    if (degree > 0) cycleNodes.add(name)
  }

  const deps = new Map<string, string[]>()
  for (const node of nodes) {
    if (cycleNodes.has(node.name)) {
      const nodeDeps = (node.dependsOn ?? []).filter(d => cycleNodes.has(d))
      deps.set(node.name, nodeDeps)
    }
  }

  const visited = new Set<string>()
  const path: string[] = []

  const dfs = (node: string): boolean => {
    if (path.includes(node)) {
      path.push(node)
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

  for (const node of cycleNodes) {
    if (dfs(node)) {
      const lastNode = path.at(-1)
      if (lastNode == null) return [...cycleNodes]
      const cycleStart = path.indexOf(lastNode)
      return path.slice(cycleStart)
    }
    visited.clear()
    path.length = 0
  }

  return [...cycleNodes]
}

export function topologicalSort<T extends DependencyNode>(
  nodes: readonly T[]
): T[] {
  const nodeNames = new Set(nodes.map(node => node.name))
  for (const node of nodes) {
    const deps = node.dependsOn ?? []
    for (const dep of deps) {
      if (!nodeNames.has(dep)) throw new MissingDependencyError(node.name, dep)
    }
  }

  const nodeMap = new Map<string, T>()
  for (const node of nodes) nodeMap.set(node.name, node)

  const inDegree = new Map<string, number>()
  for (const node of nodes) inDegree.set(node.name, 0)

  const dependents = new Map<string, string[]>()
  for (const node of nodes) dependents.set(node.name, [])

  for (const node of nodes) {
    const deps = node.dependsOn ?? []
    for (const dep of deps) {
      inDegree.set(node.name, (inDegree.get(node.name) ?? 0) + 1)
      const depList = dependents.get(dep) ?? []
      depList.push(node.name)
      dependents.set(dep, depList)
    }
  }

  const queue: string[] = []
  for (const node of nodes) {
    if (inDegree.get(node.name) === 0) queue.push(node.name)
  }

  const result: T[] = []
  const nodeIndexMap = new Map<string, number>()
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]
    if (node != null) nodeIndexMap.set(node.name, i)
  }

  while (queue.length > 0) {
    const current = queue.shift()
    if (current == null) continue

    const node = nodeMap.get(current)
    if (node == null) continue
    result.push(node)

    const currentDependents = dependents.get(current) ?? []
    const sortedDependents = currentDependents.sort((a, b) => {
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

  if (result.length === nodes.length) return result

  const cyclePath = findCyclePath(nodes, inDegree)
  throw new CircularDependencyError(cyclePath)
}
