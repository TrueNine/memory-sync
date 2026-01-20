import {fileURLToPath} from 'node:url'

import {configDefaults, defineConfig, mergeConfig} from 'vitest/config'

import viteConfig from './vite.config'

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'node',
      exclude: [...configDefaults.exclude, 'e2e/*'],
      root: fileURLToPath(new URL('./', import.meta.url)),
      typecheck: {
        enabled: true,
        tsconfig: './tsconfig.test.json'
      },
      testTimeout: 30000, // Property-based tests run more iterations
      onConsoleLog: () => false, // Minimal output: suppress console logs, show summary only
      coverage: {
        provider: 'v8',
        reporter: ['text', 'json', 'html'],
        exclude: [
          'node_modules/',
          'dist/',
          '**/*.test.ts',
          '**/*.property.test.ts'
        ]
      }
    }
  })
)
