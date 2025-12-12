/**
 * BlankLineCleanerPlugin - Transform plugin for removing trailing whitespace from blank lines
 * **Feature: plugin-architecture**
 */

import type { Plugin, PluginContext, TransformResult } from '../core/types'

/**
 * Options for BlankLineCleanerPlugin
 */
export interface BlankLineCleanerPluginOptions {
  /**
   * File extensions to process (default: ['.md'])
   */
  extensions?: string[]
}

/**
 * Clean blank lines by removing trailing whitespace
 * This saves tokens when files are used as prompts
 *
 * @param content - Content to clean
 * @returns Cleaned content with whitespace removed from blank lines
 */
export function cleanBlankLinesContent(content: string): string {
  return content.replace(/^[ \t]+$/gm, '')
}

/**
 * BlankLineCleanerPlugin - Removes trailing whitespace from blank lines
 */
export function createBlankLineCleanerPlugin(
  options: BlankLineCleanerPluginOptions = {},
): Plugin {
  const { extensions = ['.md'] } = options

  return {
    name: 'blank-line-cleaner',
    priority: 20,

    transform(
      code: string,
      id: string,
      _ctx: PluginContext,
    ): TransformResult | null {
      const ext = id.substring(id.lastIndexOf('.'))
      if (!extensions.includes(ext)) {
        return null
      }

      const cleaned = cleanBlankLinesContent(code)
      if (cleaned === code) {
        return null
      }

      return { code: cleaned }
    },
  }
}
