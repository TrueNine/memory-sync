import nextra from 'nextra'

const withNextra = nextra({
  search: {
    codeblocks: false
  },
  contentDirBasePath: '/docs'
})

/** @type {import('next').NextConfig} */
export default withNextra({
  reactStrictMode: true,
  pageExtensions: ['tsx', 'ts', 'mdx']
})
