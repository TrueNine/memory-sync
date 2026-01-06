import type { ParsedCliArgs } from '@/PluginPipeline'
import type { CollectedInputContext, InputPlugin, InputPluginContext, Plugin } from '@/types'
import fs from 'node:fs'
import path from 'node:path'
import glob from 'fast-glob'
import { describe, expect, it } from 'vitest'
import {
  CleanCommand,
  DryRunCleanCommand,
  DryRunOutputCommand,
  ExecuteCommand,
  HelpCommand,
  InitCommand,
  UnknownCommand,
} from '@/commands'
import { createLogger } from '@/log'
import { parseArgs, PluginPipeline, resolveCommand, resolveLogLevel } from '@/PluginPipeline'
import { CircularDependencyError, FilePathKind, MissingDependencyError, PluginKind, PromptKind } from '@/types'

function createMockPlugin(name: string, dependsOn?: readonly string[]): Plugin {
  const base = {
    type: PluginKind.Input,
    name,
    log: {} as Plugin['log'],
  }
  if (dependsOn) return { ...base, dependsOn }
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
  if (dependsOn) return { ...base, dependsOn }
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
      expect(result.map(p => p.name)).toEqual(['A'])
    })

    it('should preserve registration order for plugins without dependencies', () => {
      const pipeline = new PluginPipeline()
      const plugins = [
        createMockPlugin('A'),
        createMockPlugin('B'),
        createMockPlugin('C'),
      ]
      const result = pipeline.topologicalSort(plugins)
      expect(result.map(p => p.name)).toEqual(['A', 'B', 'C'])
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
      const names = result.map(p => p.name)

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
      const names = result.map(p => p.name)

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
      const names = result.map(p => p.name)

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
    it('should return empty object for empty plugins array', async () => {
      const pipeline = new PluginPipeline()
      const result = await pipeline.executePluginsInOrder([], createBaseContext())
      expect(result).toEqual({})
    })

    it('should execute single plugin and return its output', async () => {
      const pipeline = new PluginPipeline()
      const plugins = [
        createMockInputPlugin('A', () => ({
          workspace: { directory: createMockPath('/test'), projects: [] },
        })),
      ]

      const result = await pipeline.executePluginsInOrder(plugins, createBaseContext())
      expect(result.workspace?.directory.path).toBe('/test')
    })

    it('should execute plugins in dependency order', async () => {
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

      await pipeline.executePluginsInOrder(plugins, createBaseContext())
      expect(executionOrder).toEqual(['B', 'A'])
    })

    it('should merge outputs from all plugins', async () => {
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

      const result = await pipeline.executePluginsInOrder(plugins, createBaseContext())
      expect(result.workspace?.projects).toHaveLength(2)
      expect(result.workspace?.projects.map(p => p.name)).toContain('project-a')
      expect(result.workspace?.projects.map(p => p.name)).toContain('project-b')
    })

    it('should pass dependency context to dependent plugins', async () => {
      const pipeline = new PluginPipeline()
      let receivedContext: Partial<CollectedInputContext> | undefined

      const plugins = [
        createMockInputPlugin('B', () => ({
          workspace: {
            directory: createMockPath('/test'),
            projects: [{ name: 'from-B' }],
          },
        })),
        createMockInputPlugin('A', ctx => {
          receivedContext = ctx.dependencyContext
          return {}
        }, ['B']),
      ]

      await pipeline.executePluginsInOrder(plugins, createBaseContext())

      expect(receivedContext).toBeDefined()
      expect(receivedContext?.workspace?.projects).toHaveLength(1)
      expect(receivedContext?.workspace?.projects[0]?.name).toBe('from-B')
    })

    it('should provide empty dependency context for plugins without dependencies', async () => {
      const pipeline = new PluginPipeline()
      let receivedContext: Partial<CollectedInputContext> | undefined

      const plugins = [
        createMockInputPlugin('A', ctx => {
          receivedContext = ctx.dependencyContext
          return {}
        }),
      ]

      await pipeline.executePluginsInOrder(plugins, createBaseContext())
      expect(receivedContext).toEqual({})
    })

    it('should handle diamond dependency pattern with correct context', async () => {
      const pipeline = new PluginPipeline()
      const executionOrder: string[] = []
      let aReceivedContext: Partial<CollectedInputContext> | undefined

      // A depends on B and C, both B and C depend on D
      const plugins = [
        createMockInputPlugin('A', ctx => {
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

      await pipeline.executePluginsInOrder(plugins, createBaseContext())

      // D must execute first
      expect(executionOrder.indexOf('D')).toBeLessThan(executionOrder.indexOf('B'))
      expect(executionOrder.indexOf('D')).toBeLessThan(executionOrder.indexOf('C'))
      // B and C must execute before A
      expect(executionOrder.indexOf('B')).toBeLessThan(executionOrder.indexOf('A'))
      expect(executionOrder.indexOf('C')).toBeLessThan(executionOrder.indexOf('A'))

      // A should receive context from B and C (its direct dependencies)
      expect(aReceivedContext?.workspace?.projects).toBeDefined()
      const projectNames = aReceivedContext?.workspace?.projects.map(p => p.name) ?? []
      expect(projectNames).toContain('from-B')
      expect(projectNames).toContain('from-C')
    })

    it('should merge array fields correctly', async () => {
      const pipeline = new PluginPipeline()
      const plugins = [
        createMockInputPlugin('A', () => ({
          fastCommands: [{ type: 1, name: 'cmd-a' } as unknown as CollectedInputContext['fastCommands'] extends readonly (infer T)[] | undefined ? T : never],
        })),
        createMockInputPlugin('B', () => ({
          fastCommands: [{ type: 1, name: 'cmd-b' } as unknown as CollectedInputContext['fastCommands'] extends readonly (infer T)[] | undefined ? T : never],
        })),
      ]

      const result = await pipeline.executePluginsInOrder(plugins, createBaseContext())
      expect(result.fastCommands).toHaveLength(2)
    })

    it('should use last globalMemory when multiple plugins provide it', async () => {
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

      const result = await pipeline.executePluginsInOrder(plugins, createBaseContext())
      expect(result.globalMemory?.content).toBe('from-B')
    })
  })
})

/**
 * Unit tests for argument parsing
 * Requirements: 1.1, 2.1-2.3, 3.1, 4.1, 5.1-5.3, 6.1-6.7
 */
describe('parseArgs', () => {
  describe('subcommand parsing', () => {
    it('should parse "help" subcommand', () => {
      const result = parseArgs(['help'])
      expect(result.subcommand).toBe('help')
      expect(result.unknownCommand).toBeUndefined()
    })

    it('should parse "init" subcommand', () => {
      const result = parseArgs(['init'])
      expect(result.subcommand).toBe('init')
      expect(result.unknownCommand).toBeUndefined()
    })

    it('should parse "dry-run" subcommand', () => {
      const result = parseArgs(['dry-run'])
      expect(result.subcommand).toBe('dry-run')
      expect(result.unknownCommand).toBeUndefined()
    })

    it('should parse "clean" subcommand', () => {
      const result = parseArgs(['clean'])
      expect(result.subcommand).toBe('clean')
      expect(result.unknownCommand).toBeUndefined()
    })

    it('should return undefined subcommand for empty args', () => {
      const result = parseArgs([])
      expect(result.subcommand).toBeUndefined()
      expect(result.unknownCommand).toBeUndefined()
    })

    it('should capture unknown first positional as unknownCommand', () => {
      const result = parseArgs(['foo'])
      expect(result.subcommand).toBeUndefined()
      expect(result.unknownCommand).toBe('foo')
    })
  })

  describe('help flag parsing', () => {
    it('should parse --help flag', () => {
      const result = parseArgs(['--help'])
      expect(result.helpFlag).toBe(true)
    })

    it('should parse -h flag', () => {
      const result = parseArgs(['-h'])
      expect(result.helpFlag).toBe(true)
    })

    it('should parse --help with subcommand', () => {
      const result = parseArgs(['init', '--help'])
      expect(result.helpFlag).toBe(true)
      expect(result.subcommand).toBe('init')
    })
  })

  describe('dry-run flag parsing', () => {
    it('should parse --dry-run flag', () => {
      const result = parseArgs(['--dry-run'])
      expect(result.dryRun).toBe(true)
    })

    it('should parse -n flag', () => {
      const result = parseArgs(['-n'])
      expect(result.dryRun).toBe(true)
    })

    it('should parse clean --dry-run', () => {
      const result = parseArgs(['clean', '--dry-run'])
      expect(result.subcommand).toBe('clean')
      expect(result.dryRun).toBe(true)
    })

    it('should parse clean -n', () => {
      const result = parseArgs(['clean', '-n'])
      expect(result.subcommand).toBe('clean')
      expect(result.dryRun).toBe(true)
    })
  })

  describe('log level parsing', () => {
    it('should parse --trace flag', () => {
      const result = parseArgs(['--trace'])
      expect(result.logLevel).toBe('trace')
      expect(result.logLevelFlags).toContain('trace')
    })

    it('should parse --debug flag', () => {
      const result = parseArgs(['--debug'])
      expect(result.logLevel).toBe('debug')
      expect(result.logLevelFlags).toContain('debug')
    })

    it('should parse --info flag', () => {
      const result = parseArgs(['--info'])
      expect(result.logLevel).toBe('info')
      expect(result.logLevelFlags).toContain('info')
    })

    it('should parse --warn flag', () => {
      const result = parseArgs(['--warn'])
      expect(result.logLevel).toBe('warn')
      expect(result.logLevelFlags).toContain('warn')
    })

    it('should parse --error flag', () => {
      const result = parseArgs(['--error'])
      expect(result.logLevel).toBe('error')
      expect(result.logLevelFlags).toContain('error')
    })

    it('should have undefined logLevel when no flag provided', () => {
      const result = parseArgs([])
      expect(result.logLevel).toBeUndefined()
      expect(result.logLevelFlags).toHaveLength(0)
    })

    it('should collect multiple log level flags', () => {
      const result = parseArgs(['--debug', '--trace', '--info'])
      expect(result.logLevelFlags).toContain('debug')
      expect(result.logLevelFlags).toContain('trace')
      expect(result.logLevelFlags).toContain('info')
      expect(result.logLevelFlags).toHaveLength(3)
    })
  })

  describe('unknown flags', () => {
    it('should collect unknown long flags', () => {
      const result = parseArgs(['--unknown-flag'])
      expect(result.unknown).toContain('--unknown-flag')
    })

    it('should collect unknown short flags', () => {
      const result = parseArgs(['-x'])
      expect(result.unknown).toContain('-x')
    })
  })

  describe('positional arguments', () => {
    it('should collect positional arguments after subcommand', () => {
      const result = parseArgs(['init', 'arg1', 'arg2'])
      expect(result.subcommand).toBe('init')
      expect(result.positional).toContain('arg1')
      expect(result.positional).toContain('arg2')
    })

    it('should handle -- separator', () => {
      const result = parseArgs(['init', '--', '--help', 'arg'])
      expect(result.subcommand).toBe('init')
      expect(result.helpFlag).toBe(false)
      expect(result.positional).toContain('--help')
      expect(result.positional).toContain('arg')
    })
  })

  describe('parsedCliArgs structure', () => {
    it('should return complete ParsedCliArgs structure', () => {
      const result = parseArgs(['clean', '--dry-run', '--debug'])
      expect(result).toMatchObject({
        subcommand: 'clean',
        helpFlag: false,
        dryRun: true,
        logLevel: 'debug',
        unknownCommand: void 0,
      } satisfies Partial<ParsedCliArgs>)
      expect(result.logLevelFlags).toContain('debug')
      expect(Array.isArray(result.positional)).toBe(true)
      expect(Array.isArray(result.unknown)).toBe(true)
    })
  })
})

/**
 * Unit tests for log level resolution
 * Requirements: 6.6, 6.7
 */
describe('resolveLogLevel', () => {
  function createParsedArgs(overrides: Partial<ParsedCliArgs> = {}): ParsedCliArgs {
    return {
      subcommand: void 0,
      helpFlag: false,
      versionFlag: false,
      dryRun: false,
      logLevel: void 0,
      logLevelFlags: [],
      setOption: [],
      unknownCommand: void 0,
      positional: [],
      unknown: [],
      ...overrides,
    }
  }

  it('should return undefined when no log level flags provided', () => {
    const args = createParsedArgs()
    expect(resolveLogLevel(args)).toBeUndefined()
  })

  it('should return single log level when one flag provided', () => {
    const args = createParsedArgs({ logLevelFlags: ['debug'] })
    expect(resolveLogLevel(args)).toBe('debug')
  })

  it('should return most verbose level (trace) when multiple flags provided', () => {
    const args = createParsedArgs({ logLevelFlags: ['error', 'trace', 'warn'] })
    expect(resolveLogLevel(args)).toBe('trace')
  })

  it('should return debug over info when both provided', () => {
    const args = createParsedArgs({ logLevelFlags: ['info', 'debug'] })
    expect(resolveLogLevel(args)).toBe('debug')
  })

  it('should return info over warn when both provided', () => {
    const args = createParsedArgs({ logLevelFlags: ['warn', 'info'] })
    expect(resolveLogLevel(args)).toBe('info')
  })
})

/**
 * Unit tests for command resolution
 * Requirements: 1.1, 2.1-2.3, 3.1, 4.1, 5.1-5.3, 7.1
 */
describe('resolveCommand', () => {
  function createParsedArgs(overrides: Partial<ParsedCliArgs> = {}): ParsedCliArgs {
    return {
      subcommand: void 0,
      helpFlag: false,
      versionFlag: false,
      dryRun: false,
      logLevel: void 0,
      logLevelFlags: [],
      setOption: [],
      unknownCommand: void 0,
      positional: [],
      unknown: [],
      ...overrides,
    }
  }

  describe('default command', () => {
    it('should return ExecuteCommand for empty args', () => {
      const args = createParsedArgs()
      const command = resolveCommand(args)
      expect(command).toBeInstanceOf(ExecuteCommand)
    })
  })

  describe('help command', () => {
    it('should return HelpCommand for help subcommand', () => {
      const args = createParsedArgs({ subcommand: 'help' })
      const command = resolveCommand(args)
      expect(command).toBeInstanceOf(HelpCommand)
    })

    it('should return HelpCommand for --help flag', () => {
      const args = createParsedArgs({ helpFlag: true })
      const command = resolveCommand(args)
      expect(command).toBeInstanceOf(HelpCommand)
    })

    it('should return HelpCommand for -h flag', () => {
      const args = createParsedArgs({ helpFlag: true })
      const command = resolveCommand(args)
      expect(command).toBeInstanceOf(HelpCommand)
    })

    it('should prioritize helpFlag over subcommand', () => {
      const args = createParsedArgs({ helpFlag: true, subcommand: 'init' })
      const command = resolveCommand(args)
      expect(command).toBeInstanceOf(HelpCommand)
    })

    it('should prioritize helpFlag over unknownCommand', () => {
      const args = createParsedArgs({ helpFlag: true, unknownCommand: 'foo' })
      const command = resolveCommand(args)
      expect(command).toBeInstanceOf(HelpCommand)
    })
  })

  describe('init command', () => {
    it('should return InitCommand for init subcommand', () => {
      const args = createParsedArgs({ subcommand: 'init' })
      const command = resolveCommand(args)
      expect(command).toBeInstanceOf(InitCommand)
    })
  })

  describe('dry-run command', () => {
    it('should return DryRunOutputCommand for dry-run subcommand', () => {
      const args = createParsedArgs({ subcommand: 'dry-run' })
      const command = resolveCommand(args)
      expect(command).toBeInstanceOf(DryRunOutputCommand)
    })
  })

  describe('clean command', () => {
    it('should return CleanCommand for clean subcommand', () => {
      const args = createParsedArgs({ subcommand: 'clean' })
      const command = resolveCommand(args)
      expect(command).toBeInstanceOf(CleanCommand)
    })

    it('should return DryRunCleanCommand for clean --dry-run', () => {
      const args = createParsedArgs({ subcommand: 'clean', dryRun: true })
      const command = resolveCommand(args)
      expect(command).toBeInstanceOf(DryRunCleanCommand)
    })

    it('should return DryRunCleanCommand for clean -n', () => {
      const args = createParsedArgs({ subcommand: 'clean', dryRun: true })
      const command = resolveCommand(args)
      expect(command).toBeInstanceOf(DryRunCleanCommand)
    })
  })

  describe('unknown command', () => {
    it('should return UnknownCommand for unknown subcommand', () => {
      const args = createParsedArgs({ unknownCommand: 'foo' })
      const command = resolveCommand(args)
      expect(command).toBeInstanceOf(UnknownCommand)
    })

    it('should prioritize unknownCommand over default', () => {
      const args = createParsedArgs({ unknownCommand: 'bar' })
      const command = resolveCommand(args)
      expect(command).toBeInstanceOf(UnknownCommand)
    })
  })
})
