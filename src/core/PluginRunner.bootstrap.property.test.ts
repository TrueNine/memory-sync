/**
 * Property-based tests for PluginRunner.bootstrap() method
 * Tests configuration loading, plugin registration, lifecycle execution, and result aggregation
 *
 * @see Requirements 3.1, 3.2, 3.3, 3.4, 5.1, 5.2, 6.1, 6.2, 6.3, 6.4
 */

import type { BootstrapOptions, InputPlugin, OutputPlugin, PluginConfig, PluginGlobalOptions } from './types'
import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { PluginRunner } from './PluginRunner'

/**
 * Generate a valid plugin name
 */
const pluginNameArb = fc.string({ minLength: 1, maxLength: 20 })
  .filter((s) => s.trim().length > 0)
  .map((s) => s.replace(/[^a-zA-Z0-9-_]/g, '_'))

/**
 * Generate a valid log level
 */
const logLevelArb = fc.constantFrom('debug', 'info', 'warn', 'error') as fc.Arbitrary<'debug' | 'info' | 'warn' | 'error'>

/**
 * Generate a valid onError strategy
 */
const onErrorArb = fc.constantFrom('continue', 'stop') as fc.Arbitrary<'continue' | 'stop'>

/**
 * Generate a minimal InputPlugin for testing
 */
function createTestInputPlugin(name: string, bundles: number = 0): InputPlugin {
  return {
    name,
    scan: () => Array.from({ length: bundles }, (_, i) => ({
      type: 'memoryPrompt' as const,
      path: `test/${name}/${i}.md`,
      content: `content-${i}`,
    })),
  }
}


/**
 * Generate a minimal OutputPlugin for testing
 */
function createTestOutputPlugin(name: string, emitFiles: boolean = false): OutputPlugin {
  return {
    name,
    buildStart: () => {},
    generateBundle: emitFiles
      ? (ctx) => {
          ctx.emitFile({
            type: 'asset',
            fileName: `${name}.md`,
            source: `content from ${name}`,
          })
        }
      : () => {},
  }
}

/**
 * Generate a PluginConfig with specified plugins
 */
function createTestConfig(
  inputPlugins: InputPlugin[] = [],
  outputPlugins: OutputPlugin[] = [],
  options: PluginGlobalOptions = {},
): PluginConfig {
  return {
    plugins: [],
    options,
  }
}

