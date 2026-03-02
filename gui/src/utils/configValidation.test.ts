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

// ─── workspaceDir ──────────────────────────────────────────────────────
describe('validateConfig — workspaceDir', () => {
  it('accepts a valid string', () => {
    expect(validateConfig({ workspaceDir: '/some/path' })).toHaveLength(0)
  })

  it('rejects non-string', () => {
    const errors = validateConfig({ workspaceDir: 123 })
    expect(errorFields(errors)).toContain('workspaceDir')
  })
})

// ─── version ───────────────────────────────────────────────────────────
describe('validateConfig — version', () => {
  it('accepts a valid string', () => {
    expect(validateConfig({ version: '2026.10218.0' })).toHaveLength(0)
  })

  it('rejects non-string', () => {
    const errors = validateConfig({ version: 42 })
    expect(errorFields(errors)).toContain('version')
  })
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

// ─── aindex ───────────────────────────────────────────────
describe('validateConfig — aindex', () => {
  const validAindex = {
    name: 'aindex',
    skill: { src: 'src/skills', dist: 'dist/skills' },
    fastCommand: { src: 'src/commands', dist: 'dist/commands' },
    subAgent: { src: 'src/agents', dist: 'dist/agents' },
    rule: { src: 'src/rules', dist: 'dist/rules' },
    globalMemory: { src: 'app/global.cn.mdx', dist: 'dist/global.mdx' },
    workspaceMemory: { src: 'app/workspace.cn.mdx', dist: 'dist/app/workspace.mdx' },
    project: { src: 'app', dist: 'dist/app' },
  }

  it('accepts a fully valid aindex', () => {
    expect(validateConfig({ aindex: validAindex })).toHaveLength(0)
  })

  it('accepts partial aindex with only name', () => {
    expect(validateConfig({ aindex: { name: 'myproject' } })).toHaveLength(0)
  })

  it('rejects non-object', () => {
    const errors = validateConfig({ aindex: 'invalid' })
    expect(errorFields(errors)).toContain('aindex')
  })

  it('rejects array', () => {
    const errors = validateConfig({ aindex: ['a'] })
    expect(errorFields(errors)).toContain('aindex')
  })

  it('rejects non-string name', () => {
    const errors = validateConfig({ aindex: { name: 123 } })
    expect(errorFields(errors)).toContain('aindex.name')
  })

  it('rejects invalid dir pair (non-object)', () => {
    const errors = validateConfig({ aindex: { name: 'x', skill: 'bad' } })
    expect(errorFields(errors)).toContain('aindex.skill')
  })

  it('rejects dir pair missing src', () => {
    const errors = validateConfig({ aindex: { name: 'x', skill: { dist: 'dist/skills' } } })
    expect(errorFields(errors)).toContain('aindex.skill.src')
  })

  it('rejects dir pair missing dist', () => {
    const errors = validateConfig({ aindex: { name: 'x', skill: { src: 'src/skills' } } })
    expect(errorFields(errors)).toContain('aindex.skill.dist')
  })

  it('rejects dir pair with non-string src', () => {
    const errors = validateConfig({ aindex: { name: 'x', skill: { src: 123, dist: 'dist/skills' } } })
    expect(errorFields(errors)).toContain('aindex.skill.src')
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

  it('warns on removed externalProjects field', () => {
    const errors = validateConfig({ externalProjects: ['/path'] })
    expect(warningFields(errors)).toContain('externalProjects')
  })

  it('warns on removed excludePatterns field', () => {
    const errors = validateConfig({ excludePatterns: {} })
    expect(warningFields(errors)).toContain('excludePatterns')
  })
})

// ─── combined / realistic configs ──────────────────────────────────────
describe('validateConfig — realistic configs', () => {
  it('validates a fully valid config', () => {
    const config = {
      version: '2026.10218.0',
      workspaceDir: '/workspace',
      aindex: {
        name: 'aindex',
        skill: { src: 'src/skills', dist: 'dist/skills' },
        fastCommand: { src: 'src/commands', dist: 'dist/commands' },
        subAgent: { src: 'src/agents', dist: 'dist/agents' },
        rule: { src: 'src/rules', dist: 'dist/rules' },
        globalMemory: { src: 'app/global.cn.mdx', dist: 'dist/global.mdx' },
        workspaceMemory: { src: 'app/workspace.cn.mdx', dist: 'dist/app/workspace.mdx' },
        project: { src: 'app', dist: 'dist/app' },
      },
      logLevel: 'debug',
      profile: { name: 'test' },
      tool: { editor: 'vscode' },
    }
    expect(validateConfig(config)).toHaveLength(0)
  })

  it('collects multiple errors from a bad config', () => {
    const config = {
      workspaceDir: 123,
      logLevel: 'invalid',
      aindex: 'not-object',
    }
    const errors = validateConfig(config)
    const fields = errorFields(errors)
    expect(fields).toContain('workspaceDir')
    expect(fields).toContain('logLevel')
    expect(fields).toContain('aindex')
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
