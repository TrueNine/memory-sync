import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { ThemePreference } from '@/hooks/useTheme'
import { loadThemePreference, resolveTheme, saveThemePreference } from '@/hooks/useTheme'

describe('resolveTheme', () => {
  it('light preference resolves to light regardless of system', () => {
    expect(resolveTheme('light', false)).toBe('light')
    expect(resolveTheme('light', true)).toBe('light')
  })

  it('dark preference resolves to dark regardless of system', () => {
    expect(resolveTheme('dark', false)).toBe('dark')
    expect(resolveTheme('dark', true)).toBe('dark')
  })

  it('system preference follows system dark=true', () => {
    expect(resolveTheme('system', true)).toBe('dark')
  })

  it('system preference follows system dark=false', () => {
    expect(resolveTheme('system', false)).toBe('light')
  })
})

describe('theme persistence', () => {
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

  it('saves and loads light preference', () => {
    saveThemePreference('light')
    expect(loadThemePreference()).toBe('light')
  })

  it('saves and loads dark preference', () => {
    saveThemePreference('dark')
    expect(loadThemePreference()).toBe('dark')
  })

  it('saves and loads system preference', () => {
    saveThemePreference('system')
    expect(loadThemePreference()).toBe('system')
  })

  it('returns system as default when nothing stored', () => {
    expect(loadThemePreference()).toBe('system')
  })

  it('returns system for invalid stored value', () => {
    storage['theme-preference'] = 'invalid'
    expect(loadThemePreference()).toBe('system')
  })

  it('round-trips all valid preferences', () => {
    const preferences: ThemePreference[] = ['light', 'dark', 'system']
    for (const pref of preferences) {
      saveThemePreference(pref)
      expect(loadThemePreference()).toBe(pref)
    }
  })
})
