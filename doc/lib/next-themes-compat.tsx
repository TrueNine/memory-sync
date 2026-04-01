'use client'

import type {Dispatch, JSX, PropsWithChildren, ScriptHTMLAttributes, SetStateAction} from 'react'
import {createContext, useCallback, useContext, useEffect, useMemo, useState} from 'react'

interface ValueObject {
  [themeName: string]: string
}

type DataAttribute = `data-${string}`

interface ScriptProps extends ScriptHTMLAttributes<HTMLScriptElement> {
  [dataAttribute: DataAttribute]: unknown
}

export interface UseThemeProps {
  themes: string[]
  forcedTheme?: string
  setTheme: Dispatch<SetStateAction<string>>
  theme?: string
  resolvedTheme?: string
  systemTheme?: 'dark' | 'light'
}

export type Attribute = DataAttribute | 'class'

export interface ThemeProviderProps extends PropsWithChildren {
  themes?: string[]
  forcedTheme?: string
  enableSystem?: boolean
  disableTransitionOnChange?: boolean
  enableColorScheme?: boolean
  storageKey?: string
  defaultTheme?: string
  attribute?: Attribute | Attribute[]
  value?: ValueObject
  nonce?: string
  scriptProps?: ScriptProps
}

const MEDIA = '(prefers-color-scheme: dark)'
const DEFAULT_THEMES = ['light', 'dark'] as const
const FALLBACK_THEME = 'light'

function noop() {}

const ThemeContext = createContext<UseThemeProps>({
  themes: [],
  setTheme: noop
})

function getSystemTheme(): 'dark' | 'light' {
  if (typeof window === 'undefined') {
    return 'dark'
  }

  return window.matchMedia(MEDIA).matches ? 'dark' : 'light'
}

function getStoredTheme(storageKey: string): string | undefined {
  if (typeof window === 'undefined') {
    return void 0
  }

  try {
    return window.localStorage.getItem(storageKey) ?? void 0
  } catch {
    return void 0
  }
}

function resolveTheme(
  theme: string | undefined,
  enableSystem: boolean,
  systemTheme: 'dark' | 'light'
): string {
  if (theme == null) {
    return FALLBACK_THEME
  }

  if (theme === 'system' && enableSystem) {
    return systemTheme
  }

  return theme
}

function disableTransitionsTemporarily(nonce?: string): (() => void) | undefined {
  if (typeof document === 'undefined') {
    return void 0
  }

  const style = document.createElement('style')

  if (nonce != null && nonce.length > 0) {
    style.setAttribute('nonce', nonce)
  }

  style.append(
    document.createTextNode(
      '*,*::before,*::after{-webkit-transition:none!important;-moz-transition:none!important;-o-transition:none!important;-ms-transition:none!important;transition:none!important}'
    )
  )
  document.head.append(style)

  return () => {
    window.getComputedStyle(document.body)
    window.setTimeout(() => {
      style.remove()
    }, 1)
  }
}

function applyTheme({
  attribute,
  defaultTheme,
  enableColorScheme,
  enableSystem,
  systemTheme,
  theme,
  themes,
  value
}: {
  attribute: Attribute | Attribute[]
  defaultTheme: string
  enableColorScheme: boolean
  enableSystem: boolean
  systemTheme: 'dark' | 'light'
  theme: string
  themes: string[]
  value?: ValueObject
}) {
  if (typeof document === 'undefined') {
    return
  }

  const root = document.documentElement
  const resolvedTheme = resolveTheme(theme, enableSystem, systemTheme)
  const attributes = Array.isArray(attribute) ? attribute : [attribute]

  for (const currentAttribute of attributes) {
    if (currentAttribute === 'class') {
      const classNames = value == null
        ? themes
        : themes.map(themeName => value[themeName] ?? themeName)

      if (classNames.length > 0) {
        root.classList.remove(...classNames)
      }

      root.classList.add(value?.[resolvedTheme] ?? resolvedTheme)
      continue
    }

    root.setAttribute(currentAttribute, value?.[resolvedTheme] ?? resolvedTheme)
  }

  if (!enableColorScheme) {
    return
  }

  const colorScheme = resolvedTheme === 'dark' || resolvedTheme === 'light'
    ? resolvedTheme
    : resolveTheme(defaultTheme, enableSystem, systemTheme)

  if (colorScheme === 'dark' || colorScheme === 'light') {
    root.style.colorScheme = colorScheme
  }
}

export function ThemeProvider({
  attribute = 'data-theme',
  children,
  defaultTheme,
  disableTransitionOnChange = false,
  enableColorScheme = true,
  enableSystem = true,
  forcedTheme,
  nonce,
  storageKey = 'theme',
  themes = [...DEFAULT_THEMES],
  value
}: ThemeProviderProps): JSX.Element {
  const normalizedDefaultTheme = defaultTheme ?? (enableSystem ? 'system' : FALLBACK_THEME)
  const [theme, setThemeState] = useState<string>(() => forcedTheme ?? normalizedDefaultTheme)
  const [systemTheme, setSystemTheme] = useState<'dark' | 'light'>(() => getSystemTheme())

  useEffect(() => {
    if (typeof window === 'undefined' || forcedTheme != null) {
      return
    }

    const storedTheme = getStoredTheme(storageKey)

    if (storedTheme != null) {
      setThemeState(storedTheme)
    }
  }, [forcedTheme, storageKey])

  useEffect(() => {
    if (typeof window === 'undefined' || !enableSystem) {
      return
    }

    const media = window.matchMedia(MEDIA)
    const handleChange = () => {
      setSystemTheme(media.matches ? 'dark' : 'light')
    }

    handleChange()

    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', handleChange)

      return () => {
        media.removeEventListener('change', handleChange)
      }
    }

    media.addListener(handleChange)

    return () => {
      media.removeListener(handleChange)
    }
  }, [enableSystem])

  useEffect(() => {
    const activeTheme = forcedTheme ?? theme
    const stopTransitions = disableTransitionOnChange
      ? disableTransitionsTemporarily(nonce)
      : void 0

    applyTheme({
      attribute,
      defaultTheme: normalizedDefaultTheme,
      enableColorScheme,
      enableSystem,
      systemTheme,
      theme: activeTheme,
      themes,
      value
    })

    stopTransitions?.()
  }, [
    attribute,
    disableTransitionOnChange,
    enableColorScheme,
    enableSystem,
    forcedTheme,
    nonce,
    normalizedDefaultTheme,
    systemTheme,
    theme,
    themes,
    value
  ])

  const setTheme = useCallback<Dispatch<SetStateAction<string>>>(valueOrUpdater => {
    setThemeState(currentTheme => {
      const nextTheme = typeof valueOrUpdater === 'function'
        ? valueOrUpdater(currentTheme)
        : valueOrUpdater

      try {
        window.localStorage.setItem(storageKey, nextTheme)
      } catch {}

      return nextTheme
    })
  }, [storageKey])

  const activeTheme = forcedTheme ?? theme
  const resolvedTheme = resolveTheme(activeTheme, enableSystem, systemTheme)

  const contextValue = useMemo<UseThemeProps>(() => ({
    forcedTheme,
    resolvedTheme,
    setTheme,
    systemTheme: enableSystem ? systemTheme : void 0,
    theme: activeTheme,
    themes: enableSystem ? [...themes, 'system'] : themes
  }), [activeTheme, enableSystem, forcedTheme, resolvedTheme, setTheme, systemTheme, themes])

  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme(): UseThemeProps {
  return useContext(ThemeContext)
}
