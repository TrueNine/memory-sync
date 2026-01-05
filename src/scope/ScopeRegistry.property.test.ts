// src/scope/ScopeRegistry.property.test.ts
// Property-based tests for ScopeRegistry
// Feature: compiler-integration

import type { MdxGlobalScope, OsInfo, ToolReferences, UserProfile } from '@/globals'
import * as fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { ShellKind } from '@/globals'
import { ScopePriority, ScopeRegistry } from './ScopeRegistry'

/**
 * Arbitrary generator for simple values (non-object primitives)
 */
const simpleValueArb = fc.oneof(
  fc.string(),
  fc.integer(),
  fc.boolean(),
  fc.constant(null),
)

/**
 * Arbitrary generator for flat record (no nested objects)
 */
const flatRecordArb = fc.dictionary(
  fc.string({ minLength: 1, maxLength: 20 }).filter((s) =>
    /^[a-z_]\w*$/i.test(s)
    && s !== '__proto__'
    && s !== 'constructor'
    && s !== 'prototype',
  ),
  simpleValueArb,
  { minKeys: 1, maxKeys: 5 },
)

/**
 * Arbitrary generator for nested record (one level of nesting)
 */
const _nestedRecordArb = fc.dictionary(
  fc.string({ minLength: 1, maxLength: 20 }).filter((s) =>
    /^[a-z_]\w*$/i.test(s)
    && s !== '__proto__'
    && s !== 'constructor'
    && s !== 'prototype',
  ),
  fc.oneof(simpleValueArb, flatRecordArb),
  { minKeys: 1, maxKeys: 5 },
)

/**
 * Arbitrary generator for namespace string
 */
const namespaceArb = fc.string({ minLength: 1, maxLength: 20 }).filter((s) =>
  /^[a-z_][a-z0-9_]*$/i.test(s)
  && s !== '__proto__'
  && s !== 'constructor'
  && s !== 'prototype'
  && s !== 'os'
  && s !== 'env'
  && s !== 'profile'
  && s !== 'tool',
)

/**
 * Arbitrary generator for OsInfo
 */
const osInfoArb: fc.Arbitrary<OsInfo> = fc.record({
  platform: fc.string(),
  arch: fc.string(),
  hostname: fc.string(),
  homedir: fc.string(),
  tmpdir: fc.string(),
  type: fc.string(),
  release: fc.string(),
  shellKind: fc.constantFrom(...Object.values(ShellKind)),
})

/**
 * Arbitrary generator for UserProfile
 */
const userProfileArb: fc.Arbitrary<UserProfile> = fc.record({
  name: fc.option(fc.string(), { nil: void 0 }),
  username: fc.option(fc.string(), { nil: void 0 }),
  gender: fc.option(fc.string(), { nil: void 0 }),
  birthday: fc.option(fc.string(), { nil: void 0 }),
})

/**
 * Arbitrary generator for ToolReferences
 */
const toolReferencesArb: fc.Arbitrary<ToolReferences> = fc.record({
  websearch: fc.option(fc.string(), { nil: void 0 }),
  webfetch: fc.option(fc.string(), { nil: void 0 }),
})

/**
 * Arbitrary generator for MdxGlobalScope
 */
const globalScopeArb: fc.Arbitrary<MdxGlobalScope> = fc.record({
  os: osInfoArb,
  env: fc.dictionary(fc.string({ minLength: 1, maxLength: 10 }), fc.string(), { minKeys: 0, maxKeys: 5 }),
  profile: userProfileArb,
  tool: toolReferencesArb,
})

/**
 * Feature: compiler-integration
 * Property-based tests for ScopeRegistry
 */
