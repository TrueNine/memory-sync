import type {MdxGlobalScope} from '@truenine/md-compiler/globals'
import type {ParsedMarkdown} from '@truenine/md-compiler/markdown'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {mdxToMd} from '@truenine/md-compiler'
import {parseMarkdown} from '@truenine/md-compiler/markdown'
import JSON5 from 'json5'

export interface PromptArtifact {
  readonly rawMdx: string
  readonly parsed: ParsedMarkdown
  readonly content: string
  readonly metadata: Record<string, unknown>
  readonly lastModified: Date
}

export interface ReadPromptArtifactOptions {
  readonly mode: 'source' | 'dist'
  readonly globalScope?: MdxGlobalScope | undefined
  readonly rawMdx?: string | undefined
  readonly lastModified?: Date | undefined
}

export interface CompileRawPromptArtifactOptions {
  readonly filePath: string
  readonly globalScope?: MdxGlobalScope | undefined
  readonly rawMdx: string
  readonly cacheMtimeMs?: number | undefined
}

export interface RawPromptCompilation {
  readonly content: string
  readonly metadata: Record<string, unknown>
}

interface CachedPromptArtifactValue {
  readonly artifact: PromptArtifact
  readonly stamp: number
}

const promptArtifactCache = new Map<string, Promise<CachedPromptArtifactValue>>()
const rawPromptCompilationCache = new Map<string, Promise<RawPromptCompilation>>()
const EXPORT_DEFAULT_PREFIX_PATTERN = /^export\s+default\s*/u

function normalizeForCache(value: unknown): unknown {
  if (value == null || typeof value !== 'object') {
    return value
  }

  if (Array.isArray(value)) {
    return value.map(normalizeForCache)
  }

  const normalizedEntries = Object.entries(value as Record<string, unknown>)
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
    .map(([key, nestedValue]) => [key, normalizeForCache(nestedValue)] as const)
  return Object.fromEntries(normalizedEntries)
}

function stableSerialize(value: unknown): string {
  return JSON.stringify(normalizeForCache(value))
}

function buildArtifactCacheKey(
  filePath: string,
  stamp: number,
  options: ReadPromptArtifactOptions
): string {
  return [
    path.resolve(filePath),
    stamp,
    options.mode,
    stableSerialize(options.globalScope ?? {})
  ].join('::')
}

function buildRawCompilationCacheKey(
  options: CompileRawPromptArtifactOptions
): string {
  return [
    path.resolve(options.filePath),
    options.cacheMtimeMs ?? options.rawMdx.length,
    stableSerialize(options.globalScope ?? {}),
    stableSerialize(options.rawMdx)
  ].join('::')
}

