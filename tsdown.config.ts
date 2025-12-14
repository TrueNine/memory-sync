import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['./src/index.ts', '!**/*.{spec,test}.*'],
  platform: 'node',
  sourcemap: false,
  unbundle: false,
  noExternal: [
    'mdast',
    'yaml',
    'winston',
    'unified',
    'remark-frontmatter',
    'remark-gfm',
    'remark-parse',
    'fast-glob',
  ],
  format: ['esm'],
  minify: true,
  dts: false,
})
