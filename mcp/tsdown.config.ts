import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {defineConfig} from 'tsdown'

const pkg = JSON.parse(readFileSync('./package.json', 'utf8')) as {name: string, version: string}

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
    format: ['esm'],
    minify: false,
    dts: {sourcemap: false},
    define: {
      __MCP_PACKAGE_NAME__: JSON.stringify(pkg.name),
      __MCP_VERSION__: JSON.stringify(pkg.version)
    }
  },
  {
    entry: ['./src/main.ts'],
    platform: 'node',
    sourcemap: false,
    unbundle: false,
    inlineOnly: false,
    alias: {
      '@': resolve('src')
    },
    format: ['esm'],
    minify: false,
    dts: false,
    outputOptions: {
      banner: '#!/usr/bin/env node'
    },
    define: {
      __MCP_PACKAGE_NAME__: JSON.stringify(pkg.name),
      __MCP_VERSION__: JSON.stringify(pkg.version)
    }
  }
])
