import {resolve} from 'node:path'
import {defineConfig} from 'tsdown'

export default defineConfig([
  {
    entry: ['./src/index.ts', './src/resolve-proxy-worker.ts', '!**/*.{spec,test}.*'],
    platform: 'node',
    sourcemap: false,
    unbundle: false,
    deps: {
      neverBundle: ['jiti'],
      onlyBundle: false
    },
    alias: {
      '@': resolve('src')
    },
    format: ['esm'],
    minify: false,
    dts: {sourcemap: false}
  }
])
