/**
 * Property-based tests for front matter capability
 * **Feature: plugin-architecture, Property 7: Front Matter round trip**
 * **Feature: plugin-architecture, Property 8: Front Matter merge preservation**
 */

import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import {
  mergeFrontMatter,
  parseFrontMatter,
  serializeFrontMatter,
} from './frontMatter'

/**
 * Generate a valid front matter key (alphanumeric with underscores)
 * Keys must start with a letter and contain only alphanumeric characters and underscores
 */
const frontMatterKeyArb = fc.string({ minLength: 1, maxLength: 20 })
  .filter((s) => /^[a-zA-Z][a-zA-Z0-9_]*$/.test(s))

/**
 * Generate a simple front matter value (string, number, boolean)
 * Excludes complex values that may not round-trip perfectly in simple YAML:
 * - Strings with newlines or carriage returns
 * - Strings containing '---' (YAML delimiter)
 * - Strings with leading/trailing whitespace (trimmed by simple parser)
 * - Strings containing quotes (escape handling varies)
 * - Strings containing colons or hashes (YAML special chars)
 */
const simpleFrontMatterValueArb = fc.oneof(
  fc.stringMatching(/^[a-zA-Z0-9_\-\.]+$/, { minLength: 1, maxLength: 30 }),
  fc.integer({ min: -1000000, max: 1000000 }),
  fc.boolean(),
)

/**
 * Generate a valid front matter object with simple values
 */
const frontMatterObjectArb = fc.dictionary(frontMatterKeyArb, simpleFrontMatterValueArb, {
  minKeys: 1,
  maxKeys: 5,
})

describe('frontMatter capability properties', () => {
  describe('Property 7: Front Matter round trip', () => {
    it('should produce equivalent object after serialize then parse', () => {
      /**
       * **Feature: plugin-architecture, Property 7: Front Matter round trip**
       * **Validates: Requirements 4.3**
       *
       * For any valid front matter object, serializing then parsing should
       * produce an equivalent object
       */
      fc.assert(
        fc.property(
          frontMatterObjectArb,
          (original) => {
            const serialized = serializeFrontMatter(original, 'Content here')
            const { frontMatter: parsed } = parseFrontMatter(serialized)

            for (const [key, value] of Object.entries(original)) {
              expect(parsed).toHaveProperty(key)
              const parsedValue = parsed[key]

              if (typeof value === 'number') {
                expect(parsedValue).toBe(value)
              } else if (typeof value === 'boolean') {
                expect(parsedValue).toBe(value)
              } else if (typeof value === 'string') {
                expect(String(parsedValue)).toBe(value)
              }
            }
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should preserve body content after serialize then parse', () => {
      /**
       * **Feature: plugin-architecture, Property 7: Front Matter round trip**
       * **Validates: Requirements 4.3**
       */
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 200 })
            .filter((s) => !s.startsWith('---')),
          frontMatterObjectArb,
          (body, fm) => {
            const serialized = serializeFrontMatter(fm, body)
            const { body: parsedBody } = parseFrontMatter(serialized)

            expect(parsedBody).toBe(body)
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should handle content without front matter as empty object', () => {
      /**
       * **Feature: plugin-architecture, Property 7: Front Matter round trip**
       * **Validates: Requirements 4.5**
       *
       * Content without front matter should return empty object (not null)
       */
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 200 })
            .filter((s) => !s.startsWith('---')),
          (content) => {
            const { frontMatter, body } = parseFrontMatter(content)

            // Empty object for missing front matter (Requirement 4.5)
            expect(frontMatter).toEqual({})
            expect(body).toBe(content)
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should handle empty front matter by returning body only', () => {
      /**
       * **Feature: plugin-architecture, Property 7: Front Matter round trip**
       * **Validates: Requirements 4.3**
       *
       * Empty front matter should serialize to just the body
       */
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 200 }),
          (body) => {
            const serialized = serializeFrontMatter({}, body)

            // Empty front matter should not add --- delimiters
            expect(serialized).toBe(body)
          },
        ),
        { numRuns: 100 },
      )
    })
  })


  describe('Property 8: Front Matter merge preservation', () => {
    it('should preserve existing properties when merging', () => {
      /**
       * **Feature: plugin-architecture, Property 8: Front Matter merge preservation**
       * **Validates: Requirements 4.4**
       *
       * For any existing front matter, adding new properties should preserve
       * all original properties
       */
      fc.assert(
        fc.property(
          frontMatterObjectArb,
          frontMatterObjectArb,
          (existing, additions) => {
            const merged = mergeFrontMatter(existing, additions)

            // All existing properties should be preserved
            for (const [key, value] of Object.entries(existing)) {
              expect(merged).toHaveProperty(key)
              expect(merged[key]).toBe(value)
            }
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should add new properties from additions when not in existing', () => {
      /**
       * **Feature: plugin-architecture, Property 8: Front Matter merge preservation**
       * **Validates: Requirements 4.4**
       */
      fc.assert(
        fc.property(
          frontMatterObjectArb,
          frontMatterObjectArb,
          (existing, additions) => {
            const merged = mergeFrontMatter(existing, additions)

            // New properties should be added
            for (const [key, value] of Object.entries(additions)) {
              if (!(key in existing)) {
                expect(merged).toHaveProperty(key)
                expect(merged[key]).toBe(value)
              }
            }
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should handle empty existing front matter', () => {
      /**
       * **Feature: plugin-architecture, Property 8: Front Matter merge preservation**
       * **Validates: Requirements 4.4**
       */
      fc.assert(
        fc.property(
          frontMatterObjectArb,
          (additions) => {
            const merged = mergeFrontMatter({}, additions)

            // All additions should be present
            for (const [key, value] of Object.entries(additions)) {
              expect(merged).toHaveProperty(key)
              expect(merged[key]).toBe(value)
            }
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should give existing properties priority over additions', () => {
      /**
       * **Feature: plugin-architecture, Property 8: Front Matter merge preservation**
       * **Validates: Requirements 4.4**
       *
       * When both existing and additions have the same key, existing value wins
       */
      fc.assert(
        fc.property(
          frontMatterKeyArb,
          simpleFrontMatterValueArb,
          simpleFrontMatterValueArb,
          (key, existingValue, additionValue) => {
            const existing = { [key]: existingValue }
            const additions = { [key]: additionValue }
            const merged = mergeFrontMatter(existing, additions)

            // Existing value should take precedence
            expect(merged[key]).toBe(existingValue)
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should be idempotent when merging same properties', () => {
      /**
       * **Feature: plugin-architecture, Property 8: Front Matter merge preservation**
       * **Validates: Requirements 4.4**
       *
       * Merging the same additions twice should produce the same result
       */
      fc.assert(
        fc.property(
          frontMatterObjectArb,
          frontMatterObjectArb,
          (existing, additions) => {
            const merged1 = mergeFrontMatter(existing, additions)
            const merged2 = mergeFrontMatter(merged1, additions)

            expect(merged2).toEqual(merged1)
          },
        ),
        { numRuns: 100 },
      )
    })
  })
})
