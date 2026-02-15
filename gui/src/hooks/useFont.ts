import { useCallback, useState } from 'react';

export type FontFamily =
  | 'JetBrains Mono'
  | 'Fira Code'
  | 'Source Code Pro'
  | 'Cascadia Code'
  | 'monospace'

export const FONT_OPTIONS: readonly { readonly value: FontFamily; readonly label: string }[] = [
  { value: 'monospace', label: 'System Default' },
  { value: 'JetBrains Mono', label: 'JetBrains Mono' },
  { value: 'Fira Code', label: 'Fira Code' },
  { value: 'Source Code Pro', label: 'Source Code Pro' },
  { value: 'Cascadia Code', label: 'Cascadia Code' },
]

const FONT_STORAGE_KEY = 'editor-font-family'

export function loadFontPreference(): FontFamily {
  try {
    const stored = localStorage.getItem(FONT_STORAGE_KEY)
    if (stored && FONT_OPTIONS.some((o) => o.value === stored)) {
      return stored as FontFamily
    }
  } catch {
    // localStorage unavailable
  }
  return 'monospace'
}

function saveFontPreference(font: FontFamily): void {
  try {
    localStorage.setItem(FONT_STORAGE_KEY, font)
  } catch {
    // localStorage unavailable
  }
}

export interface UseFontReturn {
  readonly font: FontFamily
  readonly fontCss: string
  readonly setFont: (font: FontFamily) => void
}

export function useFont(): UseFontReturn {
  const [font, setFontState] = useState<FontFamily>(loadFontPreference)

  const fontCss = font === 'monospace' ? 'monospace' : `'${font}', monospace`

  const setFont = useCallback((newFont: FontFamily) => {
    setFontState(newFont)
    saveFontPreference(newFont)
  }, [])

  return { font, fontCss, setFont }
}
