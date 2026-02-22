import {fileURLToPath} from 'node:url'
import {configDefaults, defineConfig, mergeConfig} from 'vitest/config'
import viteConfig from './vite.config'

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'node',
      exclude: [...configDefaults.exclude],
      root: fileURLToPath(new URL('./', import.meta.url)),
      testTimeout: 30000,
      onConsoleLog: () => false,
      passWithNoTests: true
    }
  })
)
