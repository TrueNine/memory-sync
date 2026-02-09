import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {defineConfig} from 'tsdown'

const pkg = JSON.parse(readFileSync('./package.json', 'utf8')) as {version: string, name: string}
const kiroGlobalPowersRegistry = readFileSync('./public/kiro_global_powers_registry.json', 'utf8')

export default defineConfig([
  {
    entry: ['./src/index.ts', '!**/*.{spec,test}.*'],
    platform: 'node',
    sourcemap: false,
    unbundle: false,
    inlineOnly: false,
    alias: {
      '@': resolve('src')
    },
    noExternal: [
      'winston',
      'fast-glob',
      '@truenine/desk-paths',
      '@truenine/init-bundle',
      '@truenine/md-compiler'
    ],
    format: ['esm', 'cjs'],
    minify: true,
    dts: false,
    outputOptions: {exports: 'named'},
    define: {
      __CLI_VERSION__: JSON.stringify(pkg.version),
      __CLI_PACKAGE_NAME__: JSON.stringify(pkg.name),
      __KIRO_GLOBAL_POWERS_REGISTRY__: kiroGlobalPowersRegistry
    }
  },
  {
    entry: ['./src/globals.ts'],
    platform: 'node',
    sourcemap: false,
    alias: {
      '@': resolve('src')
    },
    format: ['esm', 'cjs'],
    minify: false,
    dts: {sourcemap: false}
  }
])
