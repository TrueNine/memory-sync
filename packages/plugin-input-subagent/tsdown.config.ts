import {resolve} from 'node:path'
import {defineConfig} from 'tsdown'

export default defineConfig([
  {
    entry: ['./src/index.ts', '!**/*.{spec,test}.*'],
    platform: 'node',
    sourcemap: false,
    unbundle: false,
    alias: {'@': resolve('src')},
    format: ['esm'],
    minify: false,
    dts: {sourcemap: false}
  }
])
