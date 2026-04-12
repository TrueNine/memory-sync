import {defineConfig} from 'tsdown'

const alwaysBundleDeps = ['@truenine/memory-sync-sdk']
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
    entry: ['./src/internal/native-command-bridge.ts'],
    platform: 'node',
    sourcemap: false,
    unbundle: false,
    format: ['esm'],
    minify: true,
    dts: false,
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
      alwaysBundle: alwaysBundleDeps,
      neverBundle: neverBundleDeps
    },
    format: ['esm'],
    minify: true,
    dts: false
  }
])
