/** Property 5: NAPI and TypeScript behavioral equivalence. Validates: Requirement 6.4 */
import * as napiConfig from '@truenine/config'
import * as fc from 'fast-check'
import {describe, expect, it} from 'vitest'

const napiAvailable = typeof napiConfig.matchesSeries === 'function'
  && typeof napiConfig.resolveEffectiveIncludeSeries === 'function'
  && typeof napiConfig.resolveSubSeries === 'function'

function resolveEffectiveIncludeSeriesTS(topLevel?: readonly string[], typeSpecific?: readonly string[]): string[] {
  if (topLevel == null && typeSpecific == null) return []
  return [...new Set([...topLevel ?? [], ...typeSpecific ?? []])]
}

function matchesSeriesTS(seriName: string | readonly string[] | null | undefined, effectiveIncludeSeries: readonly string[]): boolean {
  if (seriName == null) return true
  if (effectiveIncludeSeries.length === 0) return true
  if (typeof seriName === 'string') return effectiveIncludeSeries.includes(seriName)
  return seriName.some(name => effectiveIncludeSeries.includes(name))
}

function resolveSubSeriesTS(
  topLevel?: Readonly<Record<string, readonly string[]>>,
  typeSpecific?: Readonly<Record<string, readonly string[]>>
): Record<string, string[]> {
  if (topLevel == null && typeSpecific == null) return {}
  const merged: Record<string, string[]> = {}
  for (const [key, values] of Object.entries(topLevel ?? {})) merged[key] = [...values]
  for (const [key, values] of Object.entries(typeSpecific ?? {})) {
    merged[key] = Object.hasOwn(merged, key) ? [...new Set([...merged[key]!, ...values])] : [...values]
  }
  return merged
}

const seriesNameArb = fc.string({minLength: 1, maxLength: 20, unit: 'grapheme-ascii'})
  .filter(s => /^[\w-]+$/.test(s) && !['__proto__', 'constructor', 'toString', 'valueOf', 'hasOwnProperty'].includes(s))

const optionalSeriesArb = fc.option(fc.array(seriesNameArb, {minLength: 0, maxLength: 10}), {nil: void 0})

const seriNameArb: fc.Arbitrary<string | string[] | null | undefined> = fc.oneof(
  fc.constant(null),
  fc.constant(void 0),
  seriesNameArb,
  fc.array(seriesNameArb, {minLength: 0, maxLength: 5})
)

const subSeriesRecordArb = fc.option(
  fc.dictionary(seriesNameArb, fc.array(seriesNameArb, {minLength: 0, maxLength: 5})),
  {nil: void 0}
)

function sortedArray(arr: readonly string[]): string[] {
  return [...arr].sort()
}

function sortedRecord(rec: Readonly<Record<string, readonly string[]>>): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const key of Object.keys(rec).sort()) out[key] = [...new Set(rec[key])].sort()
  return out
}

describe.skipIf(!napiAvailable)('property 5: NAPI and TypeScript behavioral equivalence', () => {
  it('resolveEffectiveIncludeSeries: NAPI and TS produce same set', () => { // **Validates: Requirement 6.4**
    fc.assert(
      fc.property(
        optionalSeriesArb,
        optionalSeriesArb,
        (topLevel, typeSpecific) => {
          const napiResult = napiConfig.resolveEffectiveIncludeSeries(topLevel, typeSpecific)
          const tsResult = resolveEffectiveIncludeSeriesTS(topLevel, typeSpecific)
          expect(sortedArray(napiResult)).toEqual(sortedArray(tsResult))
        }
      ),
      {numRuns: 200}
    )
  })

  it('matchesSeries: NAPI and TS produce identical boolean', () => { // **Validates: Requirement 6.4**
    fc.assert(
      fc.property(
        seriNameArb,
        fc.array(seriesNameArb, {minLength: 0, maxLength: 10}),
        (seriName, list) => {
          const napiResult = napiConfig.matchesSeries(seriName, list)
          const tsResult = matchesSeriesTS(seriName, list)
          expect(napiResult).toBe(tsResult)
        }
      ),
      {numRuns: 200}
    )
  })

  it('resolveSubSeries: NAPI and TS produce same merged record', () => { // **Validates: Requirement 6.4**
    fc.assert(
      fc.property(
        subSeriesRecordArb,
        subSeriesRecordArb,
        (topLevel, typeSpecific) => {
          const napiResult = napiConfig.resolveSubSeries(topLevel, typeSpecific)
          const tsResult = resolveSubSeriesTS(topLevel, typeSpecific)
          expect(sortedRecord(napiResult)).toEqual(sortedRecord(tsResult))
        }
      ),
      {numRuns: 200}
    )
  })
})
