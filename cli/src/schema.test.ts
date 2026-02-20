import {describe, expect, it} from 'vitest'
import {TNMSC_JSON_SCHEMA} from './schema'

type SchemaObj = Record<string, unknown>
type SchemaProps = Record<string, SchemaObj>

const schema = TNMSC_JSON_SCHEMA as SchemaObj
const props = (schema['properties'] ?? {}) as SchemaProps

describe('tnmsc json schema — structural invariants', () => {
  it('is an object', () => expect(typeof schema).toBe('object'))

  it('has a properties object', () => expect(typeof schema['properties']).toBe('object'))

  it('root type is object', () => expect(schema['type']).toBe('object'))
})

describe('tnmsc json schema — top-level properties coverage', () => {
  it('defines version property', () => expect(props['version']).toBeDefined())

  it('defines workspaceDir property', () => expect(props['workspaceDir']).toBeDefined())

  it('defines logLevel property', () => expect(props['logLevel']).toBeDefined())

  it('defines shadowSourceProject property', () => expect(props['shadowSourceProject']).toBeDefined())

  it('defines fastCommandSeriesOptions property', () => expect(props['fastCommandSeriesOptions']).toBeDefined())

  it('defines profile property', () => expect(props['profile']).toBeDefined())

  it('logLevel is string type', () => expect(props['logLevel']?.['type']).toBe('string'))

  it('logLevel enum contains all five levels', () => {
    const levels = props['logLevel']?.['enum'] as string[] | undefined
    expect(levels).toBeDefined()
    expect(levels).toContain('trace')
    expect(levels).toContain('debug')
    expect(levels).toContain('info')
    expect(levels).toContain('warn')
    expect(levels).toContain('error')
    expect(levels).toHaveLength(5)
  })

  it('shadowSourceProject is object type', () => expect(props['shadowSourceProject']?.['type']).toBe('object'))

  it('fastCommandSeriesOptions is object type', () => expect(props['fastCommandSeriesOptions']?.['type']).toBe('object'))

  it('profile is object type', () => expect(props['profile']?.['type']).toBe('object'))
})

describe('tnmsc json schema — shadowSourceProject sub-schema', () => {
  const ssp = props['shadowSourceProject'] ?? {}
  const sspProps = (ssp['properties'] ?? {}) as SchemaProps

  it('requires name field', () => {
    const required = ssp['required'] as string[] | undefined
    expect(required).toContain('name')
  })

  it('defines name as string', () => expect(sspProps['name']?.['type']).toBe('string'))

  const dirPairFields = ['skill', 'fastCommand', 'subAgent', 'rule', 'globalMemory', 'workspaceMemory', 'project'] as const

  for (const field of dirPairFields) {
    it(`defines ${field} as object`, () => {
      const fieldSchema = sspProps[field]
      expect(fieldSchema).toBeDefined()
      expect(fieldSchema?.['type']).toBe('object')
    })
  }
})

describe('tnmsc json schema — dirPair inline structure', () => {
  const ssp = props['shadowSourceProject'] ?? {}
  const sspProps = (ssp['properties'] ?? {}) as SchemaProps
  const skillProps = sspProps['skill']?.['properties'] as SchemaProps | undefined

  it('skill has src property of type string', () => expect(skillProps?.['src']?.['type']).toBe('string'))

  it('skill has dist property of type string', () => expect(skillProps?.['dist']?.['type']).toBe('string'))
})

describe('tnmsc json schema — fastCommandSeriesOptions sub-schema', () => {
  const fcs = props['fastCommandSeriesOptions'] ?? {}
  const fcsProps = (fcs['properties'] ?? {}) as SchemaProps

  it('defines includeSeriesPrefix', () => expect(fcsProps['includeSeriesPrefix']).toBeDefined())

  it('includeSeriesPrefix is boolean type', () => expect(fcsProps['includeSeriesPrefix']?.['type']).toBe('boolean'))

  it('defines pluginOverrides', () => expect(fcsProps['pluginOverrides']).toBeDefined())
})

describe('tnmsc json schema — JSON round-trip', () => {
  it('serializes and deserializes without loss', () => {
    const serialized = JSON.stringify(TNMSC_JSON_SCHEMA)
    const deserialized = JSON.parse(serialized)
    expect(deserialized).toEqual(TNMSC_JSON_SCHEMA)
  })

  it('produces valid JSON string', () => expect(() => JSON.stringify(TNMSC_JSON_SCHEMA)).not.toThrow())

  it('pretty-printed output is non-empty', () => expect(JSON.stringify(TNMSC_JSON_SCHEMA, null, 2).length).toBeGreaterThan(100))
})

describe('tnmsc json schema — profile sub-schema', () => {
  const profile = props['profile'] ?? {}
  const profileProps = (profile['properties'] ?? {}) as SchemaProps

  it('defines name property', () => expect(profileProps['name']).toBeDefined())
  it('defines username property', () => expect(profileProps['username']).toBeDefined())
  it('defines gender property', () => expect(profileProps['gender']).toBeDefined())
  it('defines birthday property', () => expect(profileProps['birthday']).toBeDefined())
})
