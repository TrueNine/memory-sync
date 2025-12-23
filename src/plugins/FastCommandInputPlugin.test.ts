import * as fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { FastCommandInputPlugin } from './FastCommandInputPlugin'

describe('fastCommandInputPlugin', () => {
  describe('extractSeriesInfo', () => {
    const plugin = new FastCommandInputPlugin()

    /**
     * Feature: fast-command-series, Property 4: Series Prefix Extraction
     * Validates: Requirements 2.1, 2.2, 2.3
     *
     * For any fast command filename:
     * - If the filename contains an underscore, the series SHALL be the substring before the first underscore
     * - If the filename contains no underscore, the series SHALL be undefined
     * - The commandName SHALL be the substring after the first underscore (or the entire basename if no underscore)
     */
    it('should extract series as substring before first underscore for filenames with underscore', () => {
      // Generate alphanumeric strings without underscore for series prefix
      const alphanumericNoUnderscore = fc.string({ minLength: 1, maxLength: 10, unit: 'grapheme-ascii' })
        .filter((s) => /^[a-z0-9]+$/i.test(s))

      // Generate alphanumeric strings that may contain underscores for command name
      const alphanumericWithUnderscore = fc.string({ minLength: 1, maxLength: 20, unit: 'grapheme-ascii' })
        .filter((s) => /^\w+$/.test(s))

      fc.assert(
        fc.property(
          alphanumericNoUnderscore,
          alphanumericWithUnderscore,
          (seriesPrefix, commandName) => {
            const fileName = `${seriesPrefix}_${commandName}.md`
            const result = plugin.extractSeriesInfo(fileName)

            expect(result.series).toBe(seriesPrefix)
            expect(result.commandName).toBe(commandName)
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should return undefined series for filenames without underscore', () => {
      // Generate alphanumeric strings without underscore
      const alphanumericNoUnderscore = fc.string({ minLength: 1, maxLength: 20, unit: 'grapheme-ascii' })
        .filter((s) => /^[a-z0-9]+$/i.test(s))

      fc.assert(
        fc.property(
          alphanumericNoUnderscore,
          (baseName) => {
            const fileName = `${baseName}.md`
            const result = plugin.extractSeriesInfo(fileName)

            expect(result.series).toBeUndefined()
            expect(result.commandName).toBe(baseName)
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should use only first underscore as delimiter', () => {
      // Generate alphanumeric strings without underscore
      const alphanumericNoUnderscore = fc.string({ minLength: 1, maxLength: 10, unit: 'grapheme-ascii' })
        .filter((s) => /^[a-z0-9]+$/i.test(s))

      fc.assert(
        fc.property(
          alphanumericNoUnderscore,
          alphanumericNoUnderscore,
          alphanumericNoUnderscore,
          (seriesPrefix, part1, part2) => {
            // Create filename with multiple underscores
            const fileName = `${seriesPrefix}_${part1}_${part2}.md`
            const result = plugin.extractSeriesInfo(fileName)

            // Series should be only the first part
            expect(result.series).toBe(seriesPrefix)
            // Command name should include everything after first underscore
            expect(result.commandName).toBe(`${part1}_${part2}`)
          },
        ),
        { numRuns: 100 },
      )
    })

    // Unit tests for specific edge cases
    it('should handle pe_compile.md correctly', () => {
      const result = plugin.extractSeriesInfo('pe_compile.md')
      expect(result.series).toBe('pe')
      expect(result.commandName).toBe('compile')
    })

    it('should handle compile.md correctly (no underscore)', () => {
      const result = plugin.extractSeriesInfo('compile.md')
      expect(result.series).toBeUndefined()
      expect(result.commandName).toBe('compile')
    })

    it('should handle pe_compile_all.md correctly (multiple underscores)', () => {
      const result = plugin.extractSeriesInfo('pe_compile_all.md')
      expect(result.series).toBe('pe')
      expect(result.commandName).toBe('compile_all')
    })

    it('should handle _compile.md correctly (empty prefix)', () => {
      const result = plugin.extractSeriesInfo('_compile.md')
      expect(result.series).toBe('')
      expect(result.commandName).toBe('compile')
    })
  })
})
