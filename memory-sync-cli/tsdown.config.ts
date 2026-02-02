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
    /** Explicitly allow bundling deps listed in noExternal; disables "Detected dependencies in bundle" warning */
    inlineOnly: false,
    alias: {
      '@': resolve('src')
    },
    noExternal: [
      'mdast',
      'yaml',
      'winston',
      'unified',
      'remark-frontmatter',
      'remark-gfm',
      'remark-parse',
      'fast-glob',
      '@truenine/desk-paths',
      '@truenine/init-bundle'
    ],
    format: ['esm', 'cjs'],
    minify: true,
    dts: false,
    /** Use named export mode so CJS/ESM consumers get consistent API; disables MIXED_EXPORTS warning */
    outputOptions: {exports: 'named'},
    define: {
      __CLI_VERSION__: JSON.stringify(pkg.version),
      __CLI_PACKAGE_NAME__: JSON.stringify(pkg.name),
      __KIRO_GLOBAL_POWERS_REGISTRY__: kiroGlobalPowersRegistry
    }
  },
  {
    entry: ['./src/globals/index.ts'],
    outDir: './dist/globals',
    platform: 'node',
    format: ['esm', 'cjs'],
    minify: true,
    dts: {sourcemap: false}
  }
])
