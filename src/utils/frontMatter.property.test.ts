/**
 * Property-based tests for front matter generation
 * **Feature: scripts-refactor, Property 4: Front matter generation determinism**
 * **Feature: scripts-refactor, Property 5: BOM removal idempotence**
 */

import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { FrontMatterType, generateFrontMatter, removeBom } from './frontMatter'

describe('frontMatter properties', () => {
  it('should generate identical output for same inputs', () => {
    /**
     * **Feature: scripts-refactor, Property 4: Front matter generation determinism**
     * **Validates: Requirements 2.3**
     *
     * For any given front matter type and pattern, the front matter generator
     * should produce identical output across multiple invocations
     */
    fc.assert(
      fc.property(
        fc.record({
          type: fc.constantFrom(
            FrontMatterType.KIRO_ALWAYS,
            FrontMatterType.KIRO_FILE_MATCH,
            FrontMatterType.QODER_ALWAYS,
            FrontMatterType.QODER_GLOB,
          ),
          pattern: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
        }),
        (options) => {
          // Skip invalid combinations (types that require pattern but don't have one)
          const requiresPattern = options.type === FrontMatterType.KIRO_FILE_MATCH
            || options.type === FrontMatterType.QODER_GLOB

          if (requiresPattern && !options.pattern) {
            return true
          }

          const result1 = generateFrontMatter(options)
          const result2 = generateFrontMatter(options)

          expect(result1).toBe(result2)
          expect(result1).toMatch(/^---\n/)
          expect(result1).toMatch(/\n---\n\n$/)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('should always produce valid YAML front matter structure', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          FrontMatterType.KIRO_ALWAYS,
          FrontMatterType.QODER_ALWAYS,
        ),
        (type) => {
          const result = generateFrontMatter({ type })

          expect(result).toMatch(/^---\n/)
          expect(result).toMatch(/\n---\n\n$/)
          expect(result.split('---').length).toBe(3)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('should include pattern in output when pattern is provided', () => {
    fc.assert(
      fc.property(
        fc.record({
          type: fc.constantFrom(
            FrontMatterType.KIRO_FILE_MATCH,
            FrontMatterType.QODER_GLOB,
          ),
          pattern: fc.string({ minLength: 1, maxLength: 100 }),
        }),
        (options) => {
          const result = generateFrontMatter(options)

          expect(result).toContain(options.pattern)
        },
      ),
      { numRuns: 100 },
    )
  })
})

describe('BOM removal properties', () => {
  it('should be idempotent', () => {
    /**
     * **Feature: scripts-refactor, Property 5: BOM removal idempotence**
     * **Validates: Requirements 2.3**
     *
     * For any content, removing BOM multiple times should produce the same result
     */
    fc.assert(
      fc.property(
        fc.string(),
        (content) => {
          const withBom = '\uFEFF' + content
          const result1 = removeBom(withBom)
          const result2 = removeBom(result1)

          expect(result1).toBe(result2)
          expect(result1).not.toContain('\uFEFF')
          expect(result1).toBe(content)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('should not modify content without BOM', () => {
    fc.assert(
      fc.property(
        fc.string(),
        (content) => {
          const result = removeBom(content)

          expect(result).toBe(content)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('should only remove BOM from the start', () => {
    fc.assert(
      fc.property(
        fc.tuple(fc.string(), fc.string()),
        ([prefix, suffix]) => {
          const content = prefix + '\uFEFF' + suffix
          const result = removeBom(content)

          if (prefix === '') {
            expect(result).toBe(suffix)
          } else {
            expect(result).toBe(content)
          }
        },
      ),
      { numRuns: 100 },
    )
  })
})
