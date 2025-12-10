/**
 * Property-based tests for PluginRunner
 * **Feature: plugin-architecture, Property 1: Plugin registration order execution**
 * **Feature: plugin-architecture, Property 6: Priority sorting**
 * **Feature: plugin-architecture, Property 9: Error isolation continue execution**
 */

import type { Plugin } from './types'
import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { CircularDependencyError, CircularInheritanceError, PluginRunner } from './PluginRunner'

/**
 * Generate a valid plugin name
 */
const pluginNameArb = fc.string({ minLength: 1, maxLength: 20 })
  .filter((s) => s.trim().length > 0)
  .map((s) => s.replace(/[^a-zA-Z0-9-_]/g, '_'))

/**
 * Generate a unique list of plugin names
 */
const uniquePluginNamesArb = fc.array(pluginNameArb, { minLength: 1, maxLength: 10 })
  .map((names) => [...new Set(names)])
  .filter((names) => names.length >= 1)

describe('PluginRunner properties', () => {
  describe('Property 1: Plugin registration order execution', () => {
    it('should execute buildStart hooks in registration order when priorities are equal', () => {
      /**
       * **Feature: plugin-architecture, Property 1: Plugin registration order execution**
       * **Validates: Requirements 1.5, 5.1**
       *
       * For any plugin list with equal priorities, buildStart hooks should execute
       * in registration order
       */
      fc.assert(
        fc.asyncProperty(
          uniquePluginNamesArb,
          async (names) => {
            const executionOrder: string[] = []
            const runner = new PluginRunner({ plugins: [] })

            for (const name of names) {
              const plugin: Plugin = {
                name,
                buildStart: () => {
                  executionOrder.push(name)
                },
              }
              runner.register(plugin)
            }

            await runner.run()

            expect(executionOrder).toEqual(names)
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should execute all lifecycle hooks for each plugin', async () => {
      /**
       * **Feature: plugin-architecture, Property 1: Plugin registration order execution**
       * **Validates: Requirements 1.5, 5.1**
       */
      const hooks: string[] = []
      const runner = new PluginRunner({ plugins: [] })

      const plugin: Plugin = {
        name: 'test-plugin',
        buildStart: () => {
          hooks.push('buildStart')
        },
        generateBundle: () => {
          hooks.push('generateBundle')
        },
        writeBundle: () => {
          hooks.push('writeBundle')
        },
        buildEnd: () => {
          hooks.push('buildEnd')
        },
      }

      runner.register(plugin)
      await runner.run()

      expect(hooks).toEqual(['buildStart', 'generateBundle', 'writeBundle', 'buildEnd'])
    })
  })

  describe('Property 6: Priority sorting', () => {
    it('should execute plugins in priority order (lower priority first)', () => {
      /**
       * **Feature: plugin-architecture, Property 6: Priority sorting**
       * **Validates: Requirements 9.2**
       *
       * For any set of plugins with different priorities, execution order should
       * strictly follow priority ascending order
       */
      fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              name: pluginNameArb,
              priority: fc.integer({ min: 1, max: 1000 }),
            }),
            { minLength: 2, maxLength: 10 },
          ).map((plugins) => {
            const seen = new Set<string>()
            return plugins.filter((p) => {
              if (seen.has(p.name)) {
                return false
              }
              seen.add(p.name)
              return true
            })
          }).filter((plugins) => plugins.length >= 2),
          async (pluginConfigs) => {
            const executionOrder: string[] = []
            const runner = new PluginRunner({ plugins: [] })

            for (const config of pluginConfigs) {
              const plugin: Plugin = {
                name: config.name,
                priority: config.priority,
                buildStart: () => {
                  executionOrder.push(config.name)
                },
              }
              runner.register(plugin)
            }

            await runner.run()

            const sortedByPriority = [...pluginConfigs]
              .sort((a, b) => a.priority - b.priority)
              .map((p) => p.name)

            expect(executionOrder).toEqual(sortedByPriority)
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should sort plugins respecting both priority and dependencies', () => {
      /**
       * **Feature: plugin-architecture, Property 6: Priority sorting**
       * **Validates: Requirements 9.1, 9.2**
       *
       * For any set of plugins with priorities and dependencies,
       * dependencies should be satisfied while respecting priority order
       */
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              name: pluginNameArb,
              priority: fc.integer({ min: 1, max: 1000 }),
            }),
            { minLength: 2, maxLength: 8 },
          ).map((plugins) => {
            const seen = new Set<string>()
            return plugins.filter((p) => {
              if (seen.has(p.name)) {
                return false
              }
              seen.add(p.name)
              return true
            })
          }).filter((plugins) => plugins.length >= 2),
          (pluginConfigs) => {
            const runner = new PluginRunner({ plugins: [] })

            // Create plugins without dependencies first
            const pluginsWithDeps = pluginConfigs.map((config, index) => ({
              name: config.name,
              priority: config.priority,
              // Add dependency on previous plugin (if exists) for some plugins
              dependencies: index > 0 && index % 2 === 0
                ? [pluginConfigs[index - 1].name]
                : undefined,
            }))

            const sorted = runner.sortPlugins(pluginsWithDeps)

            // Verify all plugins are in the result
            expect(sorted.length).toBe(pluginsWithDeps.length)

            // Verify dependencies are satisfied (dependent comes after dependency)
            for (const plugin of sorted) {
              if (plugin.dependencies != null) {
                const pluginIndex = sorted.findIndex((p) => p.name === plugin.name)
                for (const depName of plugin.dependencies) {
                  const depIndex = sorted.findIndex((p) => p.name === depName)
                  expect(depIndex).toBeLessThan(pluginIndex)
                }
              }
            }
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should detect and throw error for circular dependencies', () => {
      /**
       * **Feature: plugin-architecture, Property 6: Priority sorting**
       * **Validates: Requirements 9.3**
       *
       * For any set of plugins with circular dependencies,
       * sortPlugins should throw CircularDependencyError
       */
      const runner = new PluginRunner({ plugins: [] })

      // Create plugins with circular dependency: A -> B -> C -> A
      const pluginsWithCircular = [
        { name: 'plugin-a', priority: 100, dependencies: ['plugin-c'] },
        { name: 'plugin-b', priority: 100, dependencies: ['plugin-a'] },
        { name: 'plugin-c', priority: 100, dependencies: ['plugin-b'] },
      ]

      expect(() => runner.sortPlugins(pluginsWithCircular)).toThrow(CircularDependencyError)
    })

    it('should detect self-referencing circular dependency', () => {
      /**
       * **Feature: plugin-architecture, Property 6: Priority sorting**
       * **Validates: Requirements 9.3**
       */
      const runner = new PluginRunner({ plugins: [] })

      // Plugin depends on itself
      const pluginsWithSelfRef = [
        { name: 'self-ref', priority: 100, dependencies: ['self-ref'] },
      ]

      expect(() => runner.sortPlugins(pluginsWithSelfRef)).toThrow(CircularDependencyError)
    })

    it('should use default priority (100) when not specified', async () => {
      /**
       * **Feature: plugin-architecture, Property 6: Priority sorting**
       * **Validates: Requirements 4.4**
       */
      const executionOrder: string[] = []
      const runner = new PluginRunner({ plugins: [] })

      runner.register({
        name: 'high-priority',
        priority: 50,
        buildStart: () => {
          executionOrder.push('high-priority')
        },
      })

      runner.register({
        name: 'default-priority',
        buildStart: () => {
          executionOrder.push('default-priority')
        },
      })

      runner.register({
        name: 'low-priority',
        priority: 150,
        buildStart: () => {
          executionOrder.push('low-priority')
        },
      })

      await runner.run()

      expect(executionOrder).toEqual(['high-priority', 'default-priority', 'low-priority'])
    })
  })

  describe('Property 9: Error isolation continue execution', () => {
    it('should continue executing subsequent plugins when one fails (default behavior)', () => {
      /**
       * **Feature: plugin-architecture, Property 9: Error isolation continue execution**
       * **Validates: Requirements 5.3**
       *
       * For any plugin sequence, if a plugin throws an error, subsequent plugins
       * should continue to execute
       */
      fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: 4 }),
          fc.integer({ min: 1, max: 5 }),
          async (failIndex, totalPlugins) => {
            const actualTotal = Math.max(failIndex + 1, totalPlugins)
            const executedPlugins: string[] = []
            const runner = new PluginRunner({ plugins: [] })

            for (let i = 0; i < actualTotal; i++) {
              const name = `plugin-${i}`
              const shouldFail = i === failIndex

              runner.register({
                name,
                buildStart: () => {
                  executedPlugins.push(name)
                  if (shouldFail) {
                    throw new Error(`Plugin ${name} failed`)
                  }
                },
              })
            }

            const result = await runner.run()

            expect(result.success).toBe(false)
            expect(result.errors.length).toBeGreaterThan(0)
            expect(executedPlugins.length).toBe(actualTotal)
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should stop execution when onError is "stop"', async () => {
      /**
       * **Feature: plugin-architecture, Property 9: Error isolation continue execution**
       * **Validates: Requirements 5.3**
       */
      const executedPlugins: string[] = []
      const runner = new PluginRunner({
        plugins: [],
        options: { onError: 'stop' },
      })

      runner.register({
        name: 'plugin-1',
        buildStart: () => {
          executedPlugins.push('plugin-1')
        },
      })

      runner.register({
        name: 'plugin-2',
        buildStart: () => {
          executedPlugins.push('plugin-2')
          throw new Error('Plugin 2 failed')
        },
      })

      runner.register({
        name: 'plugin-3',
        buildStart: () => {
          executedPlugins.push('plugin-3')
        },
      })

      const result = await runner.run()

      expect(result.success).toBe(false)
      expect(executedPlugins).toEqual(['plugin-1', 'plugin-2'])
      expect(executedPlugins).not.toContain('plugin-3')
    })

    it('should skip dependent plugins when dependency fails', async () => {
      /**
       * **Feature: plugin-architecture, Property 9: Error isolation continue execution**
       * **Validates: Requirements 5.3**
       */
      const executedPlugins: string[] = []
      const runner = new PluginRunner({ plugins: [] })

      runner.register({
        name: 'base-plugin',
        buildStart: () => {
          executedPlugins.push('base-plugin')
          throw new Error('Base plugin failed')
        },
      })

      runner.register({
        name: 'dependent-plugin',
        dependencies: ['base-plugin'],
        buildStart: () => {
          executedPlugins.push('dependent-plugin')
        },
      })

      runner.register({
        name: 'independent-plugin',
        buildStart: () => {
          executedPlugins.push('independent-plugin')
        },
      })

      const result = await runner.run()

      expect(result.success).toBe(false)
      expect(executedPlugins).toContain('base-plugin')
      expect(executedPlugins).toContain('independent-plugin')
      expect(executedPlugins).not.toContain('dependent-plugin')

      const dependentState = runner.getPluginState('dependent-plugin')
      expect(dependentState?.status).toBe('skipped')
    })

    it('should record errors in result', async () => {
      /**
       * **Feature: plugin-architecture, Property 9: Error isolation continue execution**
       * **Validates: Requirements 5.3**
       */
      const runner = new PluginRunner({ plugins: [] })

      runner.register({
        name: 'failing-plugin',
        buildStart: () => {
          throw new Error('Test error message')
        },
      })

      const result = await runner.run()

      expect(result.success).toBe(false)
      expect(result.errors.length).toBe(1)
      expect(result.errors[0]).toContain('failing-plugin')
      expect(result.errors[0]).toContain('Test error message')
    })
  })
})


