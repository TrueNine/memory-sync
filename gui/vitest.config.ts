import { fileURLToPath, URL } from 'node:url'

import { configDefaults, defineConfig, mergeConfig } from 'vitest/config'

import viteConfig from './vite.config'

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'node',
      setupFiles: ['./vitest.setup.ts'],
      exclude: [...configDefaults.exclude, 'src/routes/__tests__/router.property.test.ts'],
      root: fileURLToPath(new URL('./', import.meta.url)),
      onConsoleLog: () => false,
      coverage: {
        provider: 'v8',
        reporter: ['text', 'json', 'html'],
        exclude: [
          'node_modules/',
          'dist/',
          'src-tauri/',
          '**/*.test.ts',
          '**/*.property.test.ts',
        ],
      },
    },
  }),
)
