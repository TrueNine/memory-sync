import {readFileSync} from 'node:fs'
import {fileURLToPath, URL} from 'node:url'
import {bundles} from '@truenine/init-bundle'
import {defineConfig} from 'vite'

type BundleMap = Readonly<Record<string, {readonly content: string}>>
const bundleMap = bundles as unknown as BundleMap

const pkg = JSON.parse(readFileSync('./package.json', 'utf8')) as {version: string, name: string}
const kiroGlobalPowersRegistry: string = bundleMap['public/kiro_global_powers_registry.json']?.content ?? ''
const tnmscExample: string = bundleMap['public/tnmsc.example.json']?.content ?? ''
const gitignoreTemplate: string = bundleMap['public/gitignore']?.content ?? ''

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  define: {
    __CLI_VERSION__: JSON.stringify(pkg.version),
    __CLI_PACKAGE_NAME__: JSON.stringify(pkg.name),
    __KIRO_GLOBAL_POWERS_REGISTRY__: kiroGlobalPowersRegistry,
    __TEMPLATE_TNMSC_EXAMPLE__: JSON.stringify(tnmscExample),
    __TEMPLATE_GITIGNORE__: JSON.stringify(gitignoreTemplate)
  }
})
