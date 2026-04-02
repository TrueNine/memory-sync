import {resolve} from 'node:path'
import {defineConfig} from 'tsdown'

const alwaysBundleDeps = ['@truenine/memory-sync-sdk']
const scriptRuntimeWorkerBundleDeps = [...alwaysBundleDeps, '@truenine/script-runtime', 'jiti']

export default defineConfig([
  {
    entry: ['./src/index.ts'],
    platform: 'node',
    sourcemap: false,
    unbundle: false,
    deps: {
      alwaysBundle: alwaysBundleDeps,
      onlyBundle: false
    },
    format: ['esm'],
    minify: true,
    dts: {sourcemap: false},
    outputOptions: {exports: 'named'}
  },
  {
    entry: ['./src/globals.ts'],
    platform: 'node',
    sourcemap: false,
    deps: {
      alwaysBundle: alwaysBundleDeps
    },
    format: ['esm'],
    minify: false,
    dts: {sourcemap: false}
  },
  {
    entry: ['./src/plugin-runtime.ts'],
    platform: 'node',
    sourcemap: false,
    deps: {
      alwaysBundle: alwaysBundleDeps
    },
    format: ['esm'],
    minify: true,
    dts: false
  },
  {
    entry: ['./src/script-runtime-worker.ts'],
    platform: 'node',
    sourcemap: false,
    deps: {
      alwaysBundle: scriptRuntimeWorkerBundleDeps
    },
    alias: {
      '@truenine/script-runtime': resolve('../libraries/script-runtime/dist/index.mjs')
    },
    format: ['esm'],
    minify: true,
    dts: false
  }
])
