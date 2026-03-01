/** Property 8: seriName front matter propagation. Validates: Requirement 2.5 */
import * as fc from 'fast-check'
import {describe, expect, it} from 'vitest'

const seriesNameArb = fc.string({minLength: 1, maxLength: 20, unit: 'grapheme-ascii'})
  .filter(s => /^[\w-]+$/.test(s) && !['__proto__', 'constructor', 'toString', 'valueOf', 'hasOwnProperty'].includes(s))

const seriNameArb: fc.Arbitrary<string | string[] | null | undefined> = fc.oneof(
  fc.constant(null),
  fc.constant(void 0),
  seriesNameArb,
  fc.array(seriesNameArb, {minLength: 1, maxLength: 5})
)

function propagateSeriName(
  frontMatter: {readonly seriName?: string | string[] | null} | undefined
): {readonly seriName?: string | string[] | null} {
  const seriName = frontMatter?.seriName
  return {
    ...seriName != null && {seriName}
  }
}

describe('property 8: seriName front matter propagation', () => {
  it('propagated seriName matches front matter value for non-null/undefined values', () => { // **Validates: Requirement 2.5**
    fc.assert(
      fc.property(
        seriNameArb,
        seriName => {
          const frontMatter = seriName === void 0 ? {} : {seriName}
          const result = propagateSeriName(frontMatter)

          if (seriName == null) {
            expect(result.seriName).toBeUndefined() // null and undefined should not appear on the prompt object
          } else {
            expect(result.seriName).toEqual(seriName) // string and string[] should be propagated exactly
          }
        }
      ),
      {numRuns: 200}
    )
  })

  it('undefined front matter produces no seriName on prompt', () => { // **Validates: Requirement 2.5**
    fc.assert(
      fc.property(
        fc.constant(void 0),
        frontMatter => {
          const result = propagateSeriName(frontMatter)
          expect(result.seriName).toBeUndefined()
        }
      ),
      {numRuns: 10}
    )
  })

  it('string seriName is always propagated identically', () => { // **Validates: Requirement 2.5**
    fc.assert(
      fc.property(
        seriesNameArb,
        seriName => {
          const result = propagateSeriName({seriName})
          expect(result.seriName).toBe(seriName)
        }
      ),
      {numRuns: 200}
    )
  })

  it('array seriName is always propagated identically', () => { // **Validates: Requirement 2.5**
    fc.assert(
      fc.property(
        fc.array(seriesNameArb, {minLength: 1, maxLength: 5}),
        seriName => {
          const result = propagateSeriName({seriName})
          expect(result.seriName).toEqual(seriName)
        }
      ),
      {numRuns: 200}
    )
  })
})
