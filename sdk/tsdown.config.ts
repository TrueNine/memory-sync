import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {defineConfig} from 'tsdown'

const pkg = JSON.parse(readFileSync('./package.json', 'utf8')) as {version: string, name: string}
const kiroGlobalPowersRegistry = '{"version":"1.0.0","powers":{},"repoSources":{}}'

const pluginAliases: Record<string, string> = {
  '@truenine/plugin-warp-ide': resolve('src/plugins/WarpIDEOutputPlugin.ts')
}

const alwaysBundleDeps = [
  '@truenine/logger',
  '@truenine/script-runtime',
  'fast-glob',
  'jiti',
  '@truenine/md-compiler',
  ...Object.keys(pluginAliases)
]

export default defineConfig([
  {
    entry: ['./src/index.ts', './src/internal/native-command-bridge.ts', '!**/*.{spec,test}.*'],
    platform: 'node',
    sourcemap: false,
    unbundle: false,
    deps: {
      alwaysBundle: alwaysBundleDeps,
      onlyBundle: false
    },
    alias: {
      '@': resolve('src'),
      ...pluginAliases
    },
    format: ['esm'],
    minify: true,
    dts: {sourcemap: false},
    outputOptions: {exports: 'named'},
    define: {
      __CLI_VERSION__: JSON.stringify(pkg.version),
      __CLI_PACKAGE_NAME__: JSON.stringify(pkg.name),
      __KIRO_GLOBAL_POWERS_REGISTRY__: kiroGlobalPowersRegistry
    }
  }
])
