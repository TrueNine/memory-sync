/**
 * Feature: md-compiler-extraction, Property 4: Expression evaluation scope correctness
 *
 * For any scope object with string/number/boolean values and any simple variable
 * reference expression that exists in the scope, `evaluateExpression` SHALL return
 * the string representation of the scope value.
 *
 * **Validates: Requirements 3.5**
 */

import * as fc from 'fast-check'
import {describe, expect, it} from 'vitest'
import {evaluateExpression} from './expression-eval'

describe('expression-eval property tests', () => {
  describe('property 4: Expression evaluation scope correctness', () => {
    const identifierArb = fc.stringMatching(/^[a-z][a-zA-Z0-9]{0,9}$/)

    const primitiveValueArb = fc.oneof(
      fc.string({maxLength: 50, unit: 'grapheme-ascii'}),
      fc.integer({min: -1_000_000, max: 1_000_000}),
      fc.double({min: -1e6, max: 1e6, noNaN: true, noDefaultInfinity: true}),
      fc.boolean()
    )

    const nullishValueArb = fc.constantFrom(null, void 0)

    const scopeWithKeyArb = fc
      .array(
        fc.tuple(identifierArb, primitiveValueArb),
        {minLength: 1, maxLength: 5}
      )
      .chain(entries => {
        const deduped = new Map(entries) // Deduplicate keys, keeping last entry for each key
        const keys = [...deduped.keys()]
        return fc.integer({min: 0, max: keys.length - 1}).map(idx => { // Pick a random key index to use as the expression
          const scope: Record<string, unknown> = Object.fromEntries(deduped)
          const key = keys[idx]
          return {scope, expression: key, expectedValue: scope[key]}
        })
      })

    const scopeWithNullishKeyArb = fc
      .tuple(identifierArb, nullishValueArb)
      .map(([key, value]) => {
        const scope: Record<string, unknown> = {[key]: value}
        return {scope, expression: key, expectedValue: value}
      })

    const nestedScopeWithKeyArb = fc
      .tuple(identifierArb, identifierArb, primitiveValueArb)
      .filter(([parent, child]) => parent !== child)
      .map(([parentKey, childKey, value]) => {
        const scope: Record<string, unknown> = {
          [parentKey]: {[childKey]: value}
        }
        return {
          scope,
          expression: `${parentKey}.${childKey}`,
          expectedValue: value
        }
      })

    const deepNestedScopeWithKeyArb = fc
      .tuple(identifierArb, identifierArb, identifierArb, primitiveValueArb)
      .filter(([a, b, c]) => a !== b && b !== c && a !== c)
      .map(([keyA, keyB, keyC, value]) => {
        const scope: Record<string, unknown> = {
          [keyA]: {[keyB]: {[keyC]: value}}
        }
        return {
          scope,
          expression: `${keyA}.${keyB}.${keyC}`,
          expectedValue: value
        }
      })

    /** Convert a value to its expected string representation, matching evaluateExpression behavior. */
    function expectedString(value: unknown): string {
      if (value == null) return ''
      if (typeof value === 'string') return value
      if (typeof value === 'number' || typeof value === 'boolean') return String(value)
      return String(value)
    }

    it('should return the string representation for any flat scope primitive value', () => {
      fc.assert(
        fc.property(
          scopeWithKeyArb,
          ({scope, expression, expectedValue}) => {
            const result = evaluateExpression(expression, scope)
            expect(result).toBe(expectedString(expectedValue))
          }
        ),
        {numRuns: 100}
      )
    })

    it('should return empty string for null or undefined scope values', () => {
      fc.assert(
        fc.property(
          scopeWithNullishKeyArb,
          ({scope, expression}) => {
            const result = evaluateExpression(expression, scope)
            expect(result).toBe('')
          }
        ),
        {numRuns: 100}
      )
    })

    it('should return the string representation for nested property access', () => {
      fc.assert(
        fc.property(
          nestedScopeWithKeyArb,
          ({scope, expression, expectedValue}) => {
            const result = evaluateExpression(expression, scope)
            expect(result).toBe(expectedString(expectedValue))
          }
        ),
        {numRuns: 100}
      )
    })

    it('should return the string representation for deeply nested property access', () => {
      fc.assert(
        fc.property(
          deepNestedScopeWithKeyArb,
          ({scope, expression, expectedValue}) => {
            const result = evaluateExpression(expression, scope)
            expect(result).toBe(expectedString(expectedValue))
          }
        ),
        {numRuns: 100}
      )
    })

    it('should be consistent: evaluating the same expression twice yields the same result', () => {
      fc.assert(
        fc.property(
          scopeWithKeyArb,
          ({scope, expression}) => {
            const result1 = evaluateExpression(expression, scope)
            const result2 = evaluateExpression(expression, scope)
            expect(result1).toBe(result2)
          }
        ),
        {numRuns: 100}
      )
    })
  })
})
