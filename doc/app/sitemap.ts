import type {MetadataRoute} from 'next'
import {readdir} from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import {getSiteUrl} from '@/lib/site'

const MDX_EXTENSION = '.mdx'
const TRAILING_SLASHES_PATTERN = /\/+$/u

function routeFromContentFile(filePath: string): string {
  const relative = filePath.replaceAll('\\', '/')
  const withoutExt = relative.endsWith(MDX_EXTENSION)
    ? relative.slice(0, -MDX_EXTENSION.length)
    : relative

  if (withoutExt.endsWith('/index')) {
    return `/docs/${withoutExt.slice(0, -'/index'.length)}`
  }

  return `/docs/${withoutExt}`
}

async function findMdxFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, {encoding: 'utf8', recursive: true})
  return entries.filter((entry): entry is string => entry.endsWith(MDX_EXTENSION))
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const contentDir = path.join(process.cwd(), 'content')
  const files = await findMdxFiles(contentDir)

  const routes = files.map(file => {
    const route = routeFromContentFile(file).replace(TRAILING_SLASHES_PATTERN, '') || '/docs'
    return {
      url: getSiteUrl(route).toString(),
      changeFrequency: 'weekly' as const,
      priority: route === '/docs' ? 0.9 : 0.7
    }
  })

  return [
    {
      url: getSiteUrl('/').toString(),
      changeFrequency: 'weekly',
      priority: 1
    },
    ...routes
  ]
}
