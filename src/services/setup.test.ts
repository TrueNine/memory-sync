import { describe, expect, it } from 'vitest'
import fc from 'fast-check'

describe('Infrastructure setup verification', () => {
  it('should have fast-check installed and working', () => {
    fc.assert(
      fc.property(
        fc.integer(),
        (n) => {
          expect(n + 0).toBe(n)
        },
      ),
      { numRuns: 10 },
    )
  })

  it('should support property-based testing with strings', () => {
    fc.assert(
      fc.property(
        fc.string(),
        (s) => {
          expect(s.length).toBeGreaterThanOrEqual(0)
        },
      ),
      { numRuns: 10 },
    )
  })
})
