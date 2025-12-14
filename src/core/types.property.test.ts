/**
 * Property-based tests for Bootstrap types
 * **Feature: plugin-bootstrap-refactor, Property 10: PluginGlobalOptions serialization round-trip**
 */

import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import type { PluginGlobalOptions } from './types'

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
const excludePatternArb = fc.stringMatching(/^[a-zA-Z0-9_\-\*\/\.]+$/, { minLength: 1, maxLength: 30 })

/**
 * Generate a valid workspace name
 */
const workspaceNameArb = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_\-]*$/, { minLength: 1, maxLength: 20 })

/**
 * Generate a valid path string
 */
const pathArb = fc.stringMatching(/^[a-zA-Z0-9_\-\/\\\.]+$/, { minLength: 1, maxLength: 50 })

/**
 * Generate a valid PluginGlobalOptions object
 * All fields are optional, so we generate various combinations
 */
const pluginGlobalOptionsArb: fc.Arbitrary<PluginGlobalOptions> = fc.record({
  parallel: fc.option(fc.boolean(), { nil: undefined }),
  onError: fc.option(onErrorArb, { nil: undefined }),
  logLevel: fc.option(logLevelArb, { nil: undefined }),
  excludePatterns: fc.option(fc.array(excludePatternArb, { minLength: 0, maxLength: 5 }), { nil: undefined }),
  dryRun: fc.option(fc.boolean(), { nil: undefined }),
  cleanOnly: fc.option(fc.boolean(), { nil: undefined }),
  workspaces: fc.option(
    fc.dictionary(workspaceNameArb, pathArb, { minKeys: 0, maxKeys: 3 }),
    { nil: undefined },
  ),
  root: fc.option(pathArb, { nil: undefined }),
}, { requiredKeys: [] })

/**
 * Serialize PluginGlobalOptions to JSON string
 */
function serializeOptions(options: PluginGlobalOptions): string {
  return JSON.stringify(options)
}

/**
 * Deserialize JSON string to PluginGlobalOptions
 */
function deserializeOptions(json: string): PluginGlobalOptions {
  return JSON.parse(json) as PluginGlobalOptions
}

/**
 * Compare two PluginGlobalOptions objects for equivalence
 * Handles undefined vs missing keys
 */
function areOptionsEquivalent(a: PluginGlobalOptions, b: PluginGlobalOptions): boolean {
  // Compare primitive fields
  if (a.parallel !== b.parallel) {
    return false
  }
  if (a.onError !== b.onError) {
    return false
  }
  if (a.logLevel !== b.logLevel) {
    return false
  }
  if (a.dryRun !== b.dryRun) {
    return false
  }
  if (a.cleanOnly !== b.cleanOnly) {
    return false
  }
  if (a.root !== b.root) {
    return false
  }

  // Compare excludePatterns array
  const aPatterns = a.excludePatterns ?? []
  const bPatterns = b.excludePatterns ?? []
  if (aPatterns.length !== bPatterns.length) {
    return false
  }
  for (let i = 0; i < aPatterns.length; i++) {
    if (aPatterns[i] !== bPatterns[i]) {
      return false
    }
  }

  // Compare workspaces object
  const aGroups = a.workspaces ?? {}
  const bGroups = b.workspaces ?? {}
  const aKeys = Object.keys(aGroups)
  const bKeys = Object.keys(bGroups)
  if (aKeys.length !== bKeys.length) {
    return false
  }
  for (const key of aKeys) {
    if (aGroups[key] !== bGroups[key]) {
      return false
    }
  }

  return true
}

describe('Bootstrap types properties', () => {
  describe('Property 10: PluginGlobalOptions serialization round-trip', () => {
    it('should produce equivalent object after serialize then deserialize', () => {
      /**
       * **Feature: plugin-bootstrap-refactor, Property 10: PluginGlobalOptions serialization round-trip**
       * **Validates: Requirements 7.1, 7.2, 7.3**
       *
       * For any valid PluginGlobalOptions object, serializing to JSON and
       * deserializing back should produce an equivalent object
       */
      fc.assert(
        fc.property(
          pluginGlobalOptionsArb,
          (original) => {
            const serialized = serializeOptions(original)
            const deserialized = deserializeOptions(serialized)

            // Verify the deserialized object is equivalent to the original
            expect(areOptionsEquivalent(original, deserialized)).toBe(true)
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should preserve all primitive fields after round-trip', () => {
      /**
       * **Feature: plugin-bootstrap-refactor, Property 10: PluginGlobalOptions serialization round-trip**
       * **Validates: Requirements 7.1, 7.2, 7.3**
       */
      fc.assert(
        fc.property(
          fc.boolean(),
          onErrorArb,
          logLevelArb,
          fc.boolean(),
          fc.boolean(),
          pathArb,
          (parallel, onError, logLevel, dryRun, cleanOnly, root) => {
            const original: PluginGlobalOptions = {
              parallel,
              onError,
              logLevel,
              dryRun,
              cleanOnly,
              root,
            }

            const serialized = serializeOptions(original)
            const deserialized = deserializeOptions(serialized)

            expect(deserialized.parallel).toBe(parallel)
            expect(deserialized.onError).toBe(onError)
            expect(deserialized.logLevel).toBe(logLevel)
            expect(deserialized.dryRun).toBe(dryRun)
            expect(deserialized.cleanOnly).toBe(cleanOnly)
            expect(deserialized.root).toBe(root)
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should preserve excludePatterns array after round-trip', () => {
      /**
       * **Feature: plugin-bootstrap-refactor, Property 10: PluginGlobalOptions serialization round-trip**
       * **Validates: Requirements 7.3**
       */
      fc.assert(
        fc.property(
          fc.array(excludePatternArb, { minLength: 1, maxLength: 10 }),
          (patterns) => {
            const original: PluginGlobalOptions = {
              excludePatterns: patterns,
            }

            const serialized = serializeOptions(original)
            const deserialized = deserializeOptions(serialized)

            expect(deserialized.excludePatterns).toEqual(patterns)
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should preserve workspaces object after round-trip', () => {
      /**
       * **Feature: plugin-bootstrap-refactor, Property 10: PluginGlobalOptions serialization round-trip**
       * **Validates: Requirements 7.3**
       */
      fc.assert(
        fc.property(
          fc.dictionary(workspaceNameArb, pathArb, { minKeys: 1, maxKeys: 5 }),
          (groups) => {
            const original: PluginGlobalOptions = {
              workspaces: groups,
            }

            const serialized = serializeOptions(original)
            const deserialized = deserializeOptions(serialized)

            expect(deserialized.workspaces).toEqual(groups)
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should handle empty options object', () => {
      /**
       * **Feature: plugin-bootstrap-refactor, Property 10: PluginGlobalOptions serialization round-trip**
       * **Validates: Requirements 7.1, 7.2**
       */
      const original: PluginGlobalOptions = {}

      const serialized = serializeOptions(original)
      const deserialized = deserializeOptions(serialized)

      expect(deserialized).toEqual({})
    })

    it('should produce valid JSON string', () => {
      /**
       * **Feature: plugin-bootstrap-refactor, Property 10: PluginGlobalOptions serialization round-trip**
       * **Validates: Requirements 7.1**
       */
      fc.assert(
        fc.property(
          pluginGlobalOptionsArb,
          (options) => {
            const serialized = serializeOptions(options)

            // Should be valid JSON
            expect(() => JSON.parse(serialized)).not.toThrow()
          },
        ),
        { numRuns: 100 },
      )
    })
  })
})
