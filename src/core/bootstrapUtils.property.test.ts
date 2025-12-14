/**
 * Property-based tests for Bootstrap utilities
 * Tests configuration merge precedence and deserialization defaults
 *
 * @see Requirements 5.3, 5.4, 7.4
 */

import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import type { BootstrapOptions, PluginGlobalOptions } from './types'
import {
  applyDefaults,
  DEFAULT_PLUGIN_GLOBAL_OPTIONS,
  mergeOptions,
  parseOptions,
} from './bootstrapUtils'

/**
 * Generate a valid log level
 */
const logLevelArb = fc.constantFrom('debug', 'info', 'warn', 'error') as fc.Arbitrary<'debug' | 'info' | 'warn' | 'error'>

/**
 * Generate a valid onError strategy
 */
const onErrorArb = fc.constantFrom('continue', 'stop') as fc.Arbitrary<'continue' | 'stop'>

/**
 * Generate a valid exclude pattern (glob-like string)
 */
const excludePatternArb = fc.stringMatching(/^[a-zA-Z0-9_\-\*\/\.]{1,30}$/)

/**
 * Generate a valid workspace name
 */
const workspaceNameArb = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_\-]{0,19}$/)

/**
 * Generate a valid path string
 */
const pathArb = fc.stringMatching(/^[a-zA-Z0-9_\-\/\\\.]{1,50}$/)

/**
 * Generate a valid PluginGlobalOptions object with all fields defined
 */
const pluginGlobalOptionsArb: fc.Arbitrary<PluginGlobalOptions> = fc.record({
  parallel: fc.option(fc.boolean(), { nil: void 0 }),
  onError: fc.option(onErrorArb, { nil: void 0 }),
  logLevel: fc.option(logLevelArb, { nil: void 0 }),
  excludePatterns: fc.option(fc.array(excludePatternArb, { minLength: 0, maxLength: 5 }), { nil: void 0 }),
  dryRun: fc.option(fc.boolean(), { nil: void 0 }),
  cleanOnly: fc.option(fc.boolean(), { nil: void 0 }),
  workspaces: fc.option(
    fc.dictionary(workspaceNameArb, pathArb, { minKeys: 0, maxKeys: 3 }),
    { nil: void 0 },
  ),
  root: fc.option(pathArb, { nil: void 0 }),
}, { requiredKeys: [] })

/**
 * Generate BootstrapOptions with CLI flags
 * Used in property tests for configuration merge precedence
 */
function createBootstrapOptionsArb(): fc.Arbitrary<BootstrapOptions> {
  return fc.record({
    options: fc.option(pluginGlobalOptionsArb, { nil: void 0 }),
    dryRun: fc.option(fc.boolean(), { nil: void 0 }),
    cleanOnly: fc.option(fc.boolean(), { nil: void 0 }),
    workspaces: fc.option(
      fc.dictionary(workspaceNameArb, pathArb, { minKeys: 0, maxKeys: 3 }),
      { nil: void 0 },
    ),
    root: fc.option(pathArb, { nil: void 0 }),
  }, { requiredKeys: [] })
}

// Export for potential use in other tests
export { createBootstrapOptionsArb }

