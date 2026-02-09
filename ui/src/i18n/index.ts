import { createContext, useCallback, useContext, useState } from 'react'

import enUS from './en-US.json'
import zhCN from './zh-CN.json'

export type Locale = 'zh-CN' | 'en-US'

type Messages = Record<string, string>

const localeMessages: Record<Locale, Messages> = {
  'zh-CN': zhCN,
  'en-US': enUS,
}

const LOCALE_STORAGE_KEY = 'locale-preference'

export function getLocaleMessages(locale: Locale): Messages {
  return localeMessages[locale]
}

/**
 * Get all keys from a locale's messages.
 */
export function getLocaleKeys(locale: Locale): readonly string[] {
  return Object.keys(localeMessages[locale])
}

export function loadLocalePreference(): Locale {
  try {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY)
    if (stored === 'zh-CN' || stored === 'en-US') {
      return stored
    }
  } catch {
    // localStorage unavailable
  }
  // Follow system language
  if (typeof navigator !== 'undefined') {
    const lang = navigator.language
    if (lang.startsWith('zh')) return 'zh-CN'
  }
  return 'en-US'
}

export function saveLocalePreference(locale: Locale): void {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale)
  } catch {
    // localStorage unavailable
  }
}

/**
 * Translate a key using the given locale. Returns the key itself if not found.
 */
export function t(locale: Locale, key: string): string {
  const messages = localeMessages[locale]
  return messages[key] ?? key
}

export interface I18nContextValue {
  readonly locale: Locale
  readonly setLocale: (locale: Locale) => void
  readonly t: (key: string) => string
}

export const I18nContext = createContext<I18nContextValue | null>(null)

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext)
  if (!ctx) {
    throw new Error('useI18n must be used within an I18nProvider')
  }
  return ctx
}

/**
 * Hook to create i18n state — used inside the I18nProvider component.
 */
export function useI18nState(): I18nContextValue {
  const [locale, setLocaleState] = useState<Locale>(loadLocalePreference)

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale)
    saveLocalePreference(newLocale)
  }, [])

  const translate = useCallback(
    (key: string): string => t(locale, key),
    [locale],
  )

  return { locale, setLocale, t: translate }
}
