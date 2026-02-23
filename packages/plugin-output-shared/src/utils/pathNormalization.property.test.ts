/** Property 4: SubSeries path normalization idempotence. Validates: Requirement 5.4 */
import * as fc from 'fast-check'
import {describe, expect, it} from 'vitest'

import {normalizeSubdirPath} from './ruleFilter'

const pathArb = fc.stringMatching(/^[./_a-z0-9-]{0,40}$/)

const subdirPathArb = fc.oneof(
  fc.constant('./foo/'),
  fc.constant('foo/'),
  fc.constant('./foo'),
  fc.constant('foo'),
  fc.constant(''),
  fc.constant('./'),
  fc.constant('.//foo//'),
  fc.constant('././foo///'),
  fc.constant('./a/b/c/'),
  pathArb
)

describe('property 4: subSeries path normalization idempotence', () => {
  it('normalize(normalize(p)) === normalize(p) for arbitrary path strings', () => { // **Validates: Requirement 5.4**
    fc.assert(
      fc.property(subdirPathArb, p => {
        const once = normalizeSubdirPath(p)
        const twice = normalizeSubdirPath(once)
        expect(twice).toBe(once)
      }),
      {numRuns: 200}
    )
  })

  it('result never starts with ./', () => { // **Validates: Requirement 5.4**
    fc.assert(
      fc.property(subdirPathArb, p => {
        const result = normalizeSubdirPath(p)
        expect(result.startsWith('./')).toBe(false)
      }),
      {numRuns: 200}
    )
  })

  it('result never ends with /', () => { // **Validates: Requirement 5.4**
    fc.assert(
      fc.property(subdirPathArb, p => {
        const result = normalizeSubdirPath(p)
        expect(result.endsWith('/')).toBe(false)
      }),
      {numRuns: 200}
    )
  })

  it('empty string stays empty', () => { // **Validates: Requirement 5.4**
    expect(normalizeSubdirPath('')).toBe('')
  })
})
