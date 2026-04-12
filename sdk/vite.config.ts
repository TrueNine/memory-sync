import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {fileURLToPath, URL} from 'node:url'
import {defineConfig} from 'vite'

const pkg = JSON.parse(readFileSync('./package.json', 'utf8')) as {version: string, name: string}
const kiroGlobalPowersRegistry = '{"version":"1.0.0","powers":{},"repoSources":{}}'

const pluginAliases: Record<string, string> = {
  '@truenine/plugin-warp-ide': resolve('src/plugins/WarpIDEOutputPlugin.ts')
}

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      ...pluginAliases
    }
  },
  define: {
    __CLI_VERSION__: JSON.stringify(pkg.version),
    __CLI_PACKAGE_NAME__: JSON.stringify(pkg.name),
    __KIRO_GLOBAL_POWERS_REGISTRY__: kiroGlobalPowersRegistry
  }
})
