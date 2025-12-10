/**
 * Property-based tests for PluginRegistry
 * **Feature: plugin-architecture, Property 13: Registry data immutability**
 * **Validates: Requirements 25.4**
 */

import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { createPluginRegistry, PluginRegistry, RegistryDataNotFoundError } from './PluginRegistry'

/**
 * Arbitrary for valid plugin identifiers
 */
const pluginIdArb = fc.string({ minLength: 1, maxLength: 50 })
  .filter((s) => s.trim().length > 0)

/**
 * Arbitrary for valid data keys
 */
const dataKeyArb = fc.string({ minLength: 1, maxLength: 50 })
  .filter((s) => s.trim().length > 0)

/**
 * Arbitrary for various data types that can be stored
 */
const dataValueArb = fc.oneof(
  fc.string(),
  fc.integer(),
  fc.boolean(),
  fc.array(fc.string()),
  fc.array(fc.integer()),
  fc.dictionary(fc.string({ minLength: 1 }), fc.string()),
  fc.dictionary(fc.string({ minLength: 1 }), fc.integer()),
)

describe('PluginRegistry properties', () => {
  describe('Property 13: Registry data immutability', () => {
    it('should return immutable data that cannot be modified', () => {
      /**
       * **Feature: plugin-architecture, Property 13: Registry data immutability**
       * **Validates: Requirements 25.4**
       *
       * For any data stored in the registry, the returned value should be
       * immutable and modifications should not affect the stored data
       */
      fc.assert(
        fc.property(
          pluginIdArb,
          dataKeyArb,
          fc.array(fc.string(), { minLength: 1, maxLength: 5 }),
          (pluginId, key, originalArray) => {
            const registry = createPluginRegistry()

            // Store the array
            registry.set(pluginId, key, originalArray)

            // Get the data
            const retrieved = registry.get<string[]>(pluginId, key)

            // Verify it's frozen (immutable)
            expect(Object.isFrozen(retrieved)).toBe(true)

            // Attempt to modify should throw in strict mode or fail silently
            expect(() => {
              (retrieved as string[]).push('modified')
            }).toThrow()

            // Original data should remain unchanged
            const retrievedAgain = registry.get<string[]>(pluginId, key)
            expect(retrievedAgain).toEqual(originalArray)
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should return deeply frozen objects', () => {
      /**
       * **Feature: plugin-architecture, Property 13: Registry data immutability**
       * **Validates: Requirements 25.4**
       *
       * Nested objects should also be frozen
       */
      fc.assert(
        fc.property(
          pluginIdArb,
          dataKeyArb,
          fc.dictionary(fc.string({ minLength: 1 }), fc.array(fc.string())),
          (pluginId, key, nestedObject) => {
            // Skip empty objects
            if (Object.keys(nestedObject).length === 0) {
              return
            }

            const registry = createPluginRegistry()
            registry.set(pluginId, key, nestedObject)

            const retrieved = registry.get<Record<string, string[]>>(pluginId, key)

            // Top level should be frozen
            expect(Object.isFrozen(retrieved)).toBe(true)

            // Nested arrays should also be frozen
            for (const nestedKey of Object.keys(retrieved!)) {
              expect(Object.isFrozen(retrieved![nestedKey])).toBe(true)
            }
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should return independent copies on each get call', () => {
      /**
       * **Feature: plugin-architecture, Property 13: Registry data immutability**
       * **Validates: Requirements 25.4**
       *
       * Each call to get should return an independent copy
       */
      fc.assert(
        fc.property(
          pluginIdArb,
          dataKeyArb,
          fc.array(fc.integer(), { minLength: 1, maxLength: 10 }),
          (pluginId, key, originalArray) => {
            const registry = createPluginRegistry()
            registry.set(pluginId, key, originalArray)

            const first = registry.get<number[]>(pluginId, key)
            const second = registry.get<number[]>(pluginId, key)

            // Should be equal in value
            expect(first).toEqual(second)

            // But should be different object references
            expect(first).not.toBe(second)
          },
        ),
        { numRuns: 100 },
      )
    })
  })

  describe('Basic registry operations', () => {
    it('should store and retrieve data correctly', () => {
      /**
       * For any plugin ID, key, and value, storing and retrieving
       * should return the same value
       */
      fc.assert(
        fc.property(
          pluginIdArb,
          dataKeyArb,
          dataValueArb,
          (pluginId, key, value) => {
            const registry = createPluginRegistry()
            registry.set(pluginId, key, value)

            const retrieved = registry.get(pluginId, key)
            expect(retrieved).toEqual(value)
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should correctly report existence with has()', () => {
      /**
       * has() should return true only after set() is called
       */
      fc.assert(
        fc.property(
          pluginIdArb,
          dataKeyArb,
          dataValueArb,
          (pluginId, key, value) => {
            const registry = createPluginRegistry()

            // Before set, has should return false
            expect(registry.has(pluginId, key)).toBe(false)

            // After set, has should return true
            registry.set(pluginId, key, value)
            expect(registry.has(pluginId, key)).toBe(true)
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should return undefined for non-existent data', () => {
      /**
       * get() should return undefined for non-existent plugin/key combinations
       */
      fc.assert(
        fc.property(
          pluginIdArb,
          dataKeyArb,
          (pluginId, key) => {
            const registry = createPluginRegistry()
            const result = registry.get(pluginId, key)
            expect(result).toBeUndefined()
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should throw RegistryDataNotFoundError for missing required data', () => {
      /**
       * getRequired() should throw with plugin identifier when data is missing
       * **Validates: Requirements 25.3**
       */
      fc.assert(
        fc.property(
          pluginIdArb,
          dataKeyArb,
          (pluginId, key) => {
            const registry = createPluginRegistry()

            expect(() => {
              registry.getRequired(pluginId, key)
            }).toThrow(RegistryDataNotFoundError)

            try {
              registry.getRequired(pluginId, key)
            }
            catch (error) {
              expect(error).toBeInstanceOf(RegistryDataNotFoundError)
              const regError = error as RegistryDataNotFoundError
              expect(regError.pluginId).toBe(pluginId)
              expect(regError.key).toBe(key)
              expect(regError.message).toContain(pluginId)
            }
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should support multiple plugins with independent data', () => {
      /**
       * Different plugins should have independent data storage
       */
      fc.assert(
        fc.property(
          fc.tuple(pluginIdArb, pluginIdArb).filter(([a, b]) => a !== b),
          dataKeyArb,
          fc.tuple(dataValueArb, dataValueArb),
          ([pluginA, pluginB], key, [valueA, valueB]) => {
            const registry = createPluginRegistry()

            registry.set(pluginA, key, valueA)
            registry.set(pluginB, key, valueB)

            expect(registry.get(pluginA, key)).toEqual(valueA)
            expect(registry.get(pluginB, key)).toEqual(valueB)
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should support multiple keys per plugin', () => {
      /**
       * A single plugin should be able to store multiple keys
       */
      fc.assert(
        fc.property(
          pluginIdArb,
          fc.tuple(dataKeyArb, dataKeyArb).filter(([a, b]) => a !== b),
          fc.tuple(dataValueArb, dataValueArb),
          (pluginId, [keyA, keyB], [valueA, valueB]) => {
            const registry = createPluginRegistry()

            registry.set(pluginId, keyA, valueA)
            registry.set(pluginId, keyB, valueB)

            expect(registry.get(pluginId, keyA)).toEqual(valueA)
            expect(registry.get(pluginId, keyB)).toEqual(valueB)
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should allow overwriting existing data', () => {
      /**
       * Calling set() with the same plugin/key should overwrite
       */
      fc.assert(
        fc.property(
          pluginIdArb,
          dataKeyArb,
          fc.tuple(dataValueArb, dataValueArb),
          (pluginId, key, [firstValue, secondValue]) => {
            const registry = createPluginRegistry()

            registry.set(pluginId, key, firstValue)
            expect(registry.get(pluginId, key)).toEqual(firstValue)

            registry.set(pluginId, key, secondValue)
            expect(registry.get(pluginId, key)).toEqual(secondValue)
          },
        ),
        { numRuns: 100 },
      )
    })
  })
})
