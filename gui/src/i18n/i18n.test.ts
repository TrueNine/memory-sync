import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { Locale } from '@/i18n/index'
import { getLocaleKeys, loadLocalePreference, saveLocalePreference, t } from '@/i18n/index'

describe('i18n key completeness', () => {
  it('zh-CN and en-US have identical key sets', () => {
    const zhKeys = [...getLocaleKeys('zh-CN')].sort()
    const enKeys = [...getLocaleKeys('en-US')].sort()
    expect(zhKeys).toEqual(enKeys)
  })

  it('both locales have at least one key', () => {
    expect(getLocaleKeys('zh-CN').length).toBeGreaterThan(0)
    expect(getLocaleKeys('en-US').length).toBeGreaterThan(0)
  })
})

describe('t() translation function', () => {
  it('returns translated value for known key', () => {
    expect(t('en-US', 'nav.dashboard')).toBe('Dashboard')
    expect(t('zh-CN', 'nav.dashboard')).toBe('仪表盘')
  })

  it('returns the key itself for unknown key', () => {
    expect(t('en-US', 'nonexistent.key')).toBe('nonexistent.key')
    expect(t('zh-CN', 'nonexistent.key')).toBe('nonexistent.key')
  })
})

describe('locale persistence', () => {
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

  it('saves and loads zh-CN', () => {
    saveLocalePreference('zh-CN')
    expect(loadLocalePreference()).toBe('zh-CN')
  })

  it('saves and loads en-US', () => {
    saveLocalePreference('en-US')
    expect(loadLocalePreference()).toBe('en-US')
  })

  it('round-trips all valid locales', () => {
    const locales: Locale[] = ['zh-CN', 'en-US']
    for (const locale of locales) {
      saveLocalePreference(locale)
      expect(loadLocalePreference()).toBe(locale)
    }
  })
})
