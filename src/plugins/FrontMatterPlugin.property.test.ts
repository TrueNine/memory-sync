/**
 * Property-based tests for FrontMatterPlugin
 * **Feature: plugin-architecture, Property 7: Front Matter round trip**
 * **Feature: plugin-architecture, Property 8: Front Matter merge preservation**
 */

import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import {
  mergeFrontMatter,
  parseFrontMatter,
  serializeFrontMatter,
} from './FrontMatterPlugin'

/**
 * Generate a valid front matter key (alphanumeric with underscores)
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

describe('FrontMatterPlugin properties', () => {
  describe('Property 7: Front Matter round trip', () => {
    it('should produce equivalent object after serialize then parse', () => {
      /**
       * **Feature: plugin-architecture, Property 7: Front Matter round trip**
       * **Validates: Requirements 4.6**
       *
       * For any valid front matter object, serializing then parsing should
       * produce an equivalent object
       */
      fc.assert(
        fc.property(
          frontMatterObjectArb,
          (original) => {
            const serialized = serializeFrontMatter(original)
            const { frontMatter: parsed } = parseFrontMatter(serialized + '\nContent here')

            expect(parsed).not.toBeNull()

            for (const [key, value] of Object.entries(original)) {
              expect(parsed).toHaveProperty(key)
              const parsedValue = parsed![key]

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

    it('should preserve content after adding front matter', () => {
      /**
       * **Feature: plugin-architecture, Property 7: Front Matter round trip**
       * **Validates: Requirements 4.6**
       */
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 200 })
            .filter((s) => !s.startsWith('---')),
          frontMatterObjectArb,
          (content, fm) => {
            const serialized = serializeFrontMatter(fm)
            const combined = serialized + content
            const { content: parsedContent } = parseFrontMatter(combined)

            expect(parsedContent).toBe(content)
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should handle content without front matter', () => {
      /**
       * **Feature: plugin-architecture, Property 7: Front Matter round trip**
       * **Validates: Requirements 4.6**
       */
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 200 })
            .filter((s) => !s.startsWith('---')),
          (content) => {
            const { frontMatter, content: parsedContent } = parseFrontMatter(content)

            expect(frontMatter).toBeNull()
            expect(parsedContent).toBe(content)
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
       * **Validates: Requirements 4.5**
       *
       * For any existing front matter, adding new properties should preserve
       * all original properties
       */
      fc.assert(
        fc.property(
          frontMatterObjectArb,
          frontMatterObjectArb,
          (existing, newProps) => {
            const merged = mergeFrontMatter(existing, newProps)

            for (const [key, value] of Object.entries(existing)) {
              expect(merged).toHaveProperty(key)
              expect(merged[key]).toBe(value)
            }
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should add new properties from newProps when not in existing', () => {
      /**
       * **Feature: plugin-architecture, Property 8: Front Matter merge preservation**
       * **Validates: Requirements 4.5**
       */
      fc.assert(
        fc.property(
          frontMatterObjectArb,
          frontMatterObjectArb,
          (existing, newProps) => {
            const merged = mergeFrontMatter(existing, newProps)

            for (const [key, value] of Object.entries(newProps)) {
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

    it('should handle null existing front matter', () => {
      /**
       * **Feature: plugin-architecture, Property 8: Front Matter merge preservation**
       * **Validates: Requirements 4.5**
       */
      fc.assert(
        fc.property(
          frontMatterObjectArb,
          (newProps) => {
            const merged = mergeFrontMatter(null, newProps)

            for (const [key, value] of Object.entries(newProps)) {
              expect(merged).toHaveProperty(key)
              expect(merged[key]).toBe(value)
            }
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should give existing properties priority over new properties', () => {
      /**
       * **Feature: plugin-architecture, Property 8: Front Matter merge preservation**
       * **Validates: Requirements 4.5**
       *
       * When both existing and new have the same key, existing value wins
       */
      fc.assert(
        fc.property(
          frontMatterKeyArb,
          simpleFrontMatterValueArb,
          simpleFrontMatterValueArb,
          (key, existingValue, newValue) => {
            const existing = { [key]: existingValue }
            const newProps = { [key]: newValue }
            const merged = mergeFrontMatter(existing, newProps)

            expect(merged[key]).toBe(existingValue)
          },
        ),
        { numRuns: 100 },
      )
    })
  })
})
