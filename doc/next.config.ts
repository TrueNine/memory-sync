import type {NextConfig} from 'next'
import {fileURLToPath} from 'node:url'
import nextra from 'nextra'

const mermaidTurbopackAlias = './components/mermaid'
const mermaidWebpackAlias = fileURLToPath(new URL('./components/mermaid.tsx', import.meta.url))

interface WebpackResolveAliasEntry {
  readonly alias: string
  readonly name: string
  readonly onlyModule: boolean
  readonly target: string
}

interface WebpackResolveConfig {
  alias?: Record<string, string> | WebpackResolveAliasEntry[]
}

interface WebpackConfig {
  resolve?: WebpackResolveConfig
}

const withNextra = nextra({
  search: {
    codeblocks: false
  },
  contentDirBasePath: '/docs'
})

const LEGACY_DOC_REDIRECTS = [
  {
    source: '/docs/quick-start/:path*',
    destination: '/docs/cli/:path*'
  },
  {
    source: '/docs/reference/:path*',
    destination: '/docs/cli/:path*'
  },
  {
    source: '/docs/operations/:path*',
    destination: '/docs/cli/:path*'
  },
  {
    source: '/docs/authoring/:path*',
    destination: '/docs/technical-details/:path*'
  },
  {
    source: '/docs/concepts/manifesto',
    destination: '/docs/design-rationale/manifesto'
  },
  {
    source: '/docs/concepts/:path*',
    destination: '/docs/technical-details/:path*'
  }
] as const

const nextConfig: NextConfig = {
  reactStrictMode: true,
  pageExtensions: ['tsx', 'ts', 'mdx'],
  async redirects() {
    return LEGACY_DOC_REDIRECTS.map(redirect => ({
      ...redirect,
      permanent: true
    }))
  },
  turbopack: {
    resolveAlias: {
      '@theguild/remark-mermaid/mermaid': mermaidTurbopackAlias
    }
  },
  webpack(config: WebpackConfig) {
    const resolve = config.resolve ?? {}
    const {alias} = resolve

    config.resolve = resolve

    if (Array.isArray(alias)) {
      alias.push({
        alias: '@theguild/remark-mermaid/mermaid',
        name: '@theguild/remark-mermaid/mermaid',
        onlyModule: false,
        target: mermaidWebpackAlias
      })
    } else {
      resolve.alias = {
        ...alias,
        '@theguild/remark-mermaid/mermaid': mermaidWebpackAlias
      }
    }

    return config
  }
}

export default withNextra(nextConfig)
