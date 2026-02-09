import { describe, expect, it } from 'vitest'

import type { ValidationError } from '@/utils/configValidation'
import { isConfigValid, validateConfig } from '@/utils/configValidation'

// ─── helpers ───────────────────────────────────────────────────────────
const errorFields = (errors: readonly ValidationError[]): string[] =>
  errors.filter((e) => e.severity === 'error').map((e) => e.field)

const warningFields = (errors: readonly ValidationError[]): string[] =>
  errors.filter((e) => e.severity === 'warning').map((e) => e.field)

// ─── root-level guard ──────────────────────────────────────────────────
describe('validateConfig — root-level guard', () => {
  it('rejects null', () => {
    const errors = validateConfig(null)
    expect(errors).toHaveLength(1)
    expect(errors[0].severity).toBe('error')
    expect(errors[0].message).toMatch(/non-null object/)
  })

  it('rejects undefined', () => {
    const errors = validateConfig(undefined)
    expect(errors).toHaveLength(1)
    expect(errors[0].severity).toBe('error')
  })

  it('rejects arrays', () => {
    const errors = validateConfig([1, 2])
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toMatch(/plain object/)
  })

  it('rejects primitives', () => {
    for (const v of [42, 'hello', true]) {
      const errors = validateConfig(v)
      expect(errors.length).toBeGreaterThan(0)
    }
  })

  it('accepts an empty object', () => {
    expect(validateConfig({})).toHaveLength(0)
  })
})

// ─── string fields ─────────────────────────────────────────────────────
describe('validateConfig — string fields', () => {
  const stringFields = [
    'workspaceDir',
    'shadowSourceProjectDir',
    'shadowSkillSourceDir',
    'shadowFastCommandDir',
    'shadowSubAgentDir',
    'globalMemoryFile',
    'shadowProjectsDir',
  ] as const

  for (const field of stringFields) {
    it(`accepts valid string for ${field}`, () => {
      expect(validateConfig({ [field]: '/some/path' })).toHaveLength(0)
    })

    it(`rejects non-string for ${field}`, () => {
      const errors = validateConfig({ [field]: 123 })
      expect(errorFields(errors)).toContain(field)
    })
  }
})

// ─── logLevel ──────────────────────────────────────────────────────────
describe('validateConfig — logLevel', () => {
  for (const level of ['trace', 'debug', 'info', 'warn', 'error']) {
    it(`accepts "${level}"`, () => {
      expect(validateConfig({ logLevel: level })).toHaveLength(0)
    })
  }

  it('rejects invalid string', () => {
    const errors = validateConfig({ logLevel: 'verbose' })
    expect(errorFields(errors)).toContain('logLevel')
  })

  it('rejects non-string', () => {
    const errors = validateConfig({ logLevel: 42 })
    expect(errorFields(errors)).toContain('logLevel')
  })
})

// ─── externalProjects ──────────────────────────────────────────────────
describe('validateConfig — externalProjects', () => {
  it('accepts a string array', () => {
    expect(validateConfig({ externalProjects: ['/a', '/b'] })).toHaveLength(0)
  })

  it('accepts an empty array', () => {
    expect(validateConfig({ externalProjects: [] })).toHaveLength(0)
  })

  it('rejects non-array', () => {
    const errors = validateConfig({ externalProjects: 'oops' })
    expect(errorFields(errors)).toContain('externalProjects')
  })

  it('rejects array with non-string items', () => {
    const errors = validateConfig({ externalProjects: ['/a', 42] })
    expect(errorFields(errors)).toContain('externalProjects')
  })
})

// ─── excludePatterns ───────────────────────────────────────────────────
describe('validateConfig — excludePatterns', () => {
  it('accepts valid object with string arrays', () => {
    expect(validateConfig({ excludePatterns: { foo: ['a', 'b'], bar: ['c'] } })).toHaveLength(0)
  })

  it('accepts empty object', () => {
    expect(validateConfig({ excludePatterns: {} })).toHaveLength(0)
  })

  it('rejects non-object', () => {
    const errors = validateConfig({ excludePatterns: 'bad' })
    expect(errorFields(errors)).toContain('excludePatterns')
  })

  it('rejects array', () => {
    const errors = validateConfig({ excludePatterns: ['a'] })
    expect(errorFields(errors)).toContain('excludePatterns')
  })

  it('rejects null', () => {
    const errors = validateConfig({ excludePatterns: null })
    expect(errorFields(errors)).toContain('excludePatterns')
  })

  it('rejects nested non-string-array values', () => {
    const errors = validateConfig({ excludePatterns: { ok: ['a'], bad: 42 } })
    expect(errorFields(errors)).toContain('excludePatterns.bad')
  })

  it('rejects nested arrays with non-string items', () => {
    const errors = validateConfig({ excludePatterns: { x: [1, 2] } })
    expect(errorFields(errors)).toContain('excludePatterns.x')
  })
})

