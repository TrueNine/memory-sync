import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8')) as { version: string, name: string }
const kiroGlobalPowersRegistry = readFileSync('./public/kiro_global_powers_registry.json', 'utf-8')
const tnmscExample = readFileSync('./public/tnmsc.example.json', 'utf-8')
const gitignoreTemplate = readFileSync('./public/gitignore', 'utf-8')

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  define: {
    __CLI_VERSION__: JSON.stringify(pkg.version),
    __CLI_PACKAGE_NAME__: JSON.stringify(pkg.name),
    __KIRO_GLOBAL_POWERS_REGISTRY__: kiroGlobalPowersRegistry,
    __TEMPLATE_TNMSC_EXAMPLE__: JSON.stringify(tnmscExample),
    __TEMPLATE_GITIGNORE__: JSON.stringify(gitignoreTemplate),
  },
})
