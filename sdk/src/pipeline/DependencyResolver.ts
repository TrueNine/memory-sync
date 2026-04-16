import type {DependencyNode} from '../adaptors/adaptor-core'
import {getNativeBinding} from '@/core/native-binding'
import {CircularDependencyError, MissingDependencyError} from '../adaptors/adaptor-core'

interface NativeDependencyResolverBinding {
  topologicalSortNodes?: (nodes: {name: string, dependsOn?: readonly string[]}[]) => string[]
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

function mapSortedNamesToNodes<T extends DependencyNode>(
  sortedNames: unknown,
  nodes: readonly T[]
): T[] {
  if (!Array.isArray(sortedNames)) {
    throw new TypeError('Native topologicalSort returned an invalid result')
  }

  const nodeMap = new Map<string, T>()
  for (const node of nodes) {
    nodeMap.set(node.name, node)
  }

  const mapped: T[] = []
  for (const name of sortedNames) {
    if (typeof name !== 'string') {
      throw new TypeError('Native topologicalSort returned a non-string node name')
    }
    const node = nodeMap.get(name)
    if (node == null) {
      throw new Error(`Native topologicalSort returned unknown node name: ${name}`)
    }
    mapped.push(node)
  }

  if (mapped.length !== nodes.length) {
    throw new Error('Native topologicalSort result length mismatch')
  }

  return mapped
}

export function topologicalSort<T extends DependencyNode>(nodes: readonly T[]): T[] {
  const binding = getNativeBinding<NativeDependencyResolverBinding>()

  if (binding?.topologicalSortNodes != null) {
    try {
      const input = nodes.map(n => ({
        name: n.name,
        dependsOn: n.dependsOn ?? ([] as readonly string[])
      }))
      const sortedNames = binding.topologicalSortNodes(input)
      return mapSortedNamesToNodes(sortedNames, nodes)
    } catch (error) {
      const nativeError = error instanceof Error ? rehydrateNativeError(error.message) : void 0
      if (nativeError != null) {
        throw nativeError
      }
      throw error
    }
  }

  if (binding?.topologicalSort != null) {
    try {
      const input = nodes.map(n => ({
        name: n.name,
        dependsOn: n.dependsOn ?? ([] as readonly string[])
      }))
      const resultJson = binding.topologicalSort(JSON.stringify(input))
      const sortedNames: unknown = JSON.parse(resultJson)
      return mapSortedNamesToNodes(sortedNames, nodes)
    } catch (error) {
      const nativeError = error instanceof Error ? rehydrateNativeError(error.message) : void 0
      if (nativeError != null) {
        throw nativeError
      }
      throw error
    }
  }

  throw new Error('Native dependency-resolver binding is unavailable. Build or install the Rust NAPI package before running tnmsc.')
}
