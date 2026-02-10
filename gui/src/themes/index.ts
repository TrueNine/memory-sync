import * as monaco from 'monaco-editor'

import vitesseDark from './vitesse-dark.json'
import vitesseLight from './vitesse-light.json'

export const VITESSE_DARK = 'vitesse-dark'
export const VITESSE_LIGHT = 'vitesse-light'

let registered = false

/** Register Vitesse themes with Monaco. Safe to call multiple times. */
export function registerVitesseThemes(): void {
  if (registered) return
  registered = true
  monaco.editor.defineTheme(VITESSE_DARK, vitesseDark as monaco.editor.IStandaloneThemeData)
  monaco.editor.defineTheme(VITESSE_LIGHT, vitesseLight as monaco.editor.IStandaloneThemeData)
}

/** Get the Vitesse theme name matching the current app theme. */
export function vitesseTheme(resolved: string): string {
  return resolved === 'dark' ? VITESSE_DARK : VITESSE_LIGHT
}
