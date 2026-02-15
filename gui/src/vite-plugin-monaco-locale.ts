/**
 * Vite plugin that injects Monaco Editor NLS (locale) data before any JS modules load.
 *
 * Monaco ESM reads `globalThis._VSCODE_NLS_MESSAGES` at module evaluation time,
 * so we must set it via an inline <script> in the HTML head — before Vite's
 * module scripts execute.
 *
 * The zh-CN messages are extracted from monaco-editor's bundled
 * `min/vs/nls.messages.zh-cn.js.js` into `src/monaco-nls-zh-cn.json`.
 *
 * At runtime the inline script reads the locale preference from localStorage
 * (same key used by the app's i18n system) and conditionally sets the globals.
 * Switching language requires a page reload — this is a Monaco limitation.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Plugin } from 'vite'

const LOCALE_STORAGE_KEY = 'locale-preference'

export default function monacoLocalePlugin(): Plugin {
  let zhMessages: string

  return {
    name: 'vite-plugin-monaco-locale',
    configResolved(config) {
      const jsonPath = resolve(config.root, 'src/monaco-nls-zh-cn.json')
      zhMessages = readFileSync(jsonPath, 'utf-8')
    },
    transformIndexHtml() {
      // Inject an inline script that runs BEFORE any ES module.
      // It checks localStorage for the locale preference and sets
      // the Monaco NLS globals accordingly.
      return [
        {
          tag: 'script',
          // Must be a classic (non-module) script so it blocks and runs first.
          attrs: { type: 'text/javascript' },
          children: `(function(){try{var l=localStorage.getItem("${LOCALE_STORAGE_KEY}");if(!l){var n=navigator.language||"";l=n.startsWith("zh")?"zh-CN":"en-US"}if(l==="zh-CN"){globalThis._VSCODE_NLS_LANGUAGE="zh-hans";globalThis._VSCODE_NLS_MESSAGES=${zhMessages}}}catch(e){}})();`,
          injectTo: 'head-prepend',
        },
      ]
    },
  }
}