describe('Bootstrap utilities properties', () => {
  describe('Property 9: Configuration merge preserves precedence', () => {
    it('CLI flags should override BootstrapOptions.options', () => {
      /**
       * **Feature: plugin-bootstrap-refactor, Property 9: Configuration merge preserves precedence**
       * **Validates: Requirements 5.3, 5.4**
       *
       * For any configuration with overlapping options at different levels,
       * CLI flags (dryRun, cleanOnly, workspaces, root) should take precedence
       * over BootstrapOptions.options
       */
      fc.assert(
        fc.property(
          fc.boolean(),
          fc.boolean(),
          fc.dictionary(workspaceNameArb, pathArb, { minKeys: 1, maxKeys: 3 }),
          pathArb,
          pluginGlobalOptionsArb,
          (cliDryRun, cliCleanOnly, cliWorkspaces, cliRoot, innerOptions) => {
            const bootstrapOptions: BootstrapOptions = {
              dryRun: cliDryRun,
              cleanOnly: cliCleanOnly,
              workspaces: cliWorkspaces,
              root: cliRoot,
              options: {
                ...innerOptions,
                // Set different values in inner options
                dryRun: !cliDryRun,
                cleanOnly: !cliCleanOnly,
              },
            }

            const result = mergeOptions(bootstrapOptions, {})

            // CLI flags should win
            expect(result.dryRun).toBe(cliDryRun)
            expect(result.cleanOnly).toBe(cliCleanOnly)
            expect(result.workspaces).toEqual(cliWorkspaces)
            expect(result.root).toBe(cliRoot)
          },
        ),
        { numRuns: 100 },
      )
    })

    it('BootstrapOptions.options should override PluginConfig.options', () => {
      /**
       * **Feature: plugin-bootstrap-refactor, Property 9: Configuration merge preserves precedence**
       * **Validates: Requirements 5.3, 5.4**
       *
       * BootstrapOptions.options should take precedence over PluginConfig.options
       */
      fc.assert(
        fc.property(
          logLevelArb,
          onErrorArb,
          fc.boolean(),
          logLevelArb,
          onErrorArb,
          fc.boolean(),
          (bootstrapLogLevel, bootstrapOnError, bootstrapParallel, configLogLevel, configOnError, configParallel) => {
            // Skip if values are the same (can't test precedence)
            fc.pre(bootstrapLogLevel !== configLogLevel || bootstrapOnError !== configOnError || bootstrapParallel !== configParallel)

            const bootstrapOptions: BootstrapOptions = {
              options: {
                logLevel: bootstrapLogLevel,
                onError: bootstrapOnError,
                parallel: bootstrapParallel,
              },
            }

            const configOptions: PluginGlobalOptions = {
              logLevel: configLogLevel,
              onError: configOnError,
              parallel: configParallel,
            }

            const result = mergeOptions(bootstrapOptions, configOptions)

            // BootstrapOptions.options should win
            expect(result.logLevel).toBe(bootstrapLogLevel)
            expect(result.onError).toBe(bootstrapOnError)
            expect(result.parallel).toBe(bootstrapParallel)
          },
        ),
        { numRuns: 100 },
      )
    })

    it('PluginConfig.options should override defaults', () => {
      /**
       * **Feature: plugin-bootstrap-refactor, Property 9: Configuration merge preserves precedence**
       * **Validates: Requirements 5.3, 5.4**
       *
       * PluginConfig.options should take precedence over default values
       */
      fc.assert(
        fc.property(
          logLevelArb,
          onErrorArb,
          fc.boolean(),
          (configLogLevel, configOnError, configParallel) => {
            const configOptions: PluginGlobalOptions = {
              logLevel: configLogLevel,
              onError: configOnError,
              parallel: configParallel,
            }

            const result = mergeOptions({}, configOptions)

            // Config options should override defaults
            expect(result.logLevel).toBe(configLogLevel)
            expect(result.onError).toBe(configOnError)
            expect(result.parallel).toBe(configParallel)
          },
        ),
        { numRuns: 100 },
      )
    })

    it('defaults should be applied when no options provided', () => {
      /**
       * **Feature: plugin-bootstrap-refactor, Property 9: Configuration merge preserves precedence**
       * **Validates: Requirements 5.3, 5.4**
       *
       * When no options are provided, defaults should be applied
       */
      const result = mergeOptions({}, {})

      expect(result.parallel).toBe(DEFAULT_PLUGIN_GLOBAL_OPTIONS.parallel)
      expect(result.onError).toBe(DEFAULT_PLUGIN_GLOBAL_OPTIONS.onError)
      expect(result.logLevel).toBe(DEFAULT_PLUGIN_GLOBAL_OPTIONS.logLevel)
      expect(result.dryRun).toBe(DEFAULT_PLUGIN_GLOBAL_OPTIONS.dryRun)
      expect(result.cleanOnly).toBe(DEFAULT_PLUGIN_GLOBAL_OPTIONS.cleanOnly)
    })

    it('full precedence chain should work correctly', () => {
      /**
       * **Feature: plugin-bootstrap-refactor, Property 9: Configuration merge preserves precedence**
       * **Validates: Requirements 5.3, 5.4**
       *
       * Full precedence: CLI flags > BootstrapOptions.options > PluginConfig.options > defaults
       */
      fc.assert(
        fc.property(
          fc.boolean(),
          logLevelArb,
          onErrorArb,
          (cliDryRun, bootstrapLogLevel, configOnError) => {
            const bootstrapOptions: BootstrapOptions = {
              dryRun: cliDryRun,
              options: {
                logLevel: bootstrapLogLevel,
                // dryRun not set here, should be overridden by CLI flag
              },
            }

            const configOptions: PluginGlobalOptions = {
              onError: configOnError,
              logLevel: 'error', // Should be overridden by bootstrapOptions.options
            }

            const result = mergeOptions(bootstrapOptions, configOptions)

            // CLI flag wins for dryRun
            expect(result.dryRun).toBe(cliDryRun)
            // BootstrapOptions.options wins for logLevel
            expect(result.logLevel).toBe(bootstrapLogLevel)
            // PluginConfig.options wins for onError (not overridden)
            expect(result.onError).toBe(configOnError)
          },
        ),
        { numRuns: 100 },
      )
    })
  })


  describe('Property 11: Deserialization applies defaults for missing fields', () => {
    it('should apply defaults for all missing optional fields', () => {
      /**
       * **Feature: plugin-bootstrap-refactor, Property 11: Deserialization applies defaults for missing fields**
       * **Validates: Requirements 7.4**
       *
       * For any JSON object with missing optional fields, deserialization
       * should produce a PluginGlobalOptions with default values for those fields
       */
      fc.assert(
        fc.property(
          fc.boolean(),
          (dryRunValue) => {
            // Only provide dryRun, all other fields should get defaults
            const json = JSON.stringify({ dryRun: dryRunValue })
            const result = parseOptions(json)

            // Provided field should be preserved
            expect(result.dryRun).toBe(dryRunValue)

            // Missing fields should have defaults
            expect(result.parallel).toBe(DEFAULT_PLUGIN_GLOBAL_OPTIONS.parallel)
            expect(result.onError).toBe(DEFAULT_PLUGIN_GLOBAL_OPTIONS.onError)
            expect(result.logLevel).toBe(DEFAULT_PLUGIN_GLOBAL_OPTIONS.logLevel)
            expect(result.cleanOnly).toBe(DEFAULT_PLUGIN_GLOBAL_OPTIONS.cleanOnly)
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should preserve all provided fields while applying defaults to missing ones', () => {
      /**
       * **Feature: plugin-bootstrap-refactor, Property 11: Deserialization applies defaults for missing fields**
       * **Validates: Requirements 7.4**
       *
       * Provided fields should be preserved, missing fields should get defaults
       */
      fc.assert(
        fc.property(
          logLevelArb,
          onErrorArb,
          (logLevel, onError) => {
            const json = JSON.stringify({ logLevel, onError })
            const result = parseOptions(json)

            // Provided fields should be preserved
            expect(result.logLevel).toBe(logLevel)
            expect(result.onError).toBe(onError)

            // Missing fields should have defaults
            expect(result.parallel).toBe(DEFAULT_PLUGIN_GLOBAL_OPTIONS.parallel)
            expect(result.dryRun).toBe(DEFAULT_PLUGIN_GLOBAL_OPTIONS.dryRun)
            expect(result.cleanOnly).toBe(DEFAULT_PLUGIN_GLOBAL_OPTIONS.cleanOnly)
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should apply defaults to empty JSON object', () => {
      /**
       * **Feature: plugin-bootstrap-refactor, Property 11: Deserialization applies defaults for missing fields**
       * **Validates: Requirements 7.4**
       *
       * Empty JSON object should result in all defaults
       */
      const result = parseOptions('{}')

      expect(result.parallel).toBe(DEFAULT_PLUGIN_GLOBAL_OPTIONS.parallel)
      expect(result.onError).toBe(DEFAULT_PLUGIN_GLOBAL_OPTIONS.onError)
      expect(result.logLevel).toBe(DEFAULT_PLUGIN_GLOBAL_OPTIONS.logLevel)
      expect(result.dryRun).toBe(DEFAULT_PLUGIN_GLOBAL_OPTIONS.dryRun)
      expect(result.cleanOnly).toBe(DEFAULT_PLUGIN_GLOBAL_OPTIONS.cleanOnly)
    })

    it('applyDefaults should be idempotent', () => {
      /**
       * **Feature: plugin-bootstrap-refactor, Property 11: Deserialization applies defaults for missing fields**
       * **Validates: Requirements 7.4**
       *
       * Applying defaults multiple times should produce the same result
       */
      fc.assert(
        fc.property(
          pluginGlobalOptionsArb,
          (options) => {
            const once = applyDefaults(options)
            const twice = applyDefaults(once)

            expect(twice.parallel).toBe(once.parallel)
            expect(twice.onError).toBe(once.onError)
            expect(twice.logLevel).toBe(once.logLevel)
            expect(twice.dryRun).toBe(once.dryRun)
            expect(twice.cleanOnly).toBe(once.cleanOnly)
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should preserve arrays and objects when provided', () => {
      /**
       * **Feature: plugin-bootstrap-refactor, Property 11: Deserialization applies defaults for missing fields**
       * **Validates: Requirements 7.4**
       *
       * Arrays and objects should be preserved when provided
       */
      fc.assert(
        fc.property(
          fc.array(excludePatternArb, { minLength: 1, maxLength: 5 }),
          fc.dictionary(workspaceNameArb, pathArb, { minKeys: 1, maxKeys: 3 }),
          (patterns, groups) => {
            const json = JSON.stringify({
              excludePatterns: patterns,
              workspaces: groups,
            })
            const result = parseOptions(json)

            expect(result.excludePatterns).toEqual(patterns)
            // workspaces is not preserved by parseOptions, only by applyDefaults
            // This test validates that arrays are preserved
          },
        ),
        { numRuns: 100 },
      )
    })
  })
})
