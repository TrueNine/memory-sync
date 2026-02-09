/**
 * Property-Based Tests for i18n module
 *
 * Feature: tauri-ui-module
 * Property 10: 国际化键完整性 — Validates: Requirements 14.1
 * Property 11: 语言偏好持久化 round-trip — Validates: Requirements 14.3, 14.4
 */
import fc from 'fast-check'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { Locale } from '@/i18n/index'
import { getLocaleKeys, loadLocalePreference, saveLocalePreference } from '@/i18n/index'

const LOCALES: readonly Locale[] = ['zh-CN', 'en-US'] as const

/** Arbitrary for a valid Locale */
const arbLocale: fc.Arbitrary<Locale> = fc.constantFrom(...LOCALES)

describe('Property 10: 国际化键完整性', () => {
  /**
   * **Validates: Requirements 14.1**
   *
   * zh-CN and en-US key sets are identical —
   * every key in zh-CN exists in en-US and vice versa.
   */
  it('zh-CN and en-US have identical key sets', () => {
    const zhKeys = new Set(getLocaleKeys('zh-CN'))
    const enKeys = new Set(getLocaleKeys('en-US'))

    // Every zh-CN key exists in en-US
    for (const key of zhKeys) {
      expect(enKeys.has(key), `Key "${key}" exists in zh-CN but missing in en-US`).toBe(true)
    }

    // Every en-US key exists in zh-CN
    for (const key of enKeys) {
      expect(zhKeys.has(key), `Key "${key}" exists in en-US but missing in zh-CN`).toBe(true)
    }

    // Same size
    expect(zhKeys.size).toBe(enKeys.size)
  })

  /**
   * **Validates: Requirements 14.1**
   *
   * For any locale, every key returned by getLocaleKeys is a non-empty string.
   */
  it('all locale keys are non-empty strings', () => {
    fc.assert(
      fc.property(arbLocale, (locale) => {
        const keys = getLocaleKeys(locale)
        expect(keys.length).toBeGreaterThan(0)
        for (const key of keys) {
          expect(typeof key).toBe('string')
          expect(key.length).toBeGreaterThan(0)
        }
      }),
      { numRuns: 100 },
    )
  })
})

describe('Property 11: 语言偏好持久化 round-trip', () => {
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
   * **Validates: Requirements 14.3, 14.4**
   *
   * For any valid Locale, saving it to localStorage
   * and then loading it back returns the same value.
   */
  it('save then load returns the same Locale', () => {
    fc.assert(
      fc.property(arbLocale, (locale) => {
        saveLocalePreference(locale)
        const loaded = loadLocalePreference()
        expect(loaded).toBe(locale)
      }),
      { numRuns: 200 },
    )
  })
})
