import * as fc from 'fast-check'
import {describe, expect, it} from 'vitest'
import {FastCommandInputPlugin} from './FastCommandInputPlugin'

describe('fastCommandInputPlugin', () => {
  describe('extractSeriesInfo', () => {
    const plugin = new FastCommandInputPlugin()

    it('should extract series as substring before first underscore for filenames with underscore', () => {
      const alphanumericNoUnderscore = fc.string({minLength: 1, maxLength: 10, unit: 'grapheme-ascii'}) // Generate alphanumeric strings without underscore for series prefix
        .filter(s => /^[a-z0-9]+$/i.test(s))

      const alphanumericWithUnderscore = fc.string({minLength: 1, maxLength: 20, unit: 'grapheme-ascii'}) // Generate alphanumeric strings that may contain underscores for command name
        .filter(s => /^\w+$/.test(s))

      fc.assert(
        fc.property(
          alphanumericNoUnderscore,
          alphanumericWithUnderscore,
          (seriesPrefix, commandName) => {
            const fileName = `${seriesPrefix}_${commandName}.mdx`
            const result = plugin.extractSeriesInfo(fileName)

            expect(result.series).toBe(seriesPrefix)
            expect(result.commandName).toBe(commandName)
          }
        ),
        {numRuns: 100}
      )
    })

    it('should return undefined series for filenames without underscore', () => {
      const alphanumericNoUnderscore = fc.string({minLength: 1, maxLength: 20, unit: 'grapheme-ascii'}) // Generate alphanumeric strings without underscore
        .filter(s => /^[a-z0-9]+$/i.test(s))

      fc.assert(
        fc.property(
          alphanumericNoUnderscore,
          baseName => {
            const fileName = `${baseName}.mdx`
            const result = plugin.extractSeriesInfo(fileName)

            expect(result.series).toBeUndefined()
            expect(result.commandName).toBe(baseName)
          }
        ),
        {numRuns: 100}
      )
    })

    it('should use only first underscore as delimiter', () => {
      const alphanumericNoUnderscore = fc.string({minLength: 1, maxLength: 10, unit: 'grapheme-ascii'}) // Generate alphanumeric strings without underscore
        .filter(s => /^[a-z0-9]+$/i.test(s))

      fc.assert(
        fc.property(
          alphanumericNoUnderscore,
          alphanumericNoUnderscore,
          alphanumericNoUnderscore,
          (seriesPrefix, part1, part2) => {
            const fileName = `${seriesPrefix}_${part1}_${part2}.mdx` // Create filename with multiple underscores
            const result = plugin.extractSeriesInfo(fileName)

            expect(result.series).toBe(seriesPrefix) // Series should be only the first part
            expect(result.commandName).toBe(`${part1}_${part2}`) // Command name should include everything after first underscore
          }
        ),
        {numRuns: 100}
      )
    })

    it('should handle pe_compile.mdx correctly', () => { // Unit tests for specific edge cases
      const result = plugin.extractSeriesInfo('pe_compile.mdx')
      expect(result.series).toBe('pe')
      expect(result.commandName).toBe('compile')
    })

    it('should handle compile.mdx correctly (no underscore)', () => {
      const result = plugin.extractSeriesInfo('compile.mdx')
      expect(result.series).toBeUndefined()
      expect(result.commandName).toBe('compile')
    })

    it('should handle pe_compile_all.mdx correctly (multiple underscores)', () => {
      const result = plugin.extractSeriesInfo('pe_compile_all.mdx')
      expect(result.series).toBe('pe')
      expect(result.commandName).toBe('compile_all')
    })

    it('should handle _compile.mdx correctly (empty prefix)', () => {
      const result = plugin.extractSeriesInfo('_compile.mdx')
      expect(result.series).toBe('')
      expect(result.commandName).toBe('compile')
    })
  })
})
