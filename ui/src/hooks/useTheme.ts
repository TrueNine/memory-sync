import { useCallback, useEffect, useState } from 'react'

export type ThemePreference = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

const THEME_STORAGE_KEY = 'theme-preference'

/**
 * Resolve a theme preference to an actual CSS class value.
 * 'light' → 'light', 'dark' → 'dark', 'system' → based on system preference.
 */
export function resolveTheme(preference: ThemePreference, systemDark: boolean): ResolvedTheme {
  if (preference === 'system') {
    return systemDark ? 'dark' : 'light'
  }
  return preference
}

export function loadThemePreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      return stored
    }
  } catch {
    // localStorage unavailable
  }
  return 'system'
}

export function saveThemePreference(preference: ThemePreference): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, preference)
  } catch {
    // localStorage unavailable
  }
}

function getSystemDark(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function applyThemeClass(resolved: ResolvedTheme): void {
  const root = document.documentElement
  if (resolved === 'dark') {
    root.classList.add('dark')
  } else {
    root.classList.remove('dark')
  }
}

export interface UseThemeReturn {
  readonly preference: ThemePreference
  readonly resolved: ResolvedTheme
  readonly setTheme: (preference: ThemePreference) => void
}

export function useTheme(): UseThemeReturn {
  const [preference, setPreference] = useState<ThemePreference>(loadThemePreference)
  const [systemDark, setSystemDark] = useState<boolean>(getSystemDark)

  const resolved = resolveTheme(preference, systemDark)

  // Apply CSS class whenever resolved theme changes
  useEffect(() => {
    applyThemeClass(resolved)
  }, [resolved])

  // Listen for system theme changes
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const setTheme = useCallback((newPreference: ThemePreference) => {
    setPreference(newPreference)
    saveThemePreference(newPreference)
  }, [])

  return { preference, resolved, setTheme }
}
