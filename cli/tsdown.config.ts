import {defineConfig} from 'tsdown'

const alwaysBundleDeps = ['@truenine/memory-sync-sdk']

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
      alwaysBundle: alwaysBundleDeps
    },
    format: ['esm'],
    minify: true,
    dts: false
  }
])
