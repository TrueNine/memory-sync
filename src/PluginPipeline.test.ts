import type { CollectedInputContext, InputPlugin, InputPluginContext, Plugin } from '@/types'
import fs from 'node:fs'
import path from 'node:path'
import glob from 'fast-glob'
import { describe, expect, it } from 'vitest'
import { createLogger } from '@/log'
import { PluginPipeline } from '@/PluginPipeline'
import { CircularDependencyError, FilePathKind, MissingDependencyError, PluginKind, PromptKind } from '@/types'

function createMockPlugin(name: string, dependsOn?: readonly string[]): Plugin {
  const base = {
    type: PluginKind.Input,
    name,
    log: {} as Plugin['log'],
  }
  if (dependsOn) {
    return { ...base, dependsOn }
  }
  return base
}

function createMockInputPlugin(
  name: string,
  collectFn: (ctx: InputPluginContext) => Partial<CollectedInputContext>,
  dependsOn?: readonly string[],
): InputPlugin {
  const base = {
    type: PluginKind.Input as const,
    name,
    log: createLogger(name),
    collect: collectFn,
  }
  if (dependsOn) {
    return { ...base, dependsOn }
  }
  return base
}

function createBaseContext(): Omit<InputPluginContext, 'dependencyContext'> {
  return {
    logger: createLogger('test'),
    fs,
    path,
    glob,
    userConfigOptions: {},
  }
}

function createMockPath(pathStr: string): CollectedInputContext['workspace']['directory'] {
  return {
    pathKind: FilePathKind.Absolute,
    path: pathStr,
    getDirectoryName: () => pathStr.split('/').pop() ?? '',
  } as CollectedInputContext['workspace']['directory']
}

