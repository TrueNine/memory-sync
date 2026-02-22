import createMDX from '@next/mdx'

/** @type {import('next').NextConfig} */
const baseConfig = {
  reactStrictMode: true,
  experimental: {
    mdxRs: true
  },
  pageExtensions: ['tsx', 'ts', 'mdx']
}

const withMDX = createMDX({})

export default withMDX(baseConfig)