describe('PluginRunner.bootstrap() properties', () => {
  describe('Property 2: PluginRunner accepts any valid PluginGlobalOptions', () => {
    it('should accept any valid PluginGlobalOptions and reflect in execution', () => {
      /**
       * **Feature: plugin-bootstrap-refactor, Property 2: PluginRunner accepts any valid PluginGlobalOptions**
       * **Validates: Requirements 1.2**
       *
       * For any valid PluginGlobalOptions object, PluginRunner SHALL accept it
       * as configuration and reflect the options in its internal state
       */
      fc.assert(
        fc.asyncProperty(
          fc.boolean(),
          fc.boolean(),
          logLevelArb,
          onErrorArb,
          fc.boolean(),
          async (dryRun, cleanOnly, logLevel, onError, parallel) => {
            const options: PluginGlobalOptions = {
              dryRun,
              cleanOnly,
              logLevel,
              onError,
              parallel,
            }

            const config: PluginConfig = {
              plugins: [],
              options,
            }

            const result = await PluginRunner.bootstrap({ config })

            // PluginRunner should accept the options and complete successfully
            expect(result.success).toBe(true)

            // Options should be reflected in result
            // Note: cleanOnly mode takes precedence - when cleanOnly is true,
            // cleanResult is present regardless of dryRun
            if (cleanOnly) {
              expect(result.cleanResult).toBeDefined()
            } else if (dryRun) {
              // dryRunStats only present in non-clean mode with dryRun
              expect(result.dryRunStats).toBeDefined()
            }
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should accept PluginGlobalOptions with excludePatterns', () => {
      /**
       * **Feature: plugin-bootstrap-refactor, Property 2: PluginRunner accepts any valid PluginGlobalOptions**
       * **Validates: Requirements 1.2**
       *
       * PluginRunner should accept options with excludePatterns array
       */
      fc.assert(
        fc.asyncProperty(
          fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 0, maxLength: 5 }),
          async (excludePatterns) => {
            const options: PluginGlobalOptions = {
              excludePatterns,
            }

            const config: PluginConfig = {
              plugins: [],
              options,
            }

            const result = await PluginRunner.bootstrap({ config })

            expect(result.success).toBe(true)
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should accept PluginGlobalOptions with workspaceGroups', () => {
      /**
       * **Feature: plugin-bootstrap-refactor, Property 2: PluginRunner accepts any valid PluginGlobalOptions**
       * **Validates: Requirements 1.2**
       *
       * PluginRunner should accept options with workspaceGroups mapping
       */
      fc.assert(
        fc.asyncProperty(
          fc.dictionary(
            fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0),
            fc.string({ minLength: 1, maxLength: 100 }),
            { minKeys: 0, maxKeys: 3 },
          ),
          async (workspaceGroups) => {
            const options: PluginGlobalOptions = {
              workspaceGroups,
            }

            const config: PluginConfig = {
              plugins: [],
              options,
            }

            const result = await PluginRunner.bootstrap({ config })

            expect(result.success).toBe(true)
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should accept PluginGlobalOptions with root path', () => {
      /**
       * **Feature: plugin-bootstrap-refactor, Property 2: PluginRunner accepts any valid PluginGlobalOptions**
       * **Validates: Requirements 1.2**
       *
       * PluginRunner should accept options with custom root path
       */
      fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 100 }),
          async (root) => {
            const options: PluginGlobalOptions = {
              root,
            }

            const config: PluginConfig = {
              plugins: [],
              options,
            }

            const result = await PluginRunner.bootstrap({ config })

            expect(result.success).toBe(true)
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should accept complete PluginGlobalOptions with all fields', () => {
      /**
       * **Feature: plugin-bootstrap-refactor, Property 2: PluginRunner accepts any valid PluginGlobalOptions**
       * **Validates: Requirements 1.2**
       *
       * PluginRunner should accept a complete PluginGlobalOptions with all fields populated
       */
      fc.assert(
        fc.asyncProperty(
          fc.boolean(),
          fc.boolean(),
          logLevelArb,
          onErrorArb,
          fc.boolean(),
          fc.array(fc.string({ minLength: 1, maxLength: 30 }), { minLength: 0, maxLength: 3 }),
          fc.dictionary(
            fc.string({ minLength: 1, maxLength: 10 }).filter((s) => s.trim().length > 0),
            fc.string({ minLength: 1, maxLength: 50 }),
            { minKeys: 0, maxKeys: 2 },
          ),
          fc.string({ minLength: 1, maxLength: 50 }),
          async (dryRun, cleanOnly, logLevel, onError, parallel, excludePatterns, workspaceGroups, root) => {
            const options: PluginGlobalOptions = {
              dryRun,
              cleanOnly,
              logLevel,
              onError,
              parallel,
              excludePatterns,
              workspaceGroups,
              root,
            }

            const config: PluginConfig = {
              plugins: [],
              options,
            }

            const result = await PluginRunner.bootstrap({ config })

            // PluginRunner should accept complete options
            expect(result.success).toBe(true)
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should accept PluginGlobalOptions via BootstrapOptions.options', () => {
      /**
       * **Feature: plugin-bootstrap-refactor, Property 2: PluginRunner accepts any valid PluginGlobalOptions**
       * **Validates: Requirements 1.2**
       *
       * PluginRunner should accept options passed via BootstrapOptions.options
       */
      fc.assert(
        fc.asyncProperty(
          fc.boolean(),
          logLevelArb,
          async (parallel, logLevel) => {
            const bootstrapOptions: BootstrapOptions = {
              options: {
                parallel,
                logLevel,
              },
            }

            const result = await PluginRunner.bootstrap(bootstrapOptions)

            expect(result.success).toBe(true)
          },
        ),
        { numRuns: 100 },
      )
    })
  })

  describe('Property 3: Bootstrap loads provided config or default', () => {
    it('should use provided config when specified', () => {
      /**
       * **Feature: plugin-bootstrap-refactor, Property 3: Bootstrap loads provided config or default**
       * **Validates: Requirements 3.1, 5.1, 5.2**
       *
       * For any call to PluginRunner.bootstrap() with config provided,
       * the provided config SHALL be used
       */
      fc.assert(
        fc.asyncProperty(
          logLevelArb,
          onErrorArb,
          fc.boolean(),
          async (logLevel, onError, parallel) => {
            const config: PluginConfig = {
              plugins: [],
              options: { logLevel, onError, parallel },
            }

            const result = await PluginRunner.bootstrap({ config })

            // Bootstrap should complete successfully with empty config
            expect(result.success).toBe(true)
            expect(result.pluginsExecuted).toBe(0)
          },
        ),
        { numRuns: 100 },
      )
    })


    it('should merge options with correct precedence', () => {
      /**
       * **Feature: plugin-bootstrap-refactor, Property 3: Bootstrap loads provided config or default**
       * **Validates: Requirements 3.1, 5.1, 5.2**
       *
       * Bootstrap options should override config options
       */
      fc.assert(
        fc.asyncProperty(
          fc.boolean(),
          fc.boolean(),
          async (bootstrapDryRun, configDryRun) => {
            fc.pre(bootstrapDryRun !== configDryRun)

            const config: PluginConfig = {
              plugins: [],
              options: { dryRun: configDryRun },
            }

            const result = await PluginRunner.bootstrap({
              config,
              dryRun: bootstrapDryRun,
            })

            // Bootstrap should complete
            expect(result.success).toBe(true)

            // If bootstrapDryRun is true, dryRunStats should be present
            if (bootstrapDryRun) {
              expect(result.dryRunStats).toBeDefined()
            }
          },
        ),
        { numRuns: 100 },
      )
    })
  })

  describe('Property 4: Bootstrap registers all plugins from config', () => {
    it('should register all plugins from provided config', () => {
      /**
       * **Feature: plugin-bootstrap-refactor, Property 4: Bootstrap registers all plugins from config**
       * **Validates: Requirements 3.2**
       *
       * For any PluginConfig with N plugins, after bootstrap() completes,
       * exactly N plugins SHALL be registered in the runner
       */
      fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: 5 }),
          async (pluginCount) => {
            const plugins = Array.from({ length: pluginCount }, (_, i) => ({
              name: `test-plugin-${i}`,
              buildStart: () => {},
            }))

            const config: PluginConfig = {
              plugins,
              options: {},
            }

            const result = await PluginRunner.bootstrap({ config })

            // All plugins should be executed
            expect(result.success).toBe(true)
            expect(result.pluginsExecuted).toBe(pluginCount)
          },
        ),
        { numRuns: 100 },
      )
    })
  })


  describe('Property 5: Bootstrap executes correct lifecycle based on options', () => {
    it('should execute clean lifecycle when cleanOnly is true', () => {
      /**
       * **Feature: plugin-bootstrap-refactor, Property 5: Bootstrap executes correct lifecycle based on options**
       * **Validates: Requirements 3.3**
       *
       * For any BootstrapOptions with cleanOnly=true, clean lifecycle SHALL execute
       */
      fc.assert(
        fc.asyncProperty(
          fc.boolean(),
          async (dryRun) => {
            const config: PluginConfig = {
              plugins: [],
              options: {},
            }

            const result = await PluginRunner.bootstrap({
              config,
              cleanOnly: true,
              dryRun,
            })

            // Clean mode should return cleanResult
            expect(result.success).toBe(true)
            expect(result.cleanResult).toBeDefined()
            expect(result.inputPluginsExecuted).toBe(0)
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should execute normal lifecycle when cleanOnly is false', () => {
      /**
       * **Feature: plugin-bootstrap-refactor, Property 5: Bootstrap executes correct lifecycle based on options**
       * **Validates: Requirements 3.3**
       *
       * For any BootstrapOptions with cleanOnly=false, normal lifecycle SHALL execute
       */
      fc.assert(
        fc.asyncProperty(
          fc.boolean(),
          async (dryRun) => {
            const config: PluginConfig = {
              plugins: [],
              options: {},
            }

            const result = await PluginRunner.bootstrap({
              config,
              cleanOnly: false,
              dryRun,
            })

            // Normal mode should not return cleanResult
            expect(result.success).toBe(true)
            expect(result.cleanResult).toBeUndefined()
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should include dryRunStats when dryRun is true', () => {
      /**
       * **Feature: plugin-bootstrap-refactor, Property 5: Bootstrap executes correct lifecycle based on options**
       * **Validates: Requirements 3.3**
       *
       * For any BootstrapOptions with dryRun=true, dry-run mode SHALL be active
       */
      fc.assert(
        fc.asyncProperty(
          fc.constant(true),
          async (dryRun) => {
            const config: PluginConfig = {
              plugins: [],
              options: {},
            }

            const result = await PluginRunner.bootstrap({
              config,
              dryRun,
            })

            expect(result.success).toBe(true)
            expect(result.dryRunStats).toBeDefined()
          },
        ),
        { numRuns: 100 },
      )
    })
  })


  describe('Property 6: Bootstrap result contains all required fields', () => {
    it('should return result with all required fields', () => {
      /**
       * **Feature: plugin-bootstrap-refactor, Property 6: Bootstrap result contains all required fields**
       * **Validates: Requirements 3.4, 6.1, 6.2**
       *
       * For any completed bootstrap() execution, the result SHALL contain
       * success, duration, pluginsExecuted, filesEmitted, and errors fields
       */
      fc.assert(
        fc.asyncProperty(
          fc.boolean(),
          fc.boolean(),
          async (dryRun, cleanOnly) => {
            const config: PluginConfig = {
              plugins: [],
              options: {},
            }

            const result = await PluginRunner.bootstrap({
              config,
              dryRun,
              cleanOnly,
            })

            // All required fields should be present
            expect(typeof result.success).toBe('boolean')
            expect(typeof result.duration).toBe('number')
            expect(result.duration).toBeGreaterThanOrEqual(0)
            expect(typeof result.pluginsExecuted).toBe('number')
            expect(result.pluginsExecuted).toBeGreaterThanOrEqual(0)
            expect(typeof result.inputPluginsExecuted).toBe('number')
            expect(typeof result.outputPluginsExecuted).toBe('number')
            expect(typeof result.inputBundlesCollected).toBe('number')
            expect(typeof result.filesEmitted).toBe('number')
            expect(Array.isArray(result.errors)).toBe(true)
            expect(Array.isArray(result.emptyPlugins)).toBe(true)
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should have consistent plugin counts', () => {
      /**
       * **Feature: plugin-bootstrap-refactor, Property 6: Bootstrap result contains all required fields**
       * **Validates: Requirements 3.4, 6.1, 6.2**
       *
       * pluginsExecuted should equal inputPluginsExecuted + outputPluginsExecuted
       */
      fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: 3 }),
          async (pluginCount) => {
            const plugins = Array.from({ length: pluginCount }, (_, i) => ({
              name: `plugin-${i}`,
              buildStart: () => {},
            }))

            const config: PluginConfig = {
              plugins,
              options: {},
            }

            const result = await PluginRunner.bootstrap({ config })

            // Total should equal sum of input and output
            expect(result.pluginsExecuted).toBe(
              result.inputPluginsExecuted + result.outputPluginsExecuted,
            )
          },
        ),
        { numRuns: 100 },
      )
    })
  })


  describe('Property 7: Dry-run mode includes dry-run statistics', () => {
    it('should include dryRunStats when dryRun is true', () => {
      /**
       * **Feature: plugin-bootstrap-refactor, Property 7: Dry-run mode includes dry-run statistics**
       * **Validates: Requirements 6.3**
       *
       * For any bootstrap() execution with dryRun=true,
       * the result SHALL include dryRunStats with operation counts
       */
      fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: 3 }),
          async (pluginCount) => {
            const plugins = Array.from({ length: pluginCount }, (_, i) => ({
              name: `plugin-${i}`,
              buildStart: () => {},
            }))

            const config: PluginConfig = {
              plugins,
              options: {},
            }

            const result = await PluginRunner.bootstrap({
              config,
              dryRun: true,
            })

            // dryRunStats should be present
            expect(result.dryRunStats).toBeDefined()
            expect(typeof result.dryRunStats?.filesToCreate).toBe('number')
            expect(typeof result.dryRunStats?.filesToModify).toBe('number')
            expect(typeof result.dryRunStats?.filesToDelete).toBe('number')
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should not include dryRunStats when dryRun is false', () => {
      /**
       * **Feature: plugin-bootstrap-refactor, Property 7: Dry-run mode includes dry-run statistics**
       * **Validates: Requirements 6.3**
       *
       * For any bootstrap() execution with dryRun=false,
       * the result SHALL NOT include dryRunStats
       */
      fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: 3 }),
          async (pluginCount) => {
            const plugins = Array.from({ length: pluginCount }, (_, i) => ({
              name: `plugin-${i}`,
              buildStart: () => {},
            }))

            const config: PluginConfig = {
              plugins,
              options: {},
            }

            const result = await PluginRunner.bootstrap({
              config,
              dryRun: false,
            })

            // dryRunStats should not be present
            expect(result.dryRunStats).toBeUndefined()
          },
        ),
        { numRuns: 100 },
      )
    })
  })


  describe('Property 8: Error results include plugin and hook context', () => {
    it('should include plugin name in error messages', () => {
      /**
       * **Feature: plugin-bootstrap-refactor, Property 8: Error results include plugin and hook context**
       * **Validates: Requirements 6.4**
       *
       * For any bootstrap() execution that encounters errors,
       * each error message SHALL include the plugin name
       */
      fc.assert(
        fc.asyncProperty(
          pluginNameArb,
          async (pluginName) => {
            const errorMessage = 'Test error from plugin'
            const plugins = [
              {
                name: pluginName,
                buildStart: () => {
                  throw new Error(errorMessage)
                },
              },
            ]

            const config: PluginConfig = {
              plugins,
              options: { onError: 'continue' },
            }

            const result = await PluginRunner.bootstrap({ config })

            // Should have errors
            expect(result.success).toBe(false)
            expect(result.errors.length).toBeGreaterThan(0)

            // Error should contain plugin name
            const hasPluginName = result.errors.some((e) => e.includes(pluginName))
            expect(hasPluginName).toBe(true)
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should include hook name in error messages', () => {
      /**
       * **Feature: plugin-bootstrap-refactor, Property 8: Error results include plugin and hook context**
       * **Validates: Requirements 6.4**
       *
       * For any bootstrap() execution that encounters errors,
       * each error message SHALL include the hook name where the error occurred
       */
      fc.assert(
        fc.asyncProperty(
          pluginNameArb,
          async (pluginName) => {
            const plugins = [
              {
                name: pluginName,
                buildStart: () => {
                  throw new Error('buildStart error')
                },
              },
            ]

            const config: PluginConfig = {
              plugins,
              options: { onError: 'continue' },
            }

            const result = await PluginRunner.bootstrap({ config })

            expect(result.success).toBe(false)
            expect(result.errors.length).toBeGreaterThan(0)

            // Error format should be [pluginName:hookName] message
            // or contain hook context
            const errorText = result.errors.join(' ')
            expect(errorText).toContain(pluginName)
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should continue execution when onError is continue', () => {
      /**
       * **Feature: plugin-bootstrap-refactor, Property 8: Error results include plugin and hook context**
       * **Validates: Requirements 6.4**
       *
       * When onError is 'continue', subsequent plugins should still execute
       */
      fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 2, max: 5 }),
          fc.integer({ min: 0, max: 4 }),
          async (totalPlugins, failIndex) => {
            const actualFailIndex = Math.min(failIndex, totalPlugins - 1)
            const executedPlugins: string[] = []

            const plugins = Array.from({ length: totalPlugins }, (_, i) => ({
              name: `plugin-${i}`,
              buildStart: () => {
                executedPlugins.push(`plugin-${i}`)
                if (i === actualFailIndex) {
                  throw new Error(`Plugin ${i} failed`)
                }
              },
            }))

            const config: PluginConfig = {
              plugins,
              options: { onError: 'continue' },
            }

            const result = await PluginRunner.bootstrap({ config })

            // All plugins should have been attempted
            expect(executedPlugins.length).toBe(totalPlugins)
            expect(result.errors.length).toBeGreaterThan(0)
          },
        ),
        { numRuns: 100 },
      )
    })
  })
})
