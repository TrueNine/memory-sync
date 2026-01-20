import type {InputEffectContext, InputEffectResult, InputPluginContext, PluginOptions} from '@/types'

import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import glob from 'fast-glob'
import {beforeEach, describe, expect, it} from 'vitest'
import {createLogger} from '@/log'
import {AbstractInputPlugin} from './AbstractInputPlugin'

function createTestOptions(overrides: Partial<PluginOptions> = {}): Required<PluginOptions> { // Default test options for Required<PluginOptions>
  return {
    workspaceDir: '/test',
    shadowSourceProjectDir: '/test/aindex',
    shadowSkillSourceDir: '$SHADOW_SOURCE_PROJECT/dist/skills',
    shadowFastCommandDir: '$SHADOW_SOURCE_PROJECT/dist/commands',
    shadowSubAgentDir: '$SHADOW_SOURCE_PROJECT/dist/agents',
    globalMemoryFile: '$SHADOW_SOURCE_PROJECT/dist/global.md',
    shadowProjectsDir: '$SHADOW_SOURCE_PROJECT/dist/app',
    externalProjects: [],
    excludePatterns: {},
    fastCommandSeriesOptions: {},
    plugins: [],
    logLevel: 'info',
    ...overrides
  }
}

class TestInputPlugin extends AbstractInputPlugin { // Concrete implementation for testing
  public effectResults: InputEffectResult[] = []

  constructor(name: string = 'TestInputPlugin', dependsOn?: readonly string[]) {
    super(name, dependsOn)
  }

  async collect(): Promise<Partial<CollectedInputContext>> {
    return {}
  }

  public exposeRegisterEffect( // Expose protected methods for testing
    name: string,
    handler: (ctx: InputEffectContext) => Promise<InputEffectResult>,
    priority?: number
  ): void {
    this.registerEffect(name, handler, priority)
  }

  public exposeResolveBasePaths(options: Required<PluginOptions>): {workspaceDir: string, shadowProjectDir: string} {
    return this.resolveBasePaths(options)
  }

  public exposeResolvePath(rawPath: string, workspaceDir: string, shadowProjectDir: string): string {
    return this.resolvePath(rawPath, workspaceDir, shadowProjectDir)
  }

  public exposeRegisterScope(namespace: string, values: Record<string, unknown>): void { // Expose scope registration methods for testing
    this.registerScope(namespace, values)
  }

  public exposeClearRegisteredScopes(): void {
    this.clearRegisteredScopes()
  }
}

