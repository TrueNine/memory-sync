import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['./src/index.ts', '!**/*.{spec,test}.*'],
  platform: 'node',
  sourcemap: false,
  unbundle: false,
  noExternal: [

  ],
  format: ['esm'],
  minify: true,
  dts: false,
})
