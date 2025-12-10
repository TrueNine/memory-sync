/**
 * Content injection capability implementation
 * Provides methods for prepending and appending content to Markdown files
 *
 * @see Requirements 30.3, 15.1, 15.2, 15.5
 */

import type { ContentInjectionCapability } from '../types'
import { parseFrontMatter, serializeFrontMatter } from './frontMatter'

/**
 * Content injection configuration
 * Used for priority-based injection ordering
 */
export interface ContentInjection {
  /**
   * Injection position
   */
  position: 'prepend' | 'append'
  /**
   * Injection content
   */
  content: string
  /**
   * Priority (lower value executes first)
   */
  priority?: number
}

/**
 * Prepend content after front matter
 * Inserts injection content between front matter and body
 *
 * @param content - Original content (may include front matter)
 * @param injection - Content to prepend
 * @returns Content with injection prepended after front matter
 * @see Requirements 15.1
 */
export function prependContent(content: string, injection: string): string {
  // Handle empty injection
  if (injection === '') {
    return content
  }

  // Parse front matter to separate it from body
  const { frontMatter, body } = parseFrontMatter(content)

  // Ensure injection ends with newline for proper separation
  const normalizedInjection = injection.endsWith('\n') ? injection : `${injection}\n`

  // Ensure body starts with newline for proper separation
  const normalizedBody = body.startsWith('\n') ? body : `\n${body}`

  // Reconstruct content with injection between front matter and body
  if (Object.keys(frontMatter).length === 0) {
    // No front matter: prepend directly
    return normalizedInjection + body
  }

  // Has front matter: insert after front matter
  return serializeFrontMatter(frontMatter, normalizedInjection + normalizedBody.slice(1))
}

/**
 * Append content at end of file
 * Adds injection content at the end of the file
 *
 * @param content - Original content
 * @param injection - Content to append
 * @returns Content with injection appended
 * @see Requirements 15.2
 */
export function appendContent(content: string, injection: string): string {
  // Handle empty injection
  if (injection === '') {
    return content
  }

  // Ensure proper separation between content and injection
  const needsNewline = content.length > 0 && !content.endsWith('\n')
  const separator = needsNewline ? '\n' : ''

  return content + separator + injection
}

/**
 * Sort injections by priority (lower value first)
 * Injections without priority are placed at the end
 *
 * @param injections - Array of content injections
 * @returns Sorted array of injections
 * @see Requirements 15.5
 */
export function sortInjectionsByPriority(injections: ContentInjection[]): ContentInjection[] {
  return [...injections].sort((a, b) => {
    const priorityA = a.priority ?? Number.MAX_SAFE_INTEGER
    const priorityB = b.priority ?? Number.MAX_SAFE_INTEGER
    return priorityA - priorityB
  })
}

/**
 * Apply multiple injections to content in priority order
 * Processes prepend injections first, then append injections
 *
 * @param content - Original content
 * @param injections - Array of content injections with positions and priorities
 * @returns Content with all injections applied
 * @see Requirements 15.5
 */
export function applyInjections(content: string, injections: ContentInjection[]): string {
  // Sort injections by priority
  const sorted = sortInjectionsByPriority(injections)

  // Separate prepend and append injections
  const prepends = sorted.filter((i) => i.position === 'prepend')
  const appends = sorted.filter((i) => i.position === 'append')

  let result = content

  // Apply prepend injections in priority order
  for (const injection of prepends) {
    result = prependContent(result, injection.content)
  }

  // Apply append injections in priority order
  for (const injection of appends) {
    result = appendContent(result, injection.content)
  }

  return result
}

/**
 * Create content injection capability instance
 * Provides content injection operations through a unified interface
 *
 * @returns ContentInjectionCapability implementation
 */
export function createContentInjectionCapability(): ContentInjectionCapability {
  return {
    prepend: prependContent,
    append: appendContent,
  }
}