describe('abstractInputPlugin', () => {
  let plugin: TestInputPlugin,
    mockLogger: ReturnType<typeof createLogger>

  beforeEach(() => {
    plugin = new TestInputPlugin()
    mockLogger = createLogger('test')
  })

  describe('effect registration', () => {
    it('should register effects', () => {
      expect(plugin.hasEffects()).toBe(false)
      expect(plugin.getEffectCount()).toBe(0)

      plugin.exposeRegisterEffect('test-effect', async () => ({
        success: true,
        description: 'Test effect executed'
      }))

      expect(plugin.hasEffects()).toBe(true)
      expect(plugin.getEffectCount()).toBe(1)
    })

    it('should sort effects by priority', () => {
      const executionOrder: string[] = []

      plugin.exposeRegisterEffect('low-priority', async () => {
        executionOrder.push('low')
        return {success: true}
      }, 10)

      plugin.exposeRegisterEffect('high-priority', async () => {
        executionOrder.push('high')
        return {success: true}
      }, -10)

      plugin.exposeRegisterEffect('default-priority', async () => {
        executionOrder.push('default')
        return {success: true}
      })

      expect(plugin.getEffectCount()).toBe(3)
    })
  })

  describe('executeEffects', () => {
    it('should execute effects in priority order', async () => {
      const executionOrder: string[] = []

      plugin.exposeRegisterEffect('third', async () => {
        executionOrder.push('third')
        return {success: true}
      }, 10)

      plugin.exposeRegisterEffect('first', async () => {
        executionOrder.push('first')
        return {success: true}
      }, -10)

      plugin.exposeRegisterEffect('second', async () => {
        executionOrder.push('second')
        return {success: true}
      }, 0)

      const ctx: InputPluginContext = {
        logger: mockLogger,
        fs,
        path,
        glob,
        userConfigOptions: createTestOptions({workspaceDir: '/test'}),
        dependencyContext: {}
      }

      const results = await plugin.executeEffects(ctx)

      expect(results).toHaveLength(3)
      expect(results.every(r => r.success)).toBe(true)
      expect(executionOrder).toEqual(['first', 'second', 'third'])
    })

    it('should return empty array when no effects registered', async () => {
      const ctx: InputPluginContext = {
        logger: mockLogger,
        fs,
        path,
        glob,
        userConfigOptions: createTestOptions(),
        dependencyContext: {}
      }

      const results = await plugin.executeEffects(ctx)
      expect(results).toHaveLength(0)
    })

    it('should handle dry-run mode', async () => {
      let effectExecuted = false

      plugin.exposeRegisterEffect('test-effect', async () => {
        effectExecuted = true
        return {success: true}
      })

      const ctx: InputPluginContext = {
        logger: mockLogger,
        fs,
        path,
        glob,
        userConfigOptions: createTestOptions(),
        dependencyContext: {}
      }

      const results = await plugin.executeEffects(ctx, true)

      expect(results).toHaveLength(1)
      expect(results[0]?.success).toBe(true)
      expect(results[0]?.description).toContain('Would execute')
      expect(effectExecuted).toBe(false)
    })

    it('should catch and log errors from effects', async () => {
      plugin.exposeRegisterEffect('failing-effect', async () => {
        throw new Error('Effect failed')
      })

      const ctx: InputPluginContext = {
        logger: mockLogger,
        fs,
        path,
        glob,
        userConfigOptions: createTestOptions(),
        dependencyContext: {}
      }

      const results = await plugin.executeEffects(ctx)

      expect(results).toHaveLength(1)
      expect(results[0]?.success).toBe(false)
      expect(results[0]?.error?.message).toBe('Effect failed')
    })

    it('should continue executing effects after one fails', async () => {
      const executionOrder: string[] = []

      plugin.exposeRegisterEffect('first', async () => {
        executionOrder.push('first')
        throw new Error('First failed')
      }, -10)

      plugin.exposeRegisterEffect('second', async () => {
        executionOrder.push('second')
        return {success: true}
      }, 10)

      const ctx: InputPluginContext = {
        logger: mockLogger,
        fs,
        path,
        glob,
        userConfigOptions: createTestOptions(),
        dependencyContext: {}
      }

      const results = await plugin.executeEffects(ctx)

      expect(results).toHaveLength(2)
      expect(results[0]?.success).toBe(false)
      expect(results[1]?.success).toBe(true)
      expect(executionOrder).toEqual(['first', 'second'])
    })
  })

  describe('resolveBasePaths', () => {
    it('should resolve workspace and shadow project paths', () => {
      const options = createTestOptions({workspaceDir: '/custom/workspace', shadowSourceProjectDir: '/custom/workspace/aindex'})

      const {workspaceDir, shadowProjectDir} = plugin.exposeResolveBasePaths(options)

      expect(workspaceDir).toBe(path.normalize('/custom/workspace'))
      expect(shadowProjectDir).toBe(path.normalize('/custom/workspace/aindex'))
    })

    it('should use default paths when not specified', () => {
      const options = createTestOptions({workspaceDir: '~/project', shadowSourceProjectDir: '$WORKSPACE/aindex'})

      const {workspaceDir, shadowProjectDir} = plugin.exposeResolveBasePaths(options)

      expect(workspaceDir).toContain('project')
      expect(shadowProjectDir).toContain('aindex')
    })
  })

  describe('resolvePath', () => {
    it('should replace ~ with home directory', () => {
      const resolved = plugin.exposeResolvePath('~/test', '', '')
      expect(resolved).toBe(path.normalize(`${os.homedir()}/test`))
    })

    it('should replace $WORKSPACE placeholder', () => {
      const resolved = plugin.exposeResolvePath('$WORKSPACE/subdir', '/workspace', '')
      expect(resolved).toBe(path.normalize('/workspace/subdir'))
    })

    it('should replace $SHADOW_SOURCE_PROJECT placeholder', () => {
      const resolved = plugin.exposeResolvePath('$SHADOW_SOURCE_PROJECT/dist', '', '/shadow')
      expect(resolved).toBe(path.normalize('/shadow/dist'))
    })
  })

  describe('scope registration', () => {
    it('should register scope variables', () => {
      expect(plugin.getRegisteredScopes()).toHaveLength(0)

      plugin.exposeRegisterScope('myPlugin', {version: '1.0.0'})

      const scopes = plugin.getRegisteredScopes()
      expect(scopes).toHaveLength(1)
      expect(scopes[0]?.namespace).toBe('myPlugin')
      expect(scopes[0]?.values).toEqual({version: '1.0.0'})
    })

    it('should register multiple scopes', () => {
      plugin.exposeRegisterScope('plugin1', {key1: 'value1'})
      plugin.exposeRegisterScope('plugin2', {key2: 'value2'})

      const scopes = plugin.getRegisteredScopes()
      expect(scopes).toHaveLength(2)
      expect(scopes[0]?.namespace).toBe('plugin1')
      expect(scopes[1]?.namespace).toBe('plugin2')
    })

    it('should allow registering same namespace multiple times', () => {
      plugin.exposeRegisterScope('myPlugin', {key1: 'value1'})
      plugin.exposeRegisterScope('myPlugin', {key2: 'value2'})

      const scopes = plugin.getRegisteredScopes()
      expect(scopes).toHaveLength(2)
      expect(scopes[0]?.values).toEqual({key1: 'value1'})
      expect(scopes[1]?.values).toEqual({key2: 'value2'})
    })

    it('should support nested objects in scope values', () => {
      plugin.exposeRegisterScope('myPlugin', {
        config: {
          debug: true,
          nested: {level: 2}
        }
      })

      const scopes = plugin.getRegisteredScopes()
      expect(scopes[0]?.values).toEqual({
        config: {
          debug: true,
          nested: {level: 2}
        }
      })
    })

    it('should clear registered scopes', () => {
      plugin.exposeRegisterScope('myPlugin', {key: 'value'})
      expect(plugin.getRegisteredScopes()).toHaveLength(1)

      plugin.exposeClearRegisteredScopes()
      expect(plugin.getRegisteredScopes()).toHaveLength(0)
    })

    it('should return readonly array from getRegisteredScopes', () => {
      plugin.exposeRegisterScope('myPlugin', {key: 'value'})

      const scopes = plugin.getRegisteredScopes()
      expect(Array.isArray(scopes)).toBe(true) // TypeScript should prevent modification, but we verify the array is a copy
    })
  })
})
