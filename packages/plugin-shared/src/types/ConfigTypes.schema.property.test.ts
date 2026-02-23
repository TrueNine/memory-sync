import * as fc from 'fast-check'
import {describe, expect, it} from 'vitest'

import {ZProjectConfig, ZTypeSeriesConfig} from './ConfigTypes.schema'

describe('zProjectConfig property tests', () => { // Property 7: Zod schema round-trip. Validates: Requirement 1.5
  const seriesNameArb = fc.string({minLength: 1, maxLength: 20, unit: 'grapheme-ascii'}) // alphanumeric series names
    .filter(s => /^[\w-]+$/.test(s) && s !== '__proto__' && s !== 'constructor' && s !== 'prototype')

  const includeSeriesArb = fc.option( // optional string[]
    fc.array(seriesNameArb, {minLength: 0, maxLength: 5}),
    {nil: void 0}
  )

  const subSeriesArb = fc.option( // optional Record<string, string[]>
    fc.dictionary(
      seriesNameArb,
      fc.array(seriesNameArb, {minLength: 1, maxLength: 3}),
      {minKeys: 0, maxKeys: 3}
    ),
    {nil: void 0}
  )

  function stripUndefined(obj: Record<string, unknown>): Record<string, unknown> { // strip undefined to match Zod output
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(obj)) {
      if (value !== void 0) result[key] = value
    }
    return result
  }

  const typeSeriesConfigArb = fc.option( // optional TypeSeriesConfig
    fc.record({
      includeSeries: includeSeriesArb,
      subSeries: subSeriesArb
    }).map(obj => stripUndefined(obj)),
    {nil: void 0}
  )

  const projectConfigArb = fc.record({ // valid ProjectConfig (no mcp for simplicity)
    includeSeries: includeSeriesArb,
    subSeries: subSeriesArb,
    rules: typeSeriesConfigArb,
    skills: typeSeriesConfigArb,
    subAgents: typeSeriesConfigArb,
    commands: typeSeriesConfigArb
  }).map(obj => stripUndefined(obj))

  it('property 7: round-trip through JSON serialization preserves equivalence', () => { // Validates: Requirement 1.5
    fc.assert(
      fc.property(
        projectConfigArb,
        config => {
          const json = JSON.stringify(config)
          const parsed = ZProjectConfig.parse(JSON.parse(json))
          expect(parsed).toEqual(config)
        }
      ),
      {numRuns: 200}
    )
  })

  it('property 7: rejects configurations with incorrect includeSeries types', () => { // Validates: Requirement 1.5
    fc.assert(
      fc.property(
        fc.oneof(
          fc.integer(),
          fc.boolean(),
          fc.constant('not-an-array')
        ),
        invalidValue => {
          expect(() => ZProjectConfig.parse({includeSeries: invalidValue})).toThrow()
        }
      ),
      {numRuns: 50}
    )
  })

  it('property 7: ZTypeSeriesConfig round-trip through JSON serialization', () => { // Validates: Requirement 1.4
    fc.assert(
      fc.property(
        typeSeriesConfigArb.filter((v): v is Record<string, unknown> => v !== void 0),
        config => {
          const json = JSON.stringify(config)
          const parsed = ZTypeSeriesConfig.parse(JSON.parse(json))
          expect(parsed).toEqual(config)
        }
      ),
      {numRuns: 200}
    )
  })
})
