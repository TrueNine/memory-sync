import {readFileSync} from 'node:fs'
import {defineConfig} from 'tsdown'

const neverBundleDeps = ['jiti']
const packageJson = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  readonly version: string
}

export default defineConfig([
  {
    entry: ['./src/index.ts'],
    platform: 'node',
    sourcemap: false,
    unbundle: false,
    format: ['esm'],
    minify: true,
    dts: false,
    deps: {
      onlyBundle: false,
      neverBundle: neverBundleDeps
    },
    define: {
      __CLI_VERSION__: JSON.stringify(packageJson.version)
    },
    outputOptions: {exports: 'named'}
  }
])
