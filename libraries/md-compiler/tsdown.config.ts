import {resolve} from 'node:path'
import {defineConfig} from 'tsdown'

export default defineConfig([
  {
    entry: ['./src/index.ts', './src/globals/index.ts', './src/errors/index.ts', './src/markdown/index.ts', '!**/*.{spec,test}.*'],
    platform: 'node',
    sourcemap: false,
    unbundle: false,
    inlineOnly: false,
    alias: {
      '@': resolve('src')
    },
    format: ['esm'],
    minify: false,
    dts: {sourcemap: false}
  }
])