// ─── profile ───────────────────────────────────────────────────────────
describe('validateConfig — profile', () => {
  it('accepts a plain object', () => {
    expect(validateConfig({ profile: { name: 'TrueNine' } })).toHaveLength(0)
  })

  it('rejects non-object', () => {
    const errors = validateConfig({ profile: 'bad' })
    expect(errorFields(errors)).toContain('profile')
  })

  it('rejects array', () => {
    const errors = validateConfig({ profile: [1] })
    expect(errorFields(errors)).toContain('profile')
  })

  it('rejects null', () => {
    const errors = validateConfig({ profile: null })
    expect(errorFields(errors)).toContain('profile')
  })
})

// ─── tool ──────────────────────────────────────────────────────────────
describe('validateConfig — tool', () => {
  it('accepts object with string values', () => {
    expect(validateConfig({ tool: { a: 'x', b: 'y' } })).toHaveLength(0)
  })

  it('accepts object with undefined values', () => {
    expect(validateConfig({ tool: { a: undefined } })).toHaveLength(0)
  })

  it('rejects non-object', () => {
    const errors = validateConfig({ tool: 'bad' })
    expect(errorFields(errors)).toContain('tool')
  })

  it('rejects array', () => {
    const errors = validateConfig({ tool: [] })
    expect(errorFields(errors)).toContain('tool')
  })

  it('rejects null', () => {
    const errors = validateConfig({ tool: null })
    expect(errorFields(errors)).toContain('tool')
  })

  it('rejects non-string values inside tool', () => {
    const errors = validateConfig({ tool: { a: 123 } })
    expect(errorFields(errors)).toContain('tool.a')
  })
})

// ─── fastCommandSeriesOptions ──────────────────────────────────────────
describe('validateConfig — fastCommandSeriesOptions', () => {
  it('accepts a plain object', () => {
    expect(validateConfig({ fastCommandSeriesOptions: { includeSeriesPrefix: true } })).toHaveLength(0)
  })

  it('rejects non-object', () => {
    const errors = validateConfig({ fastCommandSeriesOptions: 42 })
    expect(errorFields(errors)).toContain('fastCommandSeriesOptions')
  })

  it('rejects array', () => {
    const errors = validateConfig({ fastCommandSeriesOptions: [] })
    expect(errorFields(errors)).toContain('fastCommandSeriesOptions')
  })

  it('rejects null', () => {
    const errors = validateConfig({ fastCommandSeriesOptions: null })
    expect(errorFields(errors)).toContain('fastCommandSeriesOptions')
  })
})

// ─── unknown fields → warnings ─────────────────────────────────────────
describe('validateConfig — unknown fields', () => {
  it('produces a warning for unknown top-level keys', () => {
    const errors = validateConfig({ unknownKey: 'value' })
    expect(warningFields(errors)).toContain('unknownKey')
    expect(errors[0].severity).toBe('warning')
  })

  it('produces warnings for multiple unknown keys', () => {
    const errors = validateConfig({ foo: 1, bar: 2 })
    expect(warningFields(errors)).toEqual(expect.arrayContaining(['foo', 'bar']))
  })

  it('does not produce warnings for known fields', () => {
    const errors = validateConfig({ logLevel: 'info', workspaceDir: '/a' })
    expect(warningFields(errors)).toHaveLength(0)
  })
})

// ─── combined / realistic configs ──────────────────────────────────────
describe('validateConfig — realistic configs', () => {
  it('validates a fully valid config', () => {
    const config = {
      workspaceDir: '/workspace',
      shadowSourceProjectDir: '/shadow',
      logLevel: 'debug',
      externalProjects: ['/ext1', '/ext2'],
      excludePatterns: { node_modules: ['**/*'] },
      profile: { name: 'test' },
      tool: { editor: 'vscode' },
    }
    expect(validateConfig(config)).toHaveLength(0)
  })

  it('collects multiple errors from a bad config', () => {
    const config = {
      workspaceDir: 123,
      logLevel: 'invalid',
      externalProjects: 'not-array',
      excludePatterns: null,
    }
    const errors = validateConfig(config)
    const fields = errorFields(errors)
    expect(fields).toContain('workspaceDir')
    expect(fields).toContain('logLevel')
    expect(fields).toContain('externalProjects')
    expect(fields).toContain('excludePatterns')
  })

  it('mixes errors and warnings', () => {
    const config = { logLevel: 999, unknownStuff: true }
    const errors = validateConfig(config)
    expect(errors.filter((e) => e.severity === 'error')).toHaveLength(1)
    expect(errors.filter((e) => e.severity === 'warning')).toHaveLength(1)
  })
})

// ─── isConfigValid helper ──────────────────────────────────────────────
describe('isConfigValid', () => {
  it('returns true for a valid config', () => {
    expect(isConfigValid({ logLevel: 'info' })).toBe(true)
  })

  it('returns true when only warnings exist', () => {
    expect(isConfigValid({ unknownKey: 'val' })).toBe(true)
  })

  it('returns false when errors exist', () => {
    expect(isConfigValid({ logLevel: 'nope' })).toBe(false)
  })

  it('returns false for null', () => {
    expect(isConfigValid(null)).toBe(false)
  })
})
