import {resolve} from 'node:path'
import {defineConfig} from 'tsdown'

export default defineConfig([
  {
    entry: ['./src/index.ts', '!**/*.{spec,test}.*'],
    platform: 'node',
    sourcemap: true,
    unbundle: false,
    alias: {
      '@': resolve('src')
    },
    format: ['esm','cjs'],
    minify: false,
    dts: {sourcemap:true},
  },
])