function trimMetadataPrefix(content: string): string {
  return content.replace(/^\s*;?\s*/u, '').trim()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

function extractObjectLiteral(source: string, startIndex: number): {value: string, endIndex: number} | null {
  if (source[startIndex] !== '{') {
    return null
  }

  let depth = 0
  let inString: string | undefined
  let escaped = false
  let inLineComment = false
  let inBlockComment = false

  for (let index = startIndex; index < source.length; index++) {
    const current = source[index]
    const next = source[index + 1]

    if (current == null) {
      break
    }

    if (inLineComment) {
      if (current === '\n') {
        inLineComment = false
      }
      continue
    }

    if (inBlockComment) {
      if (current === '*' && next === '/') {
        inBlockComment = false
        index++
      }
      continue
    }

    if (escaped) {
      escaped = false
      continue
    }

    if (inString != null) {
      if (current === '\\') {
        escaped = true
        continue
      }
      if (current === inString) {
        inString = void 0
      }
      continue
    }

    if (current === '"' || current === '\'' || current === '`') {
      inString = current
      continue
    }

    if (current === '/' && next === '/') {
      inLineComment = true
      index++
      continue
    }

    if (current === '/' && next === '*') {
      inBlockComment = true
      index++
      continue
    }

    if (current === '{') {
      depth++
      continue
    }

    if (current !== '}') {
      continue
    }

    depth--
    if (depth === 0) {
      return {
        value: source.slice(startIndex, index + 1),
        endIndex: index + 1
      }
    }
  }

  return null
}

function tryReadFastDistArtifact(
  rawMdx: string
): {content: string, metadata: Record<string, unknown>} | null {
  const trimmed = rawMdx.trimStart()

  // Frontmatter and plain markdown dist prompts still need mdxToMd because the body
  // may contain unresolved MDX expressions or components.
  const prefixMatch = EXPORT_DEFAULT_PREFIX_PATTERN.exec(trimmed)
  if (prefixMatch == null) return null

  const objectStartIndex = prefixMatch[0].length
  const objectLiteral = extractObjectLiteral(trimmed, objectStartIndex)
  if (objectLiteral == null) {
    return null
  }

  let metadata: unknown
  try {
    metadata = JSON5.parse(objectLiteral.value)
  }
  catch {
    return null
  }

  if (!isRecord(metadata)) {
    return null
  }

  return {
    content: trimMetadataPrefix(trimmed.slice(objectLiteral.endIndex)),
    metadata
  }
}

async function buildPromptArtifact(
  filePath: string,
  options: ReadPromptArtifactOptions
): Promise<PromptArtifact> {
  const rawMdx = options.rawMdx ?? fs.readFileSync(filePath, 'utf8')
  const lastModified = options.lastModified ?? fs.statSync(filePath).mtime
  const parsed = parseMarkdown(rawMdx)

  if (options.mode === 'dist') {
    const fastDistArtifact = tryReadFastDistArtifact(rawMdx)
    if (fastDistArtifact != null) {
      return {
        rawMdx,
        parsed,
        content: fastDistArtifact.content,
        metadata: fastDistArtifact.metadata,
        lastModified
      }
    }
  }

  const compileResult = await mdxToMd(rawMdx, {
    globalScope: options.globalScope,
    extractMetadata: true,
    basePath: path.dirname(filePath),
    filePath
  })

  return {
    rawMdx,
    parsed,
    content: compileResult.content,
    metadata: compileResult.metadata.fields,
    lastModified
  }
}

export async function readPromptArtifact(
  filePath: string,
  options: ReadPromptArtifactOptions
): Promise<PromptArtifact> {
  const lastModified = options.lastModified ?? fs.statSync(filePath).mtime
  const stamp = lastModified.getTime()
  const cacheKey = buildArtifactCacheKey(filePath, stamp, options)
  const cached = promptArtifactCache.get(cacheKey)
  if (cached != null) {
    return (await cached).artifact
  }

  const pendingArtifact = buildPromptArtifact(filePath, {
    ...options,
    lastModified
  }).then(artifact => ({
    artifact,
    stamp
  }))
  promptArtifactCache.set(cacheKey, pendingArtifact)

  try {
    return (await pendingArtifact).artifact
  }
  catch (error) {
    promptArtifactCache.delete(cacheKey)
    throw error
  }
}

export async function compileRawPromptArtifact(
  options: CompileRawPromptArtifactOptions
): Promise<RawPromptCompilation> {
  const cacheKey = buildRawCompilationCacheKey(options)
  const cached = rawPromptCompilationCache.get(cacheKey)
  if (cached != null) {
    return cached
  }

  const pendingCompilation = mdxToMd(options.rawMdx, {
    globalScope: options.globalScope,
    extractMetadata: true,
    basePath: path.dirname(options.filePath),
    filePath: options.filePath
  }).then(result => ({
    content: result.content,
    metadata: result.metadata.fields
  }))
  rawPromptCompilationCache.set(cacheKey, pendingCompilation)

  try {
    return await pendingCompilation
  }
  catch (error) {
    rawPromptCompilationCache.delete(cacheKey)
    throw error
  }
}

export function clearPromptArtifactCache(): void {
  promptArtifactCache.clear()
  rawPromptCompilationCache.clear()
}
