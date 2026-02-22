import {readFileSync} from 'node:fs'
import {fileURLToPath, URL} from 'node:url'
import {bundles} from '@truenine/init-bundle'
import {defineConfig} from 'vite'

const pkg = JSON.parse(readFileSync('./package.json', 'utf8')) as {version: string, name: string}
const kiroGlobalPowersRegistry = bundles['public/kiro_global_powers_registry.json']?.content ?? '{"version":"1.0.0","powers":{},"repoSources":{}}'

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  define: {
    __CLI_VERSION__: JSON.stringify(pkg.version),
    __CLI_PACKAGE_NAME__: JSON.stringify(pkg.name),
    __KIRO_GLOBAL_POWERS_REGISTRY__: kiroGlobalPowersRegistry
  }
})
