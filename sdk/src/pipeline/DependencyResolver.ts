/**
 * Dependency Resolver Module
 * Thin wrapper over native binding with legacy fallback
 */
import type {DependencyNode} from '../adaptors/adaptor-core'
import {getNativeBinding} from '@/core/native-binding'
import {CircularDependencyError, MissingDependencyError} from '../adaptors/adaptor-core'
import {topologicalSort as topologicalSortLegacy} from '../internal/dependency-resolver-legacy'

interface NativeDependencyResolverBinding {
  topologicalSort?: (inputJson: string) => string
}

interface NativeErrorPayload {
  kind: 'missingDependency' | 'circularDependency'
  nodeName?: string
  missingDependency?: string
  cyclePath?: string[]
}

function rehydrateNativeError(message: string): Error | undefined {
  if (typeof message !== 'string' || !message.startsWith('{')) return void 0
  try {
    const parsed = JSON.parse(message) as NativeErrorPayload
    if (parsed.kind === 'missingDependency' && parsed.nodeName != null && parsed.missingDependency != null) {
      return new MissingDependencyError(parsed.nodeName, parsed.missingDependency)
    }
    if (parsed.kind === 'circularDependency' && Array.isArray(parsed.cyclePath)) {
      return new CircularDependencyError(parsed.cyclePath)
    }
  } catch {
    // ignore parse errors
  }
  return void 0
}

/**
 * Topologically sort dependency nodes based on dependencies.
 * Uses Kahn's algorithm with registration order preservation.
 * Falls back to the legacy TypeScript implementation when the native
 * binding is unavailable or when mocked / non-serializable inputs are used.
 */
export function topologicalSort<T extends DependencyNode>(
  nodes: readonly T[]
): T[] {
  const binding = getNativeBinding<NativeDependencyResolverBinding>()
  if (binding?.topologicalSort != null) {
    try {
      const input = nodes.map(n => ({
        name: n.name,
        dependsOn: n.dependsOn ?? ([] as readonly string[])
      }))
      const resultJson = binding.topologicalSort(JSON.stringify(input))
      const sortedNames: unknown = JSON.parse(resultJson)
      if (!Array.isArray(sortedNames)) {
        return topologicalSortLegacy(nodes)
      }
      const nodeMap = new Map<string, T>()
      for (const node of nodes) {
        nodeMap.set(node.name, node)
      }
      const mapped: T[] = []
      for (const name of sortedNames) {
        if (typeof name !== 'string') {
          return topologicalSortLegacy(nodes)
        }
        const node = nodeMap.get(name)
        if (node == null) {
          return topologicalSortLegacy(nodes)
        }
        mapped.push(node)
      }
      if (mapped.length !== nodes.length) {
        return topologicalSortLegacy(nodes)
      }
      return mapped
    } catch (error) {
      const nativeError = error instanceof Error ? rehydrateNativeError(error.message) : void 0
      if (nativeError != null) {
        throw nativeError
      }
      return topologicalSortLegacy(nodes)
    }
  }
  return topologicalSortLegacy(nodes)
}
