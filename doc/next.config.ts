import type {NextConfig} from 'next'
import nextra from 'nextra'

const mermaidAliasPath = '@/components/mermaid'
const nextThemesAliasPath = '@/lib/next-themes-compat'

const withNextra = nextra({
  search: {
    codeblocks: false
  },
  contentDirBasePath: '/docs'
})

const LEGACY_DOC_REDIRECTS = [
  {
    source: '/docs',
    destination: '/docs/quick-guide'
  },
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
      // Keep docs on the Turbopack path for both dev and build so our local
      // compatibility shims are resolved the same way in every environment.
      '@theguild/remark-mermaid/mermaid': mermaidAliasPath,
      'next-themes': nextThemesAliasPath
    }
  }
}

export default withNextra(nextConfig)
