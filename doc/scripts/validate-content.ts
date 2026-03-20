import {readdir, readFile} from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import {pathToFileURL} from 'node:url'
import YAML from 'yaml'

const cwd = process.cwd()
const contentDir = path.join(cwd, 'content')
const MDX_EXTENSION = '.mdx'
const YAML_FRONT_MATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/u
const TRAILING_SLASHES_PATTERN = /\/+$/u
const MARKDOWN_LINK_PATTERN = /\[[^\]]+\]\(([^)]+)\)/gu
const ATTRIBUTE_LINK_PATTERN = /\bhref=["']([^"']+)["']/gu
const META_FILE_PATTERN = /^_meta\.(?:ts|tsx|js|mjs)$/u
const REQUIRED_FIELDS = ['title', 'description'] as const

type MetaRecord = Record<string, unknown>

interface CollectedFiles {
  readonly mdxFiles: string[]
  readonly metaFiles: string[]
}

function fail(errors: string[]): never {
  const report = errors.map(error => `- ${error}`).join('\n')
  throw new Error(`Content validation failed:\n${report}`)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

async function collectContentFiles(directory: string): Promise<CollectedFiles> {
  const entries = await readdir(directory, {withFileTypes: true})
  const collected: CollectedFiles = {mdxFiles: [], metaFiles: []}

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name)

    if (entry.isDirectory()) {
      const nested = await collectContentFiles(fullPath)
      collected.mdxFiles.push(...nested.mdxFiles)
      collected.metaFiles.push(...nested.metaFiles)
      continue
    }

    if (entry.isFile() && entry.name.endsWith(MDX_EXTENSION)) {
      collected.mdxFiles.push(fullPath)
      continue
    }

    if (entry.isFile() && META_FILE_PATTERN.test(entry.name)) {
      collected.metaFiles.push(fullPath)
    }
  }

  return collected
}

function routeFromRelativePath(relativePath: string): string {
  const normalized = relativePath.replaceAll('\\', '/')
  const routePath = normalized.endsWith(MDX_EXTENSION)
    ? normalized.slice(0, -MDX_EXTENSION.length)
    : normalized

  if (routePath === 'index') return '/docs'
  if (routePath.endsWith('/index')) return `/docs/${routePath.slice(0, -'/index'.length)}`
  return `/docs/${routePath}`
}

function normalizeRoute(route: string): string {
  const base = route.split('#', 1)[0]?.split('?', 1)[0] ?? route
  return base.replace(TRAILING_SLASHES_PATTERN, '') || '/'
}

function resolveLinkTarget(currentRoute: string, href: string): string | null {
  if (
    href.startsWith('http://')
    || href.startsWith('https://')
    || href.startsWith('mailto:')
    || href.startsWith('tel:')
    || href.startsWith('#')
  ) {
    return null
  }

  if (href.startsWith('/')) return normalizeRoute(href)

  const base = currentRoute.endsWith('/') ? currentRoute : `${currentRoute}/`
  return normalizeRoute(new URL(href, `https://memory-sync.local${base}`).pathname)
}

function extractYamlFrontMatter(content: string): Record<string, unknown> | null {
  const match = YAML_FRONT_MATTER_PATTERN.exec(content)
  if (match == null) return null

  const parsed: unknown = YAML.parse(match[1] ?? '')
  return isRecord(parsed) ? parsed : null
}

async function readMeta(metaPath: string): Promise<MetaRecord> {
  const importedModule: unknown = await import(pathToFileURL(metaPath).href)
  if (!isRecord(importedModule)) {
    throw new Error(`Meta file must export a default object: ${metaPath}`)
  }

  const meta = importedModule.default
  if (!isRecord(meta)) {
    throw new Error(`Meta file must export a default object: ${metaPath}`)
  }

  return meta
}

function extractLinks(content: string, pattern: RegExp): string[] {
  return Array.from(content.matchAll(pattern), match => match[1]).filter(
    (href): href is string => href != null && href.length > 0
  )
}

async function main() {
  const {mdxFiles, metaFiles} = await collectContentFiles(contentDir)
  const errors: string[] = []
  const validRoutes = new Set<string>(['/', '/docs'])

  for (const mdxFile of mdxFiles) {
    const relative = path.relative(contentDir, mdxFile)
    validRoutes.add(routeFromRelativePath(relative))
  }

  for (const mdxFile of mdxFiles) {
    const relative = path.relative(contentDir, mdxFile)
    const route = routeFromRelativePath(relative)
    const content = await readFile(mdxFile, 'utf8')
    const frontMatter = extractYamlFrontMatter(content)

    if (frontMatter == null) {
      errors.push(`${relative}: missing YAML frontmatter`)
      continue
    }

    for (const field of REQUIRED_FIELDS) {
      const value = frontMatter[field]
      if (typeof value !== 'string' || value.trim().length === 0) {
        errors.push(`${relative}: frontmatter.${field} must be a non-empty string`)
      }
    }

    const markdownLinks = extractLinks(content, MARKDOWN_LINK_PATTERN)
    const attributeLinks = extractLinks(content, ATTRIBUTE_LINK_PATTERN)

    for (const href of [...markdownLinks, ...attributeLinks]) {
      const target = resolveLinkTarget(route, href)
      if (target == null) continue
      if (!validRoutes.has(target)) {
        errors.push(`${relative}: broken internal link -> ${href}`)
      }
    }
  }

  const allDirectories = new Set<string>(['.'])
  for (const file of mdxFiles) {
    allDirectories.add(path.relative(contentDir, path.dirname(file)) || '.')
  }

  for (const metaFile of metaFiles) {
    allDirectories.add(path.relative(contentDir, path.dirname(metaFile)) || '.')
  }

  for (const directory of allDirectories) {
    const metaPath = metaFiles.find(
      file => (path.relative(contentDir, path.dirname(file)) || '.') === directory
    )

    if (metaPath == null) {
      errors.push(`${directory}: missing _meta file`)
      continue
    }

    const meta = await readMeta(metaPath)
    const metaKeys = new Set(Object.keys(meta))
    const siblingFiles = mdxFiles
      .filter(file => (path.relative(contentDir, path.dirname(file)) || '.') === directory)
      .map(file => path.basename(file, MDX_EXTENSION))
    const childDirs = [...allDirectories]
      .filter(dir => path.dirname(dir) === directory && dir !== directory)
      .map(dir => path.basename(dir))

    for (const expectedKey of [...siblingFiles, ...childDirs]) {
      if (!metaKeys.has(expectedKey)) {
        errors.push(`${directory}: _meta file does not declare "${expectedKey}"`)
      }
    }
  }

  if (errors.length > 0) fail(errors)

  process.stdout.write(
    `Validated ${mdxFiles.length} MDX files across ${allDirectories.size} content folders.\n`
  )
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`${message}\n`)
  process.exitCode = 1
})
