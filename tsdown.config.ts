import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['./src/index.ts', '!**/*.{spec,test}.*'],
  platform: 'node',
  sourcemap: false,
  unbundle: false,
  noExternal: [
    'mdast',
  ],
  format: ['esm'],
  minify: true,
  dts: false,
})
