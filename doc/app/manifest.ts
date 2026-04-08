import type {MetadataRoute} from 'next'
import {withBasePath} from '@/lib/site'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'memory-sync 文档',
    short_name: 'memory-sync',
    description: 'Chinese-first manifesto-led docs for memory-sync.',
    start_url: withBasePath('/'),
    display: 'standalone',
    background_color: '#090909',
    theme_color: '#cf5d29',
    lang: 'zh-CN'
  }
}
