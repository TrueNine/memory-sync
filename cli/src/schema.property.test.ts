import * as fc from 'fast-check'
import {describe, expect, it} from 'vitest'
import {TNMSC_JSON_SCHEMA} from './schema'

const NUM_RUNS = 200

type SchemaObj = Record<string, unknown>
type SchemaProps = Record<string, SchemaObj>

const schema = TNMSC_JSON_SCHEMA as SchemaObj
const props = (schema['properties'] ?? {}) as SchemaProps

/**
 * Property-based tests for TNMSC_JSON_SCHEMA (Zod-generated).
 * Validates structural invariants that must hold for any derived copy or
 * serialization of the schema constant.
 */

describe('schema property tests — JSON round-trip', () => {
  it('structuredClone preserves deep equality', () => {
    fc.assert(
      fc.property(fc.constant(TNMSC_JSON_SCHEMA), s => { expect(structuredClone(s)).toEqual(s) }),
      {numRuns: NUM_RUNS}
    )
  })

  it('pretty-printing with any indent 0–8 always produces parseable JSON', () => {
    fc.assert(
      fc.property(fc.integer({min: 0, max: 8}), indent => {
        const pretty = JSON.stringify(TNMSC_JSON_SCHEMA, null, indent)
        expect(() => JSON.parse(pretty)).not.toThrow()
        const parsed = JSON.parse(pretty) as typeof TNMSC_JSON_SCHEMA
        expect(parsed).toEqual(TNMSC_JSON_SCHEMA)
      }),
      {numRuns: 50}
    )
  })
})

describe('schema property tests — logLevel enum completeness', () => {
  const validLevels = ['trace', 'debug', 'info', 'warn', 'error'] as const
  const levels = (props['logLevel']?.['enum'] ?? []) as string[]

  it('every valid log level is present in the enum', () => {
    fc.assert(
      fc.property(fc.constantFrom(...validLevels), level => { expect(levels).toContain(level) }),
      {numRuns: NUM_RUNS}
    )
  })

  it('no duplicate entries in logLevel enum', () => {
    fc.assert(
      fc.property(fc.constant(levels), ls => {
        const unique = new Set(ls)
        expect(unique.size).toBe(ls.length)
      }),
      {numRuns: 50}
    )
  })
})

describe('schema property tests — dirPair inline structure consistency', () => {
  const dirPairFields = ['skill', 'fastCommand', 'subAgent', 'rule', 'globalMemory', 'workspaceMemory', 'project'] as const
  const ssp = props['shadowSourceProject'] ?? {}
  const sspProps = (ssp['properties'] ?? {}) as SchemaProps

  it('every dirPair field is defined as an object schema', () => {
    fc.assert(
      fc.property(fc.constantFrom(...dirPairFields), field => {
        const fieldSchema = sspProps[field]
        expect(fieldSchema).toBeDefined()
        expect((fieldSchema as SchemaObj)?.['type']).toBe('object')
      }),
      {numRuns: NUM_RUNS}
    )
  })

  it('every dirPair field has src and dist properties', () => {
    fc.assert(
      fc.property(fc.constantFrom(...dirPairFields), field => {
        const fieldProps = sspProps[field]?.['properties'] as SchemaProps | undefined
        expect(fieldProps?.['src']).toBeDefined()
        expect(fieldProps?.['dist']).toBeDefined()
      }),
      {numRuns: NUM_RUNS}
    )
  })
})

describe('schema property tests — top-level property presence', () => {
  const requiredTopLevel = ['version', 'workspaceDir', 'logLevel', 'shadowSourceProject', 'fastCommandSeriesOptions', 'profile'] as const

  it('every expected top-level property is defined', () => {
    fc.assert(
      fc.property(fc.constantFrom(...requiredTopLevel), key => { expect(props[key]).toBeDefined() }),
      {numRuns: NUM_RUNS}
    )
  })
})