describe('Property 12: Plugin inheritance resolution', () => {
  /**
   * **Feature: plugin-architecture, Property 12: Plugin inheritance resolution**
   * **Validates: Requirements 28.1, 28.4**
   */

  it('should inherit all hooks from parent plugin when child does not override', () => {
    /**
     * **Feature: plugin-architecture, Property 12: Plugin inheritance resolution**
     * **Validates: Requirements 28.1, 28.3**
     *
     * For any parent plugin with hooks, a child plugin that extends it
     * should inherit all non-overridden hooks
     */
    fc.assert(
      fc.property(
        pluginNameArb,
        pluginNameArb.filter((n) => n !== ''),
        (parentName, childName) => {
          // Ensure unique names
          const actualChildName = parentName === childName ? `${childName}_child` : childName

          const runner = new PluginRunner({ plugins: [] })
          let parentBuildStartCalled = false
          let parentBuildEndCalled = false

          // Register parent plugin with hooks
          runner.registerOutput({
            name: parentName,
            buildStart: () => {
              parentBuildStartCalled = true
            },
            buildEnd: () => {
              parentBuildEndCalled = true
            },
          })

          // Register child plugin that extends parent (no hook overrides)
          runner.registerOutput({
            name: actualChildName,
            extends: parentName,
          })

          // Resolve inheritance
          const resolved = runner.resolveInheritance(
            runner.getOutputPlugins().find((p) => p.name === actualChildName)!,
          )

          // Child should inherit parent's hooks
          expect(resolved.buildStart).toBeDefined()
          expect(resolved.buildEnd).toBeDefined()
        },
      ),
      { numRuns: 100 },
    )
  })

  it('should override parent hooks when child provides implementation', () => {
    /**
     * **Feature: plugin-architecture, Property 12: Plugin inheritance resolution**
     * **Validates: Requirements 28.2**
     *
     * For any parent plugin with hooks, a child plugin that provides
     * its own implementation should override the parent's hooks
     */
    fc.assert(
      fc.property(
        pluginNameArb,
        pluginNameArb.filter((n) => n !== ''),
        (parentName, childName) => {
          const actualChildName = parentName === childName ? `${childName}_child` : childName

          const runner = new PluginRunner({ plugins: [] })
          let parentHookCalled = false
          let childHookCalled = false

          // Register parent plugin
          runner.registerOutput({
            name: parentName,
            buildStart: () => {
              parentHookCalled = true
            },
          })

          // Register child plugin with override
          runner.registerOutput({
            name: actualChildName,
            extends: parentName,
            buildStart: () => {
              childHookCalled = true
            },
          })

          // Resolve inheritance
          const resolved = runner.resolveInheritance(
            runner.getOutputPlugins().find((p) => p.name === actualChildName)!,
          )

          // Execute the resolved hook
          if (resolved.buildStart != null) {
            resolved.buildStart(runner.getContext(), { plugins: [], mode: 'normal' })
          }

          // Child hook should be called, not parent
          expect(childHookCalled).toBe(true)
          expect(parentHookCalled).toBe(false)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('should merge configurations with child taking precedence', () => {
    /**
     * **Feature: plugin-architecture, Property 12: Plugin inheritance resolution**
     * **Validates: Requirements 28.4**
     *
     * For any parent and child plugins with configurations,
     * child configurations should take precedence over parent
     */
    fc.assert(
      fc.property(
        pluginNameArb,
        pluginNameArb.filter((n) => n !== ''),
        fc.integer({ min: 1, max: 100 }),
        fc.integer({ min: 101, max: 200 }),
        (parentName, childName, parentPriority, childPriority) => {
          const actualChildName = parentName === childName ? `${childName}_child` : childName

          const runner = new PluginRunner({ plugins: [] })

          // Register parent plugin with priority
          runner.registerOutput({
            name: parentName,
            priority: parentPriority,
            outputs: [
              { id: 'parent-out', category: 'cli', tool: 'test', targetType: 'workspace', path: '/parent' },
            ],
          })

          // Register child plugin with different priority and outputs
          runner.registerOutput({
            name: actualChildName,
            extends: parentName,
            priority: childPriority,
            outputs: [
              { id: 'child-out', category: 'ide', tool: 'test', targetType: 'globalConfig', path: '/child' },
            ],
          })

          // Resolve inheritance
          const resolved = runner.resolveInheritance(
            runner.getOutputPlugins().find((p) => p.name === actualChildName)!,
          )

          // Child priority should take precedence
          expect(resolved.priority).toBe(childPriority)
          // Child outputs should take precedence
          expect(resolved.outputs).toHaveLength(1)
          expect(resolved.outputs?.[0]?.id).toBe('child-out')
        },
      ),
      { numRuns: 100 },
    )
  })

  it('should detect circular inheritance and throw error', () => {
    /**
     * **Feature: plugin-architecture, Property 12: Plugin inheritance resolution**
     * **Validates: Requirements 28.5**
     *
     * For any set of plugins with circular inheritance,
     * resolveInheritance should throw CircularInheritanceError
     */
    const runner = new PluginRunner({ plugins: [] })

    // Create plugins with circular inheritance: A extends B, B extends C, C extends A
    runner.registerOutput({ name: 'plugin-a', extends: 'plugin-c' })
    runner.registerOutput({ name: 'plugin-b', extends: 'plugin-a' })
    runner.registerOutput({ name: 'plugin-c', extends: 'plugin-b' })

    const pluginA = runner.getOutputPlugins().find((p) => p.name === 'plugin-a')!

    expect(() => runner.resolveInheritance(pluginA)).toThrow(CircularInheritanceError)
  })

  it('should handle multi-level inheritance chain', () => {
    /**
     * **Feature: plugin-architecture, Property 12: Plugin inheritance resolution**
     * **Validates: Requirements 28.1**
     *
     * For any chain of plugins A -> B -> C (C extends B, B extends A),
     * C should inherit from both B and A
     */
    const runner = new PluginRunner({ plugins: [] })
    const hookCalls: string[] = []

    // Grandparent plugin
    runner.registerOutput({
      name: 'grandparent',
      buildStart: () => {
        hookCalls.push('grandparent-buildStart')
      },
      buildEnd: () => {
        hookCalls.push('grandparent-buildEnd')
      },
    })

    // Parent plugin (extends grandparent, overrides buildStart)
    runner.registerOutput({
      name: 'parent',
      extends: 'grandparent',
      buildStart: () => {
        hookCalls.push('parent-buildStart')
      },
    })

    // Child plugin (extends parent, no overrides)
    runner.registerOutput({
      name: 'child',
      extends: 'parent',
    })

    const resolved = runner.resolveInheritance(
      runner.getOutputPlugins().find((p) => p.name === 'child')!,
    )

    // Execute hooks
    if (resolved.buildStart != null) {
      resolved.buildStart(runner.getContext(), { plugins: [], mode: 'normal' })
    }
    if (resolved.buildEnd != null) {
      resolved.buildEnd(runner.getContext(), { success: true, errors: [] })
    }

    // Parent's buildStart should be used (overrides grandparent)
    // Grandparent's buildEnd should be used (not overridden)
    expect(hookCalls).toContain('parent-buildStart')
    expect(hookCalls).toContain('grandparent-buildEnd')
    expect(hookCalls).not.toContain('grandparent-buildStart')
  })

  it('should merge dependencies from parent and child', () => {
    /**
     * **Feature: plugin-architecture, Property 12: Plugin inheritance resolution**
     * **Validates: Requirements 28.4**
     *
     * For any parent and child plugins with dependencies,
     * the resolved plugin should have merged dependencies
     */
    const runner = new PluginRunner({ plugins: [] })

    runner.registerOutput({
      name: 'parent',
      dependencies: ['dep-a', 'dep-b'],
    })

    runner.registerOutput({
      name: 'child',
      extends: 'parent',
      dependencies: ['dep-c', 'dep-a'], // dep-a is duplicate
    })

    const resolved = runner.resolveInheritance(
      runner.getOutputPlugins().find((p) => p.name === 'child')!,
    )

    // Dependencies should be merged and deduplicated
    expect(resolved.dependencies).toContain('dep-a')
    expect(resolved.dependencies).toContain('dep-b')
    expect(resolved.dependencies).toContain('dep-c')
    // Should be deduplicated
    expect(resolved.dependencies?.filter((d) => d === 'dep-a').length).toBe(1)
  })

  it('should use parent configuration when child does not specify', () => {
    /**
     * **Feature: plugin-architecture, Property 12: Plugin inheritance resolution**
     * **Validates: Requirements 28.3, 28.4**
     *
     * For any parent plugin with configurations,
     * child should inherit them when not overriding
     */
    fc.assert(
      fc.property(
        pluginNameArb,
        pluginNameArb.filter((n) => n !== ''),
        fc.integer({ min: 1, max: 100 }),
        (parentName, childName, parentPriority) => {
          const actualChildName = parentName === childName ? `${childName}_child` : childName

          const runner = new PluginRunner({ plugins: [] })

          runner.registerOutput({
            name: parentName,
            priority: parentPriority,
            filenameTransform: [{ pattern: /\.md$/, replacement: '.mdc' }],
          })

          runner.registerOutput({
            name: actualChildName,
            extends: parentName,
            // No priority or filenameTransform specified
          })

          const resolved = runner.resolveInheritance(
            runner.getOutputPlugins().find((p) => p.name === actualChildName)!,
          )

          // Should inherit parent's priority and filenameTransform
          expect(resolved.priority).toBe(parentPriority)
          expect(resolved.filenameTransform).toHaveLength(1)
        },
      ),
      { numRuns: 100 },
    )
  })
})


describe('Property 1: Plugin registration order execution (InputPlugin/OutputPlugin)', () => {
  /**
   * **Feature: plugin-architecture, Property 1: Plugin registration order execution**
   * **Validates: Requirements 5.1, 5.5, 36.1, 36.2**
   *
   * For any plugin list, InputPlugins should execute before OutputPlugins,
   * and within each phase, plugins should execute in priority order
   */

  it('should execute InputPlugins before OutputPlugins', () => {
    fc.assert(
      fc.asyncProperty(
        uniquePluginNamesArb,
        uniquePluginNamesArb,
        async (inputNames, outputNames) => {
          // Ensure unique names across both lists
          const usedNames = new Set(inputNames)
          const uniqueOutputNames = outputNames
            .map((n) => usedNames.has(n) ? `${n}_output` : n)
            .filter((n, i, arr) => arr.indexOf(n) === i)

          if (uniqueOutputNames.length === 0) {
            return true
          }

          const executionOrder: string[] = []
          const runner = new PluginRunner({ plugins: [] })

          // Register InputPlugins
          for (const name of inputNames) {
            runner.registerInput({
              name,
              scan: () => {
                executionOrder.push(`input:${name}`)
                return []
              },
            })
          }

          // Register OutputPlugins
          for (const name of uniqueOutputNames) {
            runner.registerOutput({
              name,
              buildStart: () => {
                executionOrder.push(`output:${name}`)
              },
            })
          }

          await runner.runFull()

          // All input plugins should execute before any output plugin
          const inputExecutions = executionOrder.filter((e) => e.startsWith('input:'))
          const outputExecutions = executionOrder.filter((e) => e.startsWith('output:'))

          // Find the last input execution index and first output execution index
          const lastInputIndex = executionOrder.findLastIndex((e) => e.startsWith('input:'))
          const firstOutputIndex = executionOrder.findIndex((e) => e.startsWith('output:'))

          if (inputExecutions.length > 0 && outputExecutions.length > 0) {
            expect(lastInputIndex).toBeLessThan(firstOutputIndex)
          }

          return true
        },
      ),
      { numRuns: 100 },
    )
  })

  it('should execute InputPlugins in priority order', () => {
    fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            name: pluginNameArb,
            priority: fc.integer({ min: 1, max: 1000 }),
          }),
          { minLength: 2, maxLength: 8 },
        ).map((plugins) => {
          const seen = new Set<string>()
          return plugins.filter((p) => {
            if (seen.has(p.name)) {
              return false
            }
            seen.add(p.name)
            return true
          })
        }).filter((plugins) => plugins.length >= 2),
        async (pluginConfigs) => {
          const executionOrder: string[] = []
          const runner = new PluginRunner({ plugins: [] })

          for (const config of pluginConfigs) {
            runner.registerInput({
              name: config.name,
              priority: config.priority,
              scan: () => {
                executionOrder.push(config.name)
                return []
              },
            })
          }

          await runner.runFull()

          // Verify execution order matches priority order
          const sortedByPriority = [...pluginConfigs]
            .sort((a, b) => a.priority - b.priority)
            .map((p) => p.name)

          expect(executionOrder).toEqual(sortedByPriority)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('should execute OutputPlugins in priority order after InputPlugins', () => {
    fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            name: pluginNameArb,
            priority: fc.integer({ min: 1, max: 1000 }),
          }),
          { minLength: 2, maxLength: 8 },
        ).map((plugins) => {
          const seen = new Set<string>()
          return plugins.filter((p) => {
            if (seen.has(p.name)) {
              return false
            }
            seen.add(p.name)
            return true
          })
        }).filter((plugins) => plugins.length >= 2),
        async (pluginConfigs) => {
          const executionOrder: string[] = []
          const runner = new PluginRunner({ plugins: [] })

          for (const config of pluginConfigs) {
            runner.registerOutput({
              name: config.name,
              priority: config.priority,
              buildStart: () => {
                executionOrder.push(config.name)
              },
            })
          }

          await runner.runFull()

          // Verify execution order matches priority order
          const sortedByPriority = [...pluginConfigs]
            .sort((a, b) => a.priority - b.priority)
            .map((p) => p.name)

          expect(executionOrder).toEqual(sortedByPriority)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('should collect InputBundles from InputPlugins and make them available to OutputPlugins', () => {
    fc.assert(
      fc.asyncProperty(
        fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1, maxLength: 5 }),
        async (bundleContents) => {
          const runner = new PluginRunner({ plugins: [] })
          let receivedBundles: InputBundle[] = []

          // Register InputPlugin that produces bundles
          runner.registerInput({
            name: 'bundle-producer',
            scan: () => {
              return bundleContents.map((content, i) => ({
                type: InputType.MEMORY_PROMPT,
                path: `file-${i}.md`,
                content,
              }))
            },
          })

          // Register OutputPlugin that reads bundles
          runner.registerOutput({
            name: 'bundle-consumer',
            buildStart: (ctx) => {
              receivedBundles = ctx.getAllInputBundles()
            },
          })

          const result = await runner.runFull()

          expect(result.inputBundlesCollected).toBe(bundleContents.length)
          expect(receivedBundles.length).toBe(bundleContents.length)

          // Verify bundle contents match
          for (let i = 0; i < bundleContents.length; i++) {
            expect(receivedBundles[i]?.content).toBe(bundleContents[i])
          }
        },
      ),
      { numRuns: 100 },
    )
  })

  it('should execute all lifecycle hooks in correct order for OutputPlugins', async () => {
    /**
     * **Feature: plugin-architecture, Property 1: Plugin registration order execution**
     * **Validates: Requirements 5.1, 5.2, 5.5**
     */
    const hooks: string[] = []
    const runner = new PluginRunner({ plugins: [] })

    runner.registerOutput({
      name: 'lifecycle-test',
      beforeCleanup: () => {
        hooks.push('beforeCleanup')
      },
      buildStart: () => {
        hooks.push('buildStart')
      },
      generateBundle: () => {
        hooks.push('generateBundle')
      },
      writeBundle: () => {
        hooks.push('writeBundle')
      },
      afterCleanup: () => {
        hooks.push('afterCleanup')
      },
      buildEnd: () => {
        hooks.push('buildEnd')
      },
    })

    await runner.runFull()

    expect(hooks).toEqual([
      'beforeCleanup',
      'buildStart',
      'generateBundle',
      'writeBundle',
      'afterCleanup',
      'buildEnd',
    ])
  })

  it('should skip dependent OutputPlugins when dependency fails', async () => {
    /**
     * **Feature: plugin-architecture, Property 1: Plugin registration order execution**
     * **Validates: Requirements 9.4**
     */
    const executedPlugins: string[] = []
    const runner = new PluginRunner({ plugins: [] })

    runner.registerOutput({
      name: 'base-plugin',
      buildStart: () => {
        executedPlugins.push('base-plugin')
        throw new Error('Base plugin failed')
      },
    })

    runner.registerOutput({
      name: 'dependent-plugin',
      dependencies: ['base-plugin'],
      buildStart: () => {
        executedPlugins.push('dependent-plugin')
      },
    })

    runner.registerOutput({
      name: 'independent-plugin',
      buildStart: () => {
        executedPlugins.push('independent-plugin')
      },
    })

    const result = await runner.runFull()

    expect(result.success).toBe(false)
    expect(executedPlugins).toContain('base-plugin')
    expect(executedPlugins).toContain('independent-plugin')
    expect(executedPlugins).not.toContain('dependent-plugin')

    const dependentState = runner.getPluginState('dependent-plugin')
    expect(dependentState?.status).toBe('skipped')
  })

  it('should report empty plugins in result', async () => {
    /**
     * **Feature: plugin-architecture, Property 1: Plugin registration order execution**
     * **Validates: Requirements 31.1, 31.4**
     */
    const runner = new PluginRunner({ plugins: [] })

    runner.registerOutput({
      name: 'empty-plugin',
      buildStart: () => {
        // Does nothing, produces no output
      },
    })

    runner.registerOutput({
      name: 'producing-plugin',
      generateBundle: (ctx) => {
        ctx.emitFile({
          type: 'asset',
          fileName: 'test.md',
          source: 'content',
        })
      },
    })

    const result = await runner.runFull()

    expect(result.emptyPlugins).toContain('empty-plugin')
    expect(result.emptyPlugins).not.toContain('producing-plugin')
  })

  it('should handle errors based on onError config in runFull', async () => {
    /**
     * **Feature: plugin-architecture, Property 1: Plugin registration order execution**
     * **Validates: Requirements 10.2, 10.3**
     */
    const executedPlugins: string[] = []

    // Test with onError: 'stop'
    const runnerStop = new PluginRunner({
      plugins: [],
      options: { onError: 'stop' },
    })

    runnerStop.registerOutput({
      name: 'plugin-1',
      buildStart: () => {
        executedPlugins.push('plugin-1')
        throw new Error('Plugin 1 failed')
      },
    })

    runnerStop.registerOutput({
      name: 'plugin-2',
      buildStart: () => {
        executedPlugins.push('plugin-2')
      },
    })

    const resultStop = await runnerStop.runFull()

    expect(resultStop.success).toBe(false)
    expect(executedPlugins).toEqual(['plugin-1'])
    expect(executedPlugins).not.toContain('plugin-2')
  })

  it('should capture errors with plugin and hook context', async () => {
    /**
     * **Feature: plugin-architecture, Property 1: Plugin registration order execution**
     * **Validates: Requirements 10.1**
     */
    const runner = new PluginRunner({ plugins: [] })

    runner.registerOutput({
      name: 'failing-plugin',
      buildStart: () => {
        throw new Error('Test error message')
      },
    })

    const result = await runner.runFull()

    expect(result.success).toBe(false)
    expect(result.errors.length).toBe(1)
    expect(result.errors[0]).toContain('failing-plugin')
    expect(result.errors[0]).toContain('buildStart')
    expect(result.errors[0]).toContain('Test error message')
  })
})

// Import InputType for the tests
import { InputType } from './types'
import type { InputBundle } from './types'
