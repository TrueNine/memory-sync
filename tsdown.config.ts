import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['./src/index.ts', '!**/*.{spec,test}.*'],
  platform: 'node',
  sourcemap: false,
  unbundle: false,
  noExternal: [
    '@clack/prompts',
    'fast-glob',
    'picocolors',
  ],
  format: ['esm'],
  minify: true,
  dts: false,
})
