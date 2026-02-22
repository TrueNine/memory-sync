import {readFileSync, writeFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {bundles} from '@truenine/init-bundle'
import {defineConfig} from 'tsdown'
import {TNMSC_JSON_SCHEMA} from './src/schema.ts'

const pkg = JSON.parse(readFileSync('./package.json', 'utf8')) as {version: string, name: string}
const kiroGlobalPowersRegistry = bundles['public/kiro_global_powers_registry.json']?.content ?? '{"version":"1.0.0","powers":{},"repoSources":{}}'

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
      '@truenine/logger',
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
    },
    hooks: {
      'build:done'() {
        writeFileSync('./dist/tnmsc.schema.json', `${JSON.stringify(TNMSC_JSON_SCHEMA, null, 2)}\n`, 'utf8')
      }
    }
  },
  {
    entry: ['./src/plugin-runtime.ts'],
    platform: 'node',
    sourcemap: false,
    unbundle: false,
    inlineOnly: false,
    alias: {
      '@': resolve('src')
    },
    noExternal: [
      '@truenine/logger',
      'fast-glob',
      '@truenine/desk-paths',
      '@truenine/init-bundle',
      '@truenine/md-compiler'
    ],
    format: ['esm'],
    minify: true,
    dts: false,
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
