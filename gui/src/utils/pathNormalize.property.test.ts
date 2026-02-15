/**
 * Property-Based Tests for pathNormalize utility
 *
 * Feature: tauri-ui-module, Property 5: 跨平台路径规范化
 * Validates: Requirements 6.3
 */
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import { normalizePath, platformSep } from '@/utils/pathNormalize'

/**
 * Arbitrary for a path segment — alphanumeric strings that are valid
 * directory/file names (no separators, no special path components).
 *
 * Excludes `.` and `..` since `path.normalize` resolves those,
 * which would change the segment list.
 */
const arbPathSegment: fc.Arbitrary<string> = fc
  .array(
    fc.constantFrom(
      ...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-'.split(''),
    ),
    { minLength: 1, maxLength: 12 },
  )
  .map((chars) => chars.join(''))

/**
 * Arbitrary for a separator — either forward slash or backslash.
 * Our normalizePath treats both as path separators on all platforms.
 */
const arbSeparator: fc.Arbitrary<string> = fc.constantFrom('/', '\\')

/**
 * Arbitrary for a path with mixed separators.
 * Generates 1–6 path segments joined by random separators.
 */
const arbMixedPath: fc.Arbitrary<string> = fc
  .tuple(
    fc.array(arbPathSegment, { minLength: 1, maxLength: 6 }),
    fc.array(arbSeparator, { minLength: 1, maxLength: 6 }),
  )
  .map(([segments, seps]) => {
    let result = segments[0]
    for (let i = 1; i < segments.length; i++) {
      result += seps[i % seps.length] + segments[i]
    }
    return result
  })

/**
 * Arbitrary for a path that may optionally start with a leading separator
 * (absolute-style on POSIX).
 */
const arbMixedPathWithOptionalLeading: fc.Arbitrary<string> = fc
  .tuple(fc.boolean(), arbMixedPath)
  .map(([leadingSep, p]) => (leadingSep ? '/' + p : p))

/**
 * Helper: split a path by both `/` and `\`, filtering out empty segments.
 */
function splitByAnySeparator(p: string): string[] {
  return p.split(/[/\\]/).filter((s) => s.length > 0)
}

describe('Property 5: 跨平台路径规范化', () => {
  /**
   * **Validates: Requirements 6.3**
   *
   * For any path with mixed separators (forward slash and backslash),
   * the normalized result should contain no mixed separators — only
   * the current platform's native separator.
   *
   * Our normalizePath first unifies all backslashes to forward slashes,
   * then delegates to path.normalize, which produces platform-native output.
   */
  it('normalized path contains only the platform separator (no mixed separators)', () => {
    const otherSep = platformSep === '/' ? '\\' : '/'

    fc.assert(
      fc.property(arbMixedPathWithOptionalLeading, (inputPath) => {
        const normalized = normalizePath(inputPath)
        expect(normalized).not.toContain(otherSep)
      }),
      { numRuns: 200 },
    )
  })

  /**
   * **Validates: Requirements 6.3**
   *
   * Normalizing an already-normalized path is idempotent:
   * normalize(normalize(p)) === normalize(p)
   */
  it('normalization is idempotent', () => {
    fc.assert(
      fc.property(arbMixedPathWithOptionalLeading, (inputPath) => {
        const once = normalizePath(inputPath)
        const twice = normalizePath(once)
        expect(twice).toBe(once)
      }),
      { numRuns: 200 },
    )
  })

  /**
   * **Validates: Requirements 6.3**
   *
   * Normalized path preserves the meaningful path segments.
   * Splitting the input by any separator and splitting the normalized
   * result by the platform separator should yield the same segments.
   *
   * We restrict to simple segments (no `.` or `..`) to keep
   * the property straightforward.
   */
  it('normalized path preserves path segments', () => {
    fc.assert(
      fc.property(arbMixedPath, (inputPath) => {
        const normalized = normalizePath(inputPath)

        const inputSegments = splitByAnySeparator(inputPath)
        const normalizedSegments = splitByAnySeparator(normalized)

        expect(normalizedSegments).toEqual(inputSegments)
      }),
      { numRuns: 200 },
    )
  })

  /**
   * **Validates: Requirements 6.3**
   *
   * Empty or whitespace-only paths should not crash and should
   * return a valid result (`.` — the current directory).
   */
  it('empty or whitespace-only paths do not crash', () => {
    const arbWhitespace: fc.Arbitrary<string> = fc
      .array(fc.constantFrom(' ', '\t', '\n', '\r'), { minLength: 0, maxLength: 10 })
      .map((chars) => chars.join(''))

    fc.assert(
      fc.property(arbWhitespace, (inputPath) => {
        const normalized = normalizePath(inputPath)
        expect(typeof normalized).toBe('string')
        expect(normalized.length).toBeGreaterThan(0)
        // Should return '.' for empty/whitespace input
        expect(normalized).toBe('.')
      }),
      { numRuns: 100 },
    )
  })
})