describe('pluginPipeline', () => {
  describe('buildDependencyGraph', () => {
    it('should return empty graph for empty plugins array', () => {
      const pipeline = new PluginPipeline()
      const graph = pipeline.buildDependencyGraph([])
      expect(graph.size).toBe(0)
    })

    it('should build graph for plugins without dependencies', () => {
      const pipeline = new PluginPipeline()
      const plugins = [
        createMockPlugin('A'),
        createMockPlugin('B'),
      ]
      const graph = pipeline.buildDependencyGraph(plugins)

      expect(graph.size).toBe(2)
      expect(graph.get('A')).toEqual([])
      expect(graph.get('B')).toEqual([])
    })

    it('should build graph for plugins with dependencies', () => {
      const pipeline = new PluginPipeline()
      const plugins = [
        createMockPlugin('A', ['B', 'C']),
        createMockPlugin('B', ['C']),
        createMockPlugin('C'),
      ]
      const graph = pipeline.buildDependencyGraph(plugins)

      expect(graph.size).toBe(3)
      expect(graph.get('A')).toEqual(['B', 'C'])
      expect(graph.get('B')).toEqual(['C'])
      expect(graph.get('C')).toEqual([])
    })
  })

  describe('validateDependencies', () => {
    it('should pass for plugins without dependencies', () => {
      const pipeline = new PluginPipeline()
      const plugins = [
        createMockPlugin('A'),
        createMockPlugin('B'),
      ]
      expect(() => pipeline.validateDependencies(plugins)).not.toThrow()
    })

    it('should pass for valid dependencies', () => {
      const pipeline = new PluginPipeline()
      const plugins = [
        createMockPlugin('A', ['B']),
        createMockPlugin('B', ['C']),
        createMockPlugin('C'),
      ]
      expect(() => pipeline.validateDependencies(plugins)).not.toThrow()
    })

    it('should throw MissingDependencyError for non-existent dependency', () => {
      const pipeline = new PluginPipeline()
      const plugins = [
        createMockPlugin('A', ['NonExistent']),
        createMockPlugin('B'),
      ]

      expect(() => pipeline.validateDependencies(plugins)).toThrow(MissingDependencyError)
      try {
        pipeline.validateDependencies(plugins)
      } catch (e) {
        expect(e).toBeInstanceOf(MissingDependencyError)
        const error = e as MissingDependencyError
        expect(error.pluginName).toBe('A')
        expect(error.missingDependency).toBe('NonExistent')
      }
    })

    it('should throw for first missing dependency found', () => {
      const pipeline = new PluginPipeline()
      const plugins = [
        createMockPlugin('A', ['Missing1', 'Missing2']),
      ]

      expect(() => pipeline.validateDependencies(plugins)).toThrow(MissingDependencyError)
    })
  })

  describe('topologicalSort', () => {
    it('should return empty array for empty plugins array', () => {
      const pipeline = new PluginPipeline()
      const result = pipeline.topologicalSort([])
      expect(result).toEqual([])
    })

    it('should return single plugin for single plugin array', () => {
      const pipeline = new PluginPipeline()
      const plugins = [createMockPlugin('A')]
      const result = pipeline.topologicalSort(plugins)
      expect(result.map((p) => p.name)).toEqual(['A'])
    })

    it('should preserve registration order for plugins without dependencies', () => {
      const pipeline = new PluginPipeline()
      const plugins = [
        createMockPlugin('A'),
        createMockPlugin('B'),
        createMockPlugin('C'),
      ]
      const result = pipeline.topologicalSort(plugins)
      expect(result.map((p) => p.name)).toEqual(['A', 'B', 'C'])
    })

    it('should sort plugins with linear dependency chain', () => {
      const pipeline = new PluginPipeline()
      // A depends on B, B depends on C
      const plugins = [
        createMockPlugin('A', ['B']),
        createMockPlugin('B', ['C']),
        createMockPlugin('C'),
      ]
      const result = pipeline.topologicalSort(plugins)
      const names = result.map((p) => p.name)

      // C must come before B, B must come before A
      expect(names.indexOf('C')).toBeLessThan(names.indexOf('B'))
      expect(names.indexOf('B')).toBeLessThan(names.indexOf('A'))
    })

    it('should handle diamond dependency pattern', () => {
      const pipeline = new PluginPipeline()
      // A depends on B and C, both B and C depend on D
      const plugins = [
        createMockPlugin('A', ['B', 'C']),
        createMockPlugin('B', ['D']),
        createMockPlugin('C', ['D']),
        createMockPlugin('D'),
      ]
      const result = pipeline.topologicalSort(plugins)
      const names = result.map((p) => p.name)

      // D must come before B and C, B and C must come before A
      expect(names.indexOf('D')).toBeLessThan(names.indexOf('B'))
      expect(names.indexOf('D')).toBeLessThan(names.indexOf('C'))
      expect(names.indexOf('B')).toBeLessThan(names.indexOf('A'))
      expect(names.indexOf('C')).toBeLessThan(names.indexOf('A'))
    })

    it('should preserve registration order for independent plugins', () => {
      const pipeline = new PluginPipeline()
      // D has no deps, A depends on B, C has no deps
      const plugins = [
        createMockPlugin('D'),
        createMockPlugin('A', ['B']),
        createMockPlugin('B'),
        createMockPlugin('C'),
      ]
      const result = pipeline.topologicalSort(plugins)
      const names = result.map((p) => p.name)

      // B must come before A
      expect(names.indexOf('B')).toBeLessThan(names.indexOf('A'))
      // D should come before C (registration order for independent plugins)
      expect(names.indexOf('D')).toBeLessThan(names.indexOf('C'))
    })

    it('should throw CircularDependencyError for simple cycle', () => {
      const pipeline = new PluginPipeline()
      // A depends on B, B depends on A
      const plugins = [
        createMockPlugin('A', ['B']),
        createMockPlugin('B', ['A']),
      ]

      expect(() => pipeline.topologicalSort(plugins)).toThrow(CircularDependencyError)
    })

    it('should throw CircularDependencyError for longer cycle', () => {
      const pipeline = new PluginPipeline()
      // A -> B -> C -> A
      const plugins = [
        createMockPlugin('A', ['B']),
        createMockPlugin('B', ['C']),
        createMockPlugin('C', ['A']),
      ]

      expect(() => pipeline.topologicalSort(plugins)).toThrow(CircularDependencyError)
    })

    it('should include cycle path in CircularDependencyError', () => {
      const pipeline = new PluginPipeline()
      const plugins = [
        createMockPlugin('A', ['B']),
        createMockPlugin('B', ['A']),
      ]

      try {
        pipeline.topologicalSort(plugins)
        expect.fail('Should have thrown CircularDependencyError')
      } catch (e) {
        expect(e).toBeInstanceOf(CircularDependencyError)
        const error = e as CircularDependencyError
        // Cycle should contain both A and B
        expect(error.cycle).toContain('A')
        expect(error.cycle).toContain('B')
      }
    })

    it('should throw MissingDependencyError for non-existent dependency', () => {
      const pipeline = new PluginPipeline()
      const plugins = [
        createMockPlugin('A', ['NonExistent']),
      ]

      expect(() => pipeline.topologicalSort(plugins)).toThrow(MissingDependencyError)
    })

    it('should handle self-dependency as cycle', () => {
      const pipeline = new PluginPipeline()
      const plugins = [
        createMockPlugin('A', ['A']),
      ]

      expect(() => pipeline.topologicalSort(plugins)).toThrow(CircularDependencyError)
    })
  })

  describe('executePluginsInOrder', () => {
    it('should return empty object for empty plugins array', () => {
      const pipeline = new PluginPipeline()
      const result = pipeline.executePluginsInOrder([], createBaseContext())
      expect(result).toEqual({})
    })

    it('should execute single plugin and return its output', () => {
      const pipeline = new PluginPipeline()
      const plugins = [
        createMockInputPlugin('A', () => ({
          workspace: { directory: createMockPath('/test'), projects: [] },
        })),
      ]

      const result = pipeline.executePluginsInOrder(plugins, createBaseContext())
      expect(result.workspace?.directory.path).toBe('/test')
    })

    it('should execute plugins in dependency order', () => {
      const pipeline = new PluginPipeline()
      const executionOrder: string[] = []

      const plugins = [
        createMockInputPlugin('A', () => {
          executionOrder.push('A')
          return {}
        }, ['B']),
        createMockInputPlugin('B', () => {
          executionOrder.push('B')
          return {}
        }),
      ]

      pipeline.executePluginsInOrder(plugins, createBaseContext())
      expect(executionOrder).toEqual(['B', 'A'])
    })

    it('should merge outputs from all plugins', () => {
      const pipeline = new PluginPipeline()
      const plugins = [
        createMockInputPlugin('A', () => ({
          workspace: {
            directory: createMockPath('/test'),
            projects: [{ name: 'project-a' }],
          },
        })),
        createMockInputPlugin('B', () => ({
          workspace: {
            directory: createMockPath('/test'),
            projects: [{ name: 'project-b' }],
          },
        })),
      ]

      const result = pipeline.executePluginsInOrder(plugins, createBaseContext())
      expect(result.workspace?.projects).toHaveLength(2)
      expect(result.workspace?.projects.map((p) => p.name)).toContain('project-a')
      expect(result.workspace?.projects.map((p) => p.name)).toContain('project-b')
    })

    it('should pass dependency context to dependent plugins', () => {
      const pipeline = new PluginPipeline()
      let receivedContext: Partial<CollectedInputContext> | undefined

      const plugins = [
        createMockInputPlugin('B', () => ({
          workspace: {
            directory: createMockPath('/test'),
            projects: [{ name: 'from-B' }],
          },
        })),
        createMockInputPlugin('A', (ctx) => {
          receivedContext = ctx.dependencyContext
          return {}
        }, ['B']),
      ]

      pipeline.executePluginsInOrder(plugins, createBaseContext())

      expect(receivedContext).toBeDefined()
      expect(receivedContext?.workspace?.projects).toHaveLength(1)
      expect(receivedContext?.workspace?.projects[0]?.name).toBe('from-B')
    })

    it('should provide empty dependency context for plugins without dependencies', () => {
      const pipeline = new PluginPipeline()
      let receivedContext: Partial<CollectedInputContext> | undefined

      const plugins = [
        createMockInputPlugin('A', (ctx) => {
          receivedContext = ctx.dependencyContext
          return {}
        }),
      ]

      pipeline.executePluginsInOrder(plugins, createBaseContext())
      expect(receivedContext).toEqual({})
    })

    it('should handle diamond dependency pattern with correct context', () => {
      const pipeline = new PluginPipeline()
      const executionOrder: string[] = []
      let aReceivedContext: Partial<CollectedInputContext> | undefined

      // A depends on B and C, both B and C depend on D
      const plugins = [
        createMockInputPlugin('A', (ctx) => {
          executionOrder.push('A')
          aReceivedContext = ctx.dependencyContext
          return {}
        }, ['B', 'C']),
        createMockInputPlugin('B', () => {
          executionOrder.push('B')
          return {
            workspace: {
              directory: createMockPath('/test'),
              projects: [{ name: 'from-B' }],
            },
          }
        }, ['D']),
        createMockInputPlugin('C', () => {
          executionOrder.push('C')
          return {
            workspace: {
              directory: createMockPath('/test'),
              projects: [{ name: 'from-C' }],
            },
          }
        }, ['D']),
        createMockInputPlugin('D', () => {
          executionOrder.push('D')
          return {
            workspace: {
              directory: createMockPath('/test'),
              projects: [{ name: 'from-D' }],
            },
          }
        }),
      ]

      pipeline.executePluginsInOrder(plugins, createBaseContext())

      // D must execute first
      expect(executionOrder.indexOf('D')).toBeLessThan(executionOrder.indexOf('B'))
      expect(executionOrder.indexOf('D')).toBeLessThan(executionOrder.indexOf('C'))
      // B and C must execute before A
      expect(executionOrder.indexOf('B')).toBeLessThan(executionOrder.indexOf('A'))
      expect(executionOrder.indexOf('C')).toBeLessThan(executionOrder.indexOf('A'))

      // A should receive context from B and C (its direct dependencies)
      expect(aReceivedContext?.workspace?.projects).toBeDefined()
      const projectNames = aReceivedContext?.workspace?.projects.map((p) => p.name) ?? []
      expect(projectNames).toContain('from-B')
      expect(projectNames).toContain('from-C')
    })

    it('should merge array fields correctly', () => {
      const pipeline = new PluginPipeline()
      const plugins = [
        createMockInputPlugin('A', () => ({
          fastCommands: [{ type: 1, name: 'cmd-a' } as unknown as CollectedInputContext['fastCommands'] extends readonly (infer T)[] | undefined ? T : never],
        })),
        createMockInputPlugin('B', () => ({
          fastCommands: [{ type: 1, name: 'cmd-b' } as unknown as CollectedInputContext['fastCommands'] extends readonly (infer T)[] | undefined ? T : never],
        })),
      ]

      const result = pipeline.executePluginsInOrder(plugins, createBaseContext())
      expect(result.fastCommands).toHaveLength(2)
    })

    it('should use last globalMemory when multiple plugins provide it', () => {
      const pipeline = new PluginPipeline()
      const mockGlobalMemoryA = {
        type: PromptKind.GlobalMemory,
        content: 'from-A',
        parentDirectoryPath: {},
        markdownContents: [],
        dir: createMockPath('/test'),
        length: 6,
        filePathKind: FilePathKind.Relative,
      } as unknown as NonNullable<CollectedInputContext['globalMemory']>
      const mockGlobalMemoryB = {
        type: PromptKind.GlobalMemory,
        content: 'from-B',
        parentDirectoryPath: {},
        markdownContents: [],
        dir: createMockPath('/test'),
        length: 6,
        filePathKind: FilePathKind.Relative,
      } as unknown as NonNullable<CollectedInputContext['globalMemory']>

      const plugins = [
        createMockInputPlugin('A', () => ({
          globalMemory: mockGlobalMemoryA,
        })),
        createMockInputPlugin('B', () => ({
          globalMemory: mockGlobalMemoryB,
        })),
      ]

      const result = pipeline.executePluginsInOrder(plugins, createBaseContext())
      expect(result.globalMemory?.content).toBe('from-B')
    })
  })
})
