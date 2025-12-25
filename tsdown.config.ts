import { readFileSync } from 'node:fs'
import { defineConfig } from 'tsdown'

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8')) as { version: string }

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
  define: {
    __CLI_VERSION__: JSON.stringify(pkg.version),
  },
})
