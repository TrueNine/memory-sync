import * as fc from 'fast-check'
import {describe, expect, it} from 'vitest'
import {SubAgentInputPlugin} from './SubAgentInputPlugin'

describe('subAgentInputPlugin', () => {
  describe('extractSeriesInfo', () => {
    const plugin = new SubAgentInputPlugin()

    it('should derive series from parentDirName when provided', () => {
      const alphanumericNoUnderscore = fc.string({minLength: 1, maxLength: 10, unit: 'grapheme-ascii'})
        .filter(s => /^[a-z0-9]+$/i.test(s))

      const alphanumericAgentName = fc.string({minLength: 1, maxLength: 20, unit: 'grapheme-ascii'})
        .filter(s => /^[\w-]+$/.test(s))

      fc.assert(
        fc.property(
          alphanumericNoUnderscore,
          alphanumericAgentName,
          (parentDir, agentName) => {
            const fileName = `${agentName}.mdx`
            const result = plugin.extractSeriesInfo(fileName, parentDir)

            expect(result.series).toBe(parentDir)
            expect(result.agentName).toBe(agentName)
          }
        ),
        {numRuns: 100}
      )
    })

    it('should handle explore/deep.cn.mdx subdirectory format', () => {
      const result = plugin.extractSeriesInfo('deep.cn.mdx', 'explore')
      expect(result.series).toBe('explore')
      expect(result.agentName).toBe('deep.cn')
    })

    it('should handle context/gatherer.cn.mdx subdirectory format', () => {
      const result = plugin.extractSeriesInfo('gatherer.cn.mdx', 'context')
      expect(result.series).toBe('context')
      expect(result.agentName).toBe('gatherer.cn')
    })

    it('should extract series as substring before first underscore for filenames with underscore', () => {
      const alphanumericNoUnderscore = fc.string({minLength: 1, maxLength: 10, unit: 'grapheme-ascii'})
        .filter(s => /^[a-z0-9]+$/i.test(s))

      const alphanumericWithUnderscore = fc.string({minLength: 1, maxLength: 20, unit: 'grapheme-ascii'})
        .filter(s => /^\w+$/.test(s))

      fc.assert(
        fc.property(
          alphanumericNoUnderscore,
          alphanumericWithUnderscore,
          (seriesPrefix, agentName) => {
            const fileName = `${seriesPrefix}_${agentName}.mdx`
            const result = plugin.extractSeriesInfo(fileName)

            expect(result.series).toBe(seriesPrefix)
            expect(result.agentName).toBe(agentName)
          }
        ),
        {numRuns: 100}
      )
    })

    it('should return undefined series for filenames without underscore', () => {
      const alphanumericNoUnderscore = fc.string({minLength: 1, maxLength: 20, unit: 'grapheme-ascii'})
        .filter(s => /^[a-z0-9]+$/i.test(s))

      fc.assert(
        fc.property(
          alphanumericNoUnderscore,
          baseName => {
            const fileName = `${baseName}.mdx`
            const result = plugin.extractSeriesInfo(fileName)

            expect(result.series).toBeUndefined()
            expect(result.agentName).toBe(baseName)
          }
        ),
        {numRuns: 100}
      )
    })

    it('should use only first underscore as delimiter', () => {
      const alphanumericNoUnderscore = fc.string({minLength: 1, maxLength: 10, unit: 'grapheme-ascii'})
        .filter(s => /^[a-z0-9]+$/i.test(s))

      fc.assert(
        fc.property(
          alphanumericNoUnderscore,
          alphanumericNoUnderscore,
          alphanumericNoUnderscore,
          (seriesPrefix, part1, part2) => {
            const fileName = `${seriesPrefix}_${part1}_${part2}.mdx`
            const result = plugin.extractSeriesInfo(fileName)

            expect(result.series).toBe(seriesPrefix)
            expect(result.agentName).toBe(`${part1}_${part2}`)
          }
        ),
        {numRuns: 100}
      )
    })

    it('should handle explore_deep.mdx correctly', () => {
      const result = plugin.extractSeriesInfo('explore_deep.mdx')
      expect(result.series).toBe('explore')
      expect(result.agentName).toBe('deep')
    })

    it('should handle simple.mdx correctly (no underscore)', () => {
      const result = plugin.extractSeriesInfo('simple.mdx')
      expect(result.series).toBeUndefined()
      expect(result.agentName).toBe('simple')
    })

    it('should handle explore_deep_search.mdx correctly (multiple underscores)', () => {
      const result = plugin.extractSeriesInfo('explore_deep_search.mdx')
      expect(result.series).toBe('explore')
      expect(result.agentName).toBe('deep_search')
    })

    it('should handle _agent.mdx correctly (empty prefix)', () => {
      const result = plugin.extractSeriesInfo('_agent.mdx')
      expect(result.series).toBe('')
      expect(result.agentName).toBe('agent')
    })

    it('should prioritize parentDirName over underscore naming', () => {
      const result = plugin.extractSeriesInfo('explore_deep.mdx', 'context')
      expect(result.series).toBe('context')
      expect(result.agentName).toBe('explore_deep')
    })
  })
})