describe('scopeRegistry property tests', () => {
  /**
   * Feature: compiler-integration, Property 5: 作用域优先级正确性
   * For any scope merge operation, when the same key exists in multiple sources,
   * the system should use the value from the higher priority source.
   * Priority order (low to high):
   * 1. System default values
   * 2. Values from configuration file
   * 3. Values registered by plugins
   * 4. Values passed at MDX compile time
   * Validates: Requirements 6.1, 6.2
   */
  describe('property 5: Scope Priority Correctness', () => {
    it('should use higher priority values when same key exists in multiple sources', () => {
      fc.assert(
        fc.property(
          namespaceArb,
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.string({ minLength: 1, maxLength: 50 }),
          fc.string({ minLength: 1, maxLength: 50 }),
          fc.string({ minLength: 1, maxLength: 50 }),
          fc.string({ minLength: 1, maxLength: 50 }),
          (namespace, key, systemValue, userValue, pluginValue, compileValue) => {
            const registry = new ScopeRegistry()

            // Register same key with different priorities
            registry.register(namespace, { [key]: systemValue }, ScopePriority.SystemDefault)
            registry.register(namespace, { [key]: userValue }, ScopePriority.UserConfig)
            registry.register(namespace, { [key]: pluginValue }, ScopePriority.PluginRegistered)

            // Merge with compile-time scope
            const merged = registry.merge({ [namespace]: { [key]: compileValue } })

            // Compile-time should win (highest priority)
            const namespaceResult = merged[namespace] as Record<string, unknown>
            expect(namespaceResult[key]).toBe(compileValue)
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should use plugin priority when no compile-time scope provided', () => {
      fc.assert(
        fc.property(
          namespaceArb,
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.string({ minLength: 1, maxLength: 50 }),
          fc.string({ minLength: 1, maxLength: 50 }),
          fc.string({ minLength: 1, maxLength: 50 }),
          (namespace, key, systemValue, userValue, pluginValue) => {
            const registry = new ScopeRegistry()

            // Register same key with different priorities (no compile-time)
            registry.register(namespace, { [key]: systemValue }, ScopePriority.SystemDefault)
            registry.register(namespace, { [key]: userValue }, ScopePriority.UserConfig)
            registry.register(namespace, { [key]: pluginValue }, ScopePriority.PluginRegistered)

            const merged = registry.merge()

            // Plugin priority should win
            const namespaceResult = merged[namespace] as Record<string, unknown>
            expect(namespaceResult[key]).toBe(pluginValue)
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should use user config priority when no plugin scope registered', () => {
      fc.assert(
        fc.property(
          namespaceArb,
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.string({ minLength: 1, maxLength: 50 }),
          fc.string({ minLength: 1, maxLength: 50 }),
          (namespace, key, systemValue, userValue) => {
            const registry = new ScopeRegistry()

            // Register same key with system and user priorities only
            registry.register(namespace, { [key]: systemValue }, ScopePriority.SystemDefault)
            registry.register(namespace, { [key]: userValue }, ScopePriority.UserConfig)

            const merged = registry.merge()

            // User config should win
            const namespaceResult = merged[namespace] as Record<string, unknown>
            expect(namespaceResult[key]).toBe(userValue)
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should preserve global scope namespaces with lowest priority', () => {
      fc.assert(
        fc.property(
          globalScopeArb,
          fc.string({ minLength: 1, maxLength: 50 }),
          (globalScope, overrideValue) => {
            const registry = new ScopeRegistry()
            registry.setGlobalScope(globalScope)

            // Register override for profile namespace
            registry.register('profile', { customKey: overrideValue }, ScopePriority.PluginRegistered)

            const merged = registry.merge()

            // Global scope values should be present
            expect(merged['os']).toBeDefined()
            expect(merged['env']).toBeDefined()
            expect(merged['profile']).toBeDefined()
            expect(merged['tool']).toBeDefined()

            // Override should be merged in
            const profileResult = merged['profile'] as Record<string, unknown>
            expect(profileResult['customKey']).toBe(overrideValue)
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should maintain priority order regardless of registration order', () => {
      fc.assert(
        fc.property(
          namespaceArb,
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.string({ minLength: 1, maxLength: 50 }),
          fc.string({ minLength: 1, maxLength: 50 }),
          fc.string({ minLength: 1, maxLength: 50 }),
          // Shuffle the registration order
          fc.shuffledSubarray([
            ScopePriority.SystemDefault,
            ScopePriority.UserConfig,
            ScopePriority.PluginRegistered,
          ], { minLength: 3, maxLength: 3 }),
          (namespace, key, val1, val2, val3, priorities) => {
            const values = [val1, val2, val3]
            const registry = new ScopeRegistry()

            // Register in shuffled order
            priorities.forEach((priority, index) => {
              registry.register(namespace, { [key]: values[index] }, priority)
            })

            const merged = registry.merge()

            // Find which value was registered with highest priority
            const highestPriorityIndex = priorities.indexOf(ScopePriority.PluginRegistered)
            const expectedValue = values[highestPriorityIndex]

            const namespaceResult = merged[namespace] as Record<string, unknown>
            expect(namespaceResult[key]).toBe(expectedValue)
          },
        ),
        { numRuns: 100 },
      )
    })
  })

  /**
   * Feature: compiler-integration, Property 6: 深度合并正确性
   * For any nested object type namespace, ScopeRegistry's merge operation should
   * recursively merge all levels, rather than simply overwriting the entire object.
   * Validates: Requirements 6.3
   */
  describe('property 6: Deep Merge Correctness', () => {
    it('should recursively merge nested objects instead of overwriting', () => {
      fc.assert(
        fc.property(
          namespaceArb,
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.string({ minLength: 1, maxLength: 50 }),
          fc.string({ minLength: 1, maxLength: 50 }),
          (namespace, key1, key2, value1, value2) => {
            // Ensure keys are different
            fc.pre(key1 !== key2)

            const registry = new ScopeRegistry()

            // Register nested object with key1
            registry.register(namespace, {
              nested: { [key1]: value1 },
            }, ScopePriority.SystemDefault)

            // Register nested object with key2 (should merge, not overwrite)
            registry.register(namespace, {
              nested: { [key2]: value2 },
            }, ScopePriority.UserConfig)

            const merged = registry.merge()

            // Both keys should exist in the nested object
            const namespaceResult = merged[namespace] as Record<string, unknown>
            const nestedResult = namespaceResult['nested'] as Record<string, unknown>

            expect(nestedResult[key1]).toBe(value1)
            expect(nestedResult[key2]).toBe(value2)
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should deep merge multiple levels of nesting', () => {
      // Safe key generator that excludes prototype pollution keys
      const safeKeyArb = fc.string({ minLength: 1, maxLength: 20 }).filter((s) =>
        /^[a-z_]\w*$/i.test(s)
        && s !== '__proto__'
        && s !== 'constructor'
        && s !== 'prototype',
      )

      fc.assert(
        fc.property(
          namespaceArb,
          safeKeyArb,
          safeKeyArb,
          fc.string({ minLength: 1, maxLength: 50 }),
          fc.string({ minLength: 1, maxLength: 50 }),
          (namespace, key1, key2, value1, value2) => {
            fc.pre(key1 !== key2)

            const registry = new ScopeRegistry()

            // Register deeply nested object
            registry.register(namespace, {
              level1: {
                level2: {
                  [key1]: value1,
                },
              },
            }, ScopePriority.SystemDefault)

            // Register another deeply nested object (should merge)
            registry.register(namespace, {
              level1: {
                level2: {
                  [key2]: value2,
                },
              },
            }, ScopePriority.UserConfig)

            const merged = registry.merge()

            // Both keys should exist at the deepest level
            const namespaceResult = merged[namespace] as Record<string, unknown>
            const level1 = namespaceResult['level1'] as Record<string, unknown>
            const level2 = level1['level2'] as Record<string, unknown>

            expect(level2[key1]).toBe(value1)
            expect(level2[key2]).toBe(value2)
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should overwrite same key at same level with higher priority', () => {
      fc.assert(
        fc.property(
          namespaceArb,
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.string({ minLength: 1, maxLength: 50 }),
          fc.string({ minLength: 1, maxLength: 50 }),
          (namespace, key, lowPriorityValue, highPriorityValue) => {
            const registry = new ScopeRegistry()

            // Register nested object with same key at different priorities
            registry.register(namespace, {
              nested: { [key]: lowPriorityValue },
            }, ScopePriority.SystemDefault)

            registry.register(namespace, {
              nested: { [key]: highPriorityValue },
            }, ScopePriority.PluginRegistered)

            const merged = registry.merge()

            // Higher priority value should win
            const namespaceResult = merged[namespace] as Record<string, unknown>
            const nestedResult = namespaceResult['nested'] as Record<string, unknown>

            expect(nestedResult[key]).toBe(highPriorityValue)
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should not merge arrays (replace instead)', () => {
      fc.assert(
        fc.property(
          namespaceArb,
          fc.array(fc.string(), { minLength: 1, maxLength: 5 }),
          fc.array(fc.string(), { minLength: 1, maxLength: 5 }),
          (namespace, array1, array2) => {
            const registry = new ScopeRegistry()

            // Register array at low priority
            registry.register(namespace, {
              items: array1,
            }, ScopePriority.SystemDefault)

            // Register different array at high priority
            registry.register(namespace, {
              items: array2,
            }, ScopePriority.PluginRegistered)

            const merged = registry.merge()

            // Array should be replaced, not merged
            const namespaceResult = merged[namespace] as Record<string, unknown>
            expect(namespaceResult['items']).toEqual(array2)
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should handle compile-time scope deep merge correctly', () => {
      fc.assert(
        fc.property(
          namespaceArb,
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.string({ minLength: 1, maxLength: 50 }),
          fc.string({ minLength: 1, maxLength: 50 }),
          (namespace, key1, key2, registeredValue, compileTimeValue) => {
            fc.pre(key1 !== key2)

            const registry = new ScopeRegistry()

            // Register nested object
            registry.register(namespace, {
              nested: { [key1]: registeredValue },
            }, ScopePriority.PluginRegistered)

            // Merge with compile-time scope containing different key
            const merged = registry.merge({
              [namespace]: {
                nested: { [key2]: compileTimeValue },
              },
            })

            // Both keys should exist (deep merge)
            const namespaceResult = merged[namespace] as Record<string, unknown>
            const nestedResult = namespaceResult['nested'] as Record<string, unknown>

            expect(nestedResult[key1]).toBe(registeredValue)
            expect(nestedResult[key2]).toBe(compileTimeValue)
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should preserve non-object values when merging objects', () => {
      fc.assert(
        fc.property(
          namespaceArb,
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.string({ minLength: 1, maxLength: 20 }),
          simpleValueArb,
          flatRecordArb,
          (namespace, primitiveKey, objectKey, primitiveValue, objectValue) => {
            fc.pre(primitiveKey !== objectKey)

            const registry = new ScopeRegistry()

            // Register primitive value
            registry.register(namespace, {
              [primitiveKey]: primitiveValue,
            }, ScopePriority.SystemDefault)

            // Register object value
            registry.register(namespace, {
              [objectKey]: objectValue,
            }, ScopePriority.UserConfig)

            const merged = registry.merge()

            // Both should exist
            const namespaceResult = merged[namespace] as Record<string, unknown>
            expect(namespaceResult[primitiveKey]).toBe(primitiveValue)
            expect(namespaceResult[objectKey]).toEqual(objectValue)
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should handle null target gracefully in deep merge', () => {
      fc.assert(
        fc.property(
          namespaceArb,
          flatRecordArb,
          (namespace, values) => {
            const registry = new ScopeRegistry()

            // Register to a new namespace (target is undefined/null)
            registry.register(namespace, values, ScopePriority.PluginRegistered)

            const merged = registry.merge()

            // Values should be present
            const namespaceResult = merged[namespace] as Record<string, unknown>
            for (const [key, value] of Object.entries(values)) {
              expect(namespaceResult[key]).toBe(value)
            }
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should deep merge global scope profile with registered profile', () => {
      fc.assert(
        fc.property(
          globalScopeArb,
          fc.string({ minLength: 1, maxLength: 20 }).filter((s) =>
            /^[a-z_]\w*$/i.test(s)
            && s !== '__proto__'
            && s !== 'constructor'
            && s !== 'prototype'
            && s !== 'name'
            && s !== 'username'
            && s !== 'gender'
            && s !== 'birthday',
          ),
          fc.string({ minLength: 1, maxLength: 50 }),
          (globalScope, customKey, customValue) => {
            const registry = new ScopeRegistry()
            registry.setGlobalScope(globalScope)

            // Register additional profile key
            registry.register('profile', {
              [customKey]: customValue,
            }, ScopePriority.PluginRegistered)

            const merged = registry.merge()

            // Original profile values should be preserved
            const profileResult = merged['profile'] as Record<string, unknown>
            if (globalScope.profile.name !== void 0) {
              expect(profileResult['name']).toBe(globalScope.profile.name)
            }
            if (globalScope.profile.username !== void 0) {
              expect(profileResult['username']).toBe(globalScope.profile.username)
            }

            // Custom key should be added
            expect(profileResult[customKey]).toBe(customValue)
          },
        ),
        { numRuns: 100 },
      )
    })
  })
})
