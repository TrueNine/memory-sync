import {resolve} from 'node:path'
import {defineConfig} from 'tsdown'

const alwaysBundleDeps = ['@truenine/memory-sync-sdk']
const scriptRuntimeWorkerBundleDeps = [...alwaysBundleDeps, '@truenine/script-runtime']
const neverBundleDeps = ['jiti']

export default defineConfig([
  {
    entry: ['./src/index.ts'],
    platform: 'node',
    sourcemap: false,
    unbundle: false,
    format: ['esm'],
    minify: true,
    dts: {sourcemap: false},
    deps: {
      alwaysBundle: alwaysBundleDeps,
      onlyBundle: false,
      neverBundle: neverBundleDeps
    },
    outputOptions: {exports: 'named'}
  },
  {
    entry: ['./src/script-runtime-worker.ts'],
    platform: 'node',
    sourcemap: false,
    deps: {
      alwaysBundle: scriptRuntimeWorkerBundleDeps,
      neverBundle: neverBundleDeps
    },
    alias: {
      '@truenine/script-runtime': resolve('../libraries/script-runtime/dist/index.mjs')
    },
    format: ['esm'],
    minify: true,
    dts: false
  }
])
