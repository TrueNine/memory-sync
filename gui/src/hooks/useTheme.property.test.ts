/**
 * Property-Based Tests for useTheme hook utilities
 *
 * Feature: tauri-ui-module
 * Property 7: 主题解析 — Validates: Requirements 12.1
 * Property 8: 主题偏好持久化 round-trip — Validates: Requirements 12.3, 12.4
 */
import fc from 'fast-check'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { ResolvedTheme, ThemePreference } from '@/hooks/useTheme'
import { loadThemePreference, resolveTheme, saveThemePreference } from '@/hooks/useTheme'

const THEME_PREFERENCES: readonly ThemePreference[] = ['light', 'dark', 'system'] as const
const RESOLVED_THEMES: readonly ResolvedTheme[] = ['light', 'dark'] as const

/** Arbitrary for a valid ThemePreference */
const arbThemePreference: fc.Arbitrary<ThemePreference> = fc.constantFrom(...THEME_PREFERENCES)

describe('Property 7: 主题解析', () => {
  /**
   * **Validates: Requirements 12.1**
   *
   * For any ThemePreference and any systemDark boolean,
   * resolveTheme always returns either 'light' or 'dark'.
   */
  it('resolveTheme always returns light or dark', () => {
    fc.assert(
      fc.property(arbThemePreference, fc.boolean(), (preference, systemDark) => {
        const resolved = resolveTheme(preference, systemDark)
        expect(RESOLVED_THEMES).toContain(resolved)
      }),
      { numRuns: 200 },
    )
  })

  /**
   * **Validates: Requirements 12.1**
   *
   * When preference is 'light' or 'dark' (not 'system'),
   * the resolved value matches the preference exactly,
   * regardless of the systemDark value.
   */
  it('explicit preference (light/dark) resolves to itself regardless of system setting', () => {
    const arbExplicitPreference: fc.Arbitrary<ThemePreference> = fc.constantFrom('light' as const, 'dark' as const)

    fc.assert(
      fc.property(arbExplicitPreference, fc.boolean(), (preference, systemDark) => {
        const resolved = resolveTheme(preference, systemDark)
        expect(resolved).toBe(preference)
      }),
      { numRuns: 200 },
    )
  })

  /**
   * **Validates: Requirements 12.1**
   *
   * When preference is 'system', the resolved theme follows the systemDark flag:
   * systemDark=true → 'dark', systemDark=false → 'light'.
   */
  it('system preference follows the systemDark flag', () => {
    fc.assert(
      fc.property(fc.boolean(), (systemDark) => {
        const resolved = resolveTheme('system', systemDark)
        expect(resolved).toBe(systemDark ? 'dark' : 'light')
      }),
      { numRuns: 100 },
    )
  })
})

describe('Property 8: 主题偏好持久化 round-trip', () => {
  let storage: Record<string, string>

  beforeEach(() => {
    storage = {}
    globalThis.localStorage = {
      getItem: (key: string) => storage[key] ?? null,
      setItem: (key: string, value: string) => { storage[key] = value },
      removeItem: (key: string) => { delete storage[key] },
      clear: () => { storage = {} },
      get length() { return Object.keys(storage).length },
      key: (index: number) => Object.keys(storage)[index] ?? null,
    }
  })

  afterEach(() => {
    // @ts-expect-error cleanup
    delete globalThis.localStorage
  })

  /**
   * **Validates: Requirements 12.3, 12.4**
   *
   * For any valid ThemePreference, saving it to localStorage
   * and then loading it back returns the same value.
   */
  it('save then load returns the same ThemePreference', () => {
    fc.assert(
      fc.property(arbThemePreference, (preference) => {
        saveThemePreference(preference)
        const loaded = loadThemePreference()
        expect(loaded).toBe(preference)
      }),
      { numRuns: 200 },
    )
  })
})
