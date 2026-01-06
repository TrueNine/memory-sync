import { readFileSync } from 'node:fs'
import { defineConfig } from 'tsdown'

const pkg = JSON.parse(readFileSync('./package.json', 'utf8')) as { version: string, name: string }
const kiroGlobalPowersRegistry = readFileSync('./public/kiro_global_powers_registry.json', 'utf8')
const tnmscExample = readFileSync('./public/tnmsc.example.json', 'utf8')
const gitignoreTemplate = readFileSync('./public/gitignore', 'utf8')

export default defineConfig([
  {
    entry: ['./src/index.ts', '!**/*.{spec,test}.*'],
    platform: 'node',
    sourcemap: false,
    unbundle: false,
    noExternal: [
      'mdast',
      'yaml',
      'winston',
      'unified',
      'remark-frontmatter',
      'remark-gfm',
      'remark-parse',
      'fast-glob',
    ],
    format: ['esm'],
    minify: true,
    dts: false,
    define: {
      __CLI_VERSION__: JSON.stringify(pkg.version),
      __CLI_PACKAGE_NAME__: JSON.stringify(pkg.name),
      __KIRO_GLOBAL_POWERS_REGISTRY__: kiroGlobalPowersRegistry,
      __TEMPLATE_TNMSC_EXAMPLE__: JSON.stringify(tnmscExample),
      __TEMPLATE_GITIGNORE__: JSON.stringify(gitignoreTemplate),
    },
  },
  {
    entry: ['./src/globals/index.ts'],
    outDir: './dist/globals',
    platform: 'node',
    minify: true,
    dts: { sourcemap: false },
  },
])
