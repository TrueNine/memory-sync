import {fileURLToPath} from 'node:url'

import {defineConfig} from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    root: fileURLToPath(new URL('./', import.meta.url)),
    include: ['test/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 300000,
    hookTimeout: 300000,
    typecheck: {
      enabled: true,
      tsconfig: './tsconfig.test.json'
    },
    onConsoleLog: () => false
  }
})
