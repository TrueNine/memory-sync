import {defineConfig} from 'tsdown'

const noExternalDeps = ['@truenine/memory-sync-sdk']

export default defineConfig([
  {
    entry: ['./src/index.ts'],
    platform: 'node',
    sourcemap: false,
    unbundle: false,
    deps: {
      onlyBundle: false
    },
    noExternal: noExternalDeps,
    format: ['esm'],
    minify: true,
    dts: {sourcemap: false},
    outputOptions: {exports: 'named'}
  },
  {
    entry: ['./src/globals.ts'],
    platform: 'node',
    sourcemap: false,
    noExternal: noExternalDeps,
    format: ['esm'],
    minify: false,
    dts: {sourcemap: false}
  }
])
