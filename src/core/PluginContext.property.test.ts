/**
 * Property-based tests for PluginContext
 * **Feature: plugin-architecture, Property 3: Context state propagation**
 * **Validates: Requirements 25.1, 25.4**
 */

import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { createPluginContext } from './PluginContext'

/**
 * Reserved JavaScript property names that should not be used as meta keys
 * These properties have special behavior on objects and cannot be treated as regular properties
 */
const RESERVED_KEYS = new Set([
  '__proto__',
  'constructor',
  'prototype',
  '__defineGetter__',
  '__defineSetter__',
  '__lookupGetter__',
  '__lookupSetter__',
  'hasOwnProperty',
  'isPrototypeOf',
  'propertyIsEnumerable',
  'toLocaleString',
  'toString',
  'valueOf',
])

/**
 * Arbitrary for safe meta keys (excludes reserved JavaScript property names)
 */
const safeMetaKey = fc.string({ minLength: 1 })
  .filter((s) => s.trim().length > 0 && !RESERVED_KEYS.has(s))

describe('PluginContext properties', () => {
  it('should propagate meta state changes to subsequent reads', () => {
    /**
     * **Feature: plugin-architecture, Property 3: Context state propagation**
     * **Validates: Requirements 25.1, 25.4**
     *
     * For any plugin sequence, if plugin A sets a value in ctx.meta,
     * subsequent plugin B should read the same value
     */
    fc.assert(
      fc.property(
        fc.record({
          key: safeMetaKey,
          value: fc.oneof(
            fc.string(),
            fc.integer(),
            fc.boolean(),
            fc.array(fc.string()),
            fc.object(),
          ),
        }),
        ({ key, value }) => {
          const ctx = createPluginContext({
            config: { plugins: [] },
          })

          ctx.meta[key] = value
          expect(ctx.meta[key]).toEqual(value)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('should preserve multiple meta values independently', () => {
    /**
     * **Feature: plugin-architecture, Property 3: Context state propagation**
     * **Validates: Requirements 25.1, 25.4**
     *
     * Setting multiple unique keys should not interfere with each other
     */
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            key: safeMetaKey,
            value: fc.string(),
          }),
          { minLength: 1, maxLength: 10 },
        ).chain((entries) => {
          const uniqueEntries = new Map<string, string>()
          for (const { key, value } of entries) {
            uniqueEntries.set(key, value)
          }
          return fc.constant(Array.from(uniqueEntries.entries()).map(([key, value]) => ({ key, value })))
        }),
        (entries) => {
          const ctx = createPluginContext({
            config: { plugins: [] },
          })

          for (const { key, value } of entries) {
            ctx.meta[key] = value
          }

          for (const { key, value } of entries) {
            expect(ctx.meta[key]).toBe(value)
          }
        },
      ),
      { numRuns: 100 },
    )
  })

  it('should track emitted files correctly', () => {
    /**
     * **Feature: plugin-architecture, Property 3: Context state propagation**
     * **Validates: Requirements 25.1, 25.4**
     *
     * All emitted files should be retrievable via getEmittedFiles
     */
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            type: fc.constantFrom('asset', 'chunk') as fc.Arbitrary<'asset' | 'chunk'>,
            fileName: fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0),
            source: fc.string(),
          }),
          { minLength: 0, maxLength: 10 },
        ),
        (files) => {
          const ctx = createPluginContext({
            config: { plugins: [] },
          })

          for (const file of files) {
            ctx.emitFile(file)
          }

          const emitted = ctx.getEmittedFiles()
          expect(emitted.length).toBe(files.length)

          for (let i = 0; i < files.length; i++) {
            expect(emitted[i]).toEqual(files[i])
          }
        },
      ),
      { numRuns: 100 },
    )
  })

  it('should return a copy of emitted files (immutability)', () => {
    /**
     * **Feature: plugin-architecture, Property 3: Context state propagation**
     * **Validates: Requirements 25.1, 25.4**
     *
     * Modifying the returned array should not affect internal state
     */
    fc.assert(
      fc.property(
        fc.record({
          type: fc.constantFrom('asset', 'chunk') as fc.Arbitrary<'asset' | 'chunk'>,
          fileName: fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0),
          source: fc.string(),
        }),
        (file) => {
          const ctx = createPluginContext({
            config: { plugins: [] },
          })

          ctx.emitFile(file)
          const emitted1 = ctx.getEmittedFiles()
          emitted1.pop()

          const emitted2 = ctx.getEmittedFiles()
          expect(emitted2.length).toBe(1)
          expect(emitted2[0]).toEqual(file)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('should return emitFile fileName', () => {
    /**
     * **Feature: plugin-architecture, Property 3: Context state propagation**
     * **Validates: Requirements 25.1, 25.4**
     *
     * emitFile should return the fileName of the emitted file
     */
    fc.assert(
      fc.property(
        fc.record({
          type: fc.constantFrom('asset', 'chunk') as fc.Arbitrary<'asset' | 'chunk'>,
          fileName: fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0),
          source: fc.string(),
        }),
        (file) => {
          const ctx = createPluginContext({
            config: { plugins: [] },
          })

          const result = ctx.emitFile(file)
          expect(result).toBe(file.fileName)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('should return a copy of input bundles (immutability)', () => {
    /**
     * **Feature: plugin-architecture, Property 3: Context state propagation**
     * **Validates: Requirements 25.1, 25.4**
     *
     * Modifying the returned array should not affect internal state
     */
    fc.assert(
      fc.property(
        fc.constantFrom('memoryPrompt', 'globalPrompt', 'configFile'),
        (inputType) => {
          const ctx = createPluginContext({
            config: { plugins: [] },
          })

          const bundles1 = ctx.getAllInputBundles()
          const originalLength = bundles1.length

          // Attempt to modify the returned array
          bundles1.push({
            type: inputType as any,
            path: 'test.md',
            content: 'test content',
          })

          // Internal state should remain unchanged
          const bundles2 = ctx.getAllInputBundles()
          expect(bundles2.length).toBe(originalLength)
        },
      ),
      { numRuns: 100 },
    )
  })
})
