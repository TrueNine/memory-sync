import * as fc from 'fast-check'
import {describe, expect, it} from 'vitest'

import {matchesSeries, resolveEffectiveIncludeSeries} from './seriesFilter'

/** Property 1: Effective IncludeSeries is the set union. Validates: Requirements 3.1, 3.2, 3.3, 3.4 */
describe('resolveEffectiveIncludeSeries property tests', () => {
  const seriesNameArb = fc.string({minLength: 1, maxLength: 20, unit: 'grapheme-ascii'})
    .filter(s => /^[\w-]+$/.test(s))

  const optionalSeriesArb = fc.option(fc.array(seriesNameArb, {minLength: 0, maxLength: 10}), {nil: void 0})

  it('property 1: result is the set union of both inputs, undefined treated as empty', () => { // **Validates: Requirements 3.1, 3.2, 3.3, 3.4**
    fc.assert(
      fc.property(
        optionalSeriesArb,
        optionalSeriesArb,
        (topLevel, typeSpecific) => {
          const result = resolveEffectiveIncludeSeries(topLevel, typeSpecific)
          const expectedUnion = new Set([...topLevel ?? [], ...typeSpecific ?? []])

          for (const item of result) expect(expectedUnion.has(item)).toBe(true) // every result element comes from an input
          for (const item of expectedUnion) expect(result).toContain(item) // every input element is in the result
          expect(result.length).toBe(new Set(result).size) // no duplicates
        }
      ),
      {numRuns: 200}
    )
  })

  it('property 1: both undefined yields empty array', () => { // **Validates: Requirement 3.4**
    const result = resolveEffectiveIncludeSeries(void 0, void 0)
    expect(result).toEqual([])
  })

  it('property 1: only top-level defined yields top-level (deduplicated)', () => { // **Validates: Requirement 3.2**
    fc.assert(
      fc.property(
        fc.array(seriesNameArb, {minLength: 1, maxLength: 10}),
        topLevel => {
          const result = resolveEffectiveIncludeSeries(topLevel, void 0)
          const expected = [...new Set(topLevel)]
          expect(result).toEqual(expected)
        }
      ),
      {numRuns: 200}
    )
  })

  it('property 1: only type-specific defined yields type-specific (deduplicated)', () => { // **Validates: Requirement 3.3**
    fc.assert(
      fc.property(
        fc.array(seriesNameArb, {minLength: 1, maxLength: 10}),
        typeSpecific => {
          const result = resolveEffectiveIncludeSeries(void 0, typeSpecific)
          const expected = [...new Set(typeSpecific)]
          expect(result).toEqual(expected)
        }
      ),
      {numRuns: 200}
    )
  })
})

/** Property 2: Series matching correctness. Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5 */
describe('matchesSeries property tests', () => {
  const seriesNameArb = fc.string({minLength: 1, maxLength: 20, unit: 'grapheme-ascii'})
    .filter(s => /^[\w-]+$/.test(s))

  const nonEmptySeriesListArb = fc.array(seriesNameArb, {minLength: 1, maxLength: 10})
    .map(arr => [...new Set(arr)])
    .filter(arr => arr.length > 0)

  const seriNameArb: fc.Arbitrary<string | string[] | null | undefined> = fc.oneof(
    fc.constant(null),
    fc.constant(void 0),
    seriesNameArb,
    fc.array(seriesNameArb, {minLength: 0, maxLength: 5})
  )

  it('property 2: null/undefined seriName is always included regardless of list', () => { // **Validates: Requirements 4.1**
    fc.assert(
      fc.property(
        fc.oneof(fc.constant(null), fc.constant(void 0)),
        nonEmptySeriesListArb,
        (seriName, list) => {
          expect(matchesSeries(seriName, list)).toBe(true)
        }
      ),
      {numRuns: 200}
    )
  })

  it('property 2: empty effectiveIncludeSeries includes all seriName values', () => { // **Validates: Requirements 4.4**
    fc.assert(
      fc.property(
        seriNameArb,
        seriName => {
          expect(matchesSeries(seriName, [])).toBe(true)
        }
      ),
      {numRuns: 200}
    )
  })

  it('property 2: string seriName included iff it is a member of the list', () => { // **Validates: Requirements 4.2, 4.5**
    fc.assert(
      fc.property(
        seriesNameArb,
        nonEmptySeriesListArb,
        (seriName, list) => {
          const result = matchesSeries(seriName, list)
          const expected = list.includes(seriName)
          expect(result).toBe(expected)
        }
      ),
      {numRuns: 200}
    )
  })

  it('property 2: array seriName included iff intersection with list is non-empty', () => { // **Validates: Requirements 4.3**
    fc.assert(
      fc.property(
        fc.array(seriesNameArb, {minLength: 0, maxLength: 5}),
        nonEmptySeriesListArb,
        (seriNameArr, list) => {
          const result = matchesSeries(seriNameArr, list)
          const hasIntersection = seriNameArr.some(n => list.includes(n))
          expect(result).toBe(hasIntersection)
        }
      ),
      {numRuns: 200}
    )
  })

  it('property 2: combined — all seriName variants obey spec rules', () => { // **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5**
    fc.assert(
      fc.property(
        seriNameArb,
        fc.oneof(fc.constant([] as string[]), nonEmptySeriesListArb),
        (seriName, list) => {
          const result = matchesSeries(seriName, list)

          if (seriName == null) {
            expect(result).toBe(true) // 4.1
          } else if (list.length === 0) {
            expect(result).toBe(true) // 4.4
          } else if (typeof seriName === 'string') {
            expect(result).toBe(list.includes(seriName)) // 4.2, 4.5
          } else {
            expect(result).toBe(seriName.some(n => list.includes(n))) // 4.3
          }
        }
      ),
      {numRuns: 300}
    )
  })
})
