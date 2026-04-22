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

// ─── removed path fields ───────────────────────────────────────────────
describe('validateConfig — removed aindex path fields', () => {
  it('warns on removed flat dir field', () => {
    const errors = validateConfig({ dir: 'aindex' })
    expect(errorFields(errors)).toEqual([])
    expect(warningFields(errors)).toContain('dir')
  })

  it('warns on removed flat path pair fields', () => {
    const errors = validateConfig({ skills: { src: 'skills', dist: 'dist/skills' } })
    expect(errorFields(errors)).toEqual([])
    expect(warningFields(errors)).toContain('skills')
  })

  it('warns on removed legacy nested aindex wrapper', () => {
    const errors = validateConfig({ aindex: { skills: { src: 'skills', dist: 'dist/skills' } } })
    expect(errorFields(errors)).toEqual([])
    expect(warningFields(errors)).toContain('aindex')
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

// ─── codeStyles ────────────────────────────────────────────────────────
describe('validateConfig — codeStyles', () => {
  it('accepts a valid codeStyles object', () => {
    expect(validateConfig({ codeStyles: { indent: 'space', tabSize: 2 } })).toHaveLength(0)
  })

  it('accepts extra keys inside codeStyles', () => {
    expect(validateConfig({ codeStyles: { indent: 'tab', quoteStyle: 'single' } })).toHaveLength(0)
  })

  it('rejects non-object', () => {
    const errors = validateConfig({ codeStyles: 'bad' })
    expect(errorFields(errors)).toContain('codeStyles')
  })

  it('rejects invalid indent', () => {
    const errors = validateConfig({ codeStyles: { indent: 'mixed' } })
    expect(errorFields(errors)).toContain('codeStyles.indent')
  })

  it('rejects non-positive tabSize', () => {
    const errors = validateConfig({ codeStyles: { tabSize: 0 } })
    expect(errorFields(errors)).toContain('codeStyles.tabSize')
  })
})

// ─── commandSeriesOptions ───────────────────────────────────────────────
describe('validateConfig — commandSeriesOptions', () => {
  it('accepts a plain object', () => {
    expect(validateConfig({ commandSeriesOptions: { includeSeriesPrefix: true } })).toHaveLength(0)
  })

  it('rejects non-object', () => {
    const errors = validateConfig({ commandSeriesOptions: 42 })
    expect(errorFields(errors)).toContain('commandSeriesOptions')
  })

  it('rejects array', () => {
    const errors = validateConfig({ commandSeriesOptions: [] })
    expect(errorFields(errors)).toContain('commandSeriesOptions')
  })

  it('rejects null', () => {
    const errors = validateConfig({ commandSeriesOptions: null })
    expect(errorFields(errors)).toContain('commandSeriesOptions')
  })
})

// ─── outputScopes ───────────────────────────────────────────────────────
describe('validateConfig — outputScopes', () => {
  it('accepts a plain object', () => {
    expect(validateConfig({ outputScopes: { plugins: {} } })).toHaveLength(0)
  })

  it('rejects non-object', () => {
    const errors = validateConfig({ outputScopes: 42 })
    expect(errorFields(errors)).toContain('outputScopes')
  })

  it('rejects array', () => {
    const errors = validateConfig({ outputScopes: [] })
    expect(errorFields(errors)).toContain('outputScopes')
  })

  it('rejects null', () => {
    const errors = validateConfig({ outputScopes: null })
    expect(errorFields(errors)).toContain('outputScopes')
  })
})

// ─── plugins ────────────────────────────────────────────────────────────
describe('validateConfig — plugins', () => {
  it('accepts a plain object with boolean plugin flags', () => {
    expect(validateConfig({ plugins: { trae: true, claudeCode: false } })).toHaveLength(0)
  })

  it('rejects non-object', () => {
    const errors = validateConfig({ plugins: 42 })
    expect(errorFields(errors)).toContain('plugins')
  })

  it('rejects non-boolean plugin flags', () => {
    const errors = validateConfig({ plugins: { trae: 'yes' } })
    expect(errorFields(errors)).toContain('plugins.trae')
  })

  it('rejects unsupported plugin keys and shows the supported list', () => {
    const errors = validateConfig({ plugins: { vscode: true, codex: true, foo: true } })
    const pluginError = errors.find((error) => error.field === 'plugins.foo' && error.severity === 'error')

    expect(pluginError).toBeDefined()
    expect(pluginError?.message).toMatch(/Unsupported plugins key "foo"/)
    expect(pluginError?.message).toMatch(/Supported keys:/)
  })
})

// ─── unknown fields → warnings ─────────────────────────────────────────
describe('validateConfig — unknown fields', () => {
  it('produces a warning for unknown top-level keys', () => {
    const errors = validateConfig({ unknownKey: 'value' })
    expect(warningFields(errors)).toContain('unknownKey')
    expect(errors[0].severity).toBe('warning')
  })

  it('treats removed agents config as an unknown-field warning', () => {
    const errors = validateConfig({ agents: { codex: true } })
    expect(errorFields(errors)).toEqual([])
    expect(warningFields(errors)).toContain('agents')
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

  it('warns on removed shadowSourceProject field', () => {
    const errors = validateConfig({ shadowSourceProject: { name: 'legacy-shadow' } })
    expect(warningFields(errors)).toContain('shadowSourceProject')
  })

  it('warns on removed skills path override field', () => {
    const errors = validateConfig({ skills: { src: 'skills', dist: 'dist/skills' } })
    expect(warningFields(errors)).toContain('skills')
  })
})

// ─── combined / realistic configs ──────────────────────────────────────
describe('validateConfig — realistic configs', () => {
  it('validates a fully valid config', () => {
    const config = {
      version: '2026.10218.0',
      workspaceDir: '/workspace',
      logLevel: 'debug',
      profile: { name: 'test' },
      codeStyles: { indent: 'space', tabSize: 2 },
      commandSeriesOptions: { includeSeriesPrefix: true },
      outputScopes: { plugins: {} },
      plugins: { trae: true },
    }
    expect(validateConfig(config)).toHaveLength(0)
  })

  it('collects multiple errors from a bad config', () => {
    const config = {
      workspaceDir: 123,
      logLevel: 'invalid',
      aindex: 'ignored',
    }
    const errors = validateConfig(config)
    const fields = errorFields(errors)
    expect(fields).toContain('workspaceDir')
    expect(fields).toContain('logLevel')
    expect(warningFields(errors)).toContain('aindex')
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
