/**
 * FrontMatterPlugin - Transform plugin for adding/merging YAML front matter
 * **Feature: plugin-architecture**
 */

import type { Plugin, PluginContext, TransformResult } from '../core/types'
import { FrontMatterType } from '../core/types'

/**
 * Options for FrontMatterPlugin
 */
export interface FrontMatterPluginOptions {
  /**
   * Default front matter type to apply
   */
  defaultType?: FrontMatterType
  /**
   * File pattern for file-match types
   */
  defaultPattern?: string
}

/**
 * Parse existing front matter from content
 * Returns the front matter object and the content without front matter
 */
export function parseFrontMatter(content: string): {
  frontMatter: Record<string, unknown> | null
  content: string
} {
  const frontMatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/
  const match = content.match(frontMatterRegex)

  if (!match) {
    return { frontMatter: null, content }
  }

  const yamlContent = match[1] ?? ''
  const restContent = content.slice(match[0].length)

  const frontMatter: Record<string, unknown> = {}
  const lines = yamlContent.split(/\r?\n/)

  for (const line of lines) {
    const colonIndex = line.indexOf(':')
    if (colonIndex === -1) {
      continue
    }

    const key = line.slice(0, colonIndex).trim()
    let value: unknown = line.slice(colonIndex + 1).trim()

    if (value === 'true') {
      value = true
    } else if (value === 'false') {
      value = false
    } else if (typeof value === 'string' && /^-?\d+$/.test(value)) {
      value = Number.parseInt(value, 10)
    } else if (typeof value === 'string' && /^-?\d+\.\d+$/.test(value)) {
      value = Number.parseFloat(value)
    } else if (typeof value === 'string' && value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1)
    }

    frontMatter[key] = value
  }

  return { frontMatter, content: restContent }
}

/**
 * Serialize front matter object to YAML string
 */
export function serializeFrontMatter(frontMatter: Record<string, unknown>): string {
  const lines: string[] = ['---']

  for (const [key, value] of Object.entries(frontMatter)) {
    if (typeof value === 'string') {
      if (value.includes(':') || value.includes('#') || value.includes('"')) {
        lines.push(`${key}: "${value.replace(/"/g, '\\"')}"`)
      } else {
        lines.push(`${key}: ${value}`)
      }
    } else if (typeof value === 'boolean' || typeof value === 'number') {
      lines.push(`${key}: ${value}`)
    } else if (value === null || typeof value === 'undefined') {
      lines.push(`${key}: null`)
    } else {
      lines.push(`${key}: ${JSON.stringify(value)}`)
    }
  }

  lines.push('---', '')
  return lines.join('\n')
}

/**
 * Remove BOM (Byte Order Mark) from content
 */
export function removeBom(content: string): string {
  if (content.charCodeAt(0) === 0xFEFF) {
    return content.slice(1)
  }
  return content
}

/**
 * Generate front matter based on type
 */
export function generateFrontMatterByType(
  type: FrontMatterType,
  pattern?: string,
  additionalProps?: Record<string, unknown>,
): Record<string, unknown> {
  const base: Record<string, unknown> = {}

  switch (type) {
    case FrontMatterType.KIRO_ALWAYS:
      base['inclusion'] = 'always'
      break

    case FrontMatterType.KIRO_FILE_MATCH:
      if (typeof pattern !== 'string' || pattern === '') {
        throw new Error('Pattern is required for KIRO_FILE_MATCH type')
      }
      base['inclusion'] = 'fileMatch'
      base['fileMatchPattern'] = pattern
      break

    case FrontMatterType.QODER_ALWAYS:
      base['trigger'] = 'always_on'
      base['alwaysApply'] = true
      break

    case FrontMatterType.QODER_GLOB:
      if (typeof pattern !== 'string' || pattern === '') {
        throw new Error('Pattern is required for QODER_GLOB type')
      }
      base['trigger'] = 'glob'
      base['glob'] = pattern
      break

    case FrontMatterType.ANTIGRAVITY_ALWAYS:
      base['trigger'] = 'always_on'
      break

    case FrontMatterType.ANTIGRAVITY_GLOB:
      if (typeof pattern !== 'string' || pattern === '') {
        throw new Error('Pattern is required for ANTIGRAVITY_GLOB type')
      }
      base['trigger'] = 'glob'
      base['globs'] = pattern
      break

    case FrontMatterType.WORKFLOW_AUTO:
      base['auto_execution_mode'] = 'automatic'
      break

    default: {
      const exhaustiveCheck: never = type
      throw new Error(`Unknown front matter type: ${String(exhaustiveCheck)}`)
    }
  }

  if (additionalProps) {
    return { ...base, ...additionalProps }
  }

  return base
}

/**
 * Merge new front matter with existing, preserving existing properties
 */
export function mergeFrontMatter(
  existing: Record<string, unknown> | null,
  newProps: Record<string, unknown>,
): Record<string, unknown> {
  if (!existing) {
    return { ...newProps }
  }
  return { ...newProps, ...existing }
}

/**
 * Add or merge front matter to content
 */
export function addFrontMatterToContent(
  content: string,
  type: FrontMatterType,
  pattern?: string,
  additionalProps?: Record<string, unknown>,
): string {
  const cleanContent = removeBom(content)
  const { frontMatter: existing, content: bodyContent } = parseFrontMatter(cleanContent)
  const newFrontMatter = generateFrontMatterByType(type, pattern, additionalProps)
  const merged = mergeFrontMatter(existing, newFrontMatter)
  const serialized = serializeFrontMatter(merged)

  return serialized + bodyContent
}

/**
 * FrontMatterPlugin - Adds/merges YAML front matter to markdown files
 */
export function createFrontMatterPlugin(options: FrontMatterPluginOptions = {}): Plugin {
  const { defaultType = FrontMatterType.KIRO_ALWAYS, defaultPattern } = options

  return {
    name: 'front-matter',
    priority: 10,

    transform(
      code: string,
      id: string,
      ctx: PluginContext,
    ): TransformResult | null {
      if (!id.endsWith('.md')) {
        return null
      }

      const frontMatterOptions = ctx.meta['frontMatterOptions'] as {
        type?: FrontMatterType
        pattern?: string
        additionalProps?: Record<string, unknown>
      } | undefined

      const type = frontMatterOptions?.type ?? defaultType
      const pattern = frontMatterOptions?.pattern ?? defaultPattern
      const additionalProps = frontMatterOptions?.additionalProps

      try {
        const transformed = addFrontMatterToContent(code, type, pattern, additionalProps)
        return { code: transformed }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        ctx.logger.warn(`Failed to add front matter to ${id}: ${errorMsg}`)
        return null
      }
    },
  }
}

export default createFrontMatterPlugin
