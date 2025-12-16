import eslint9 from '@truenine/eslint9-config'

const config = eslint9({
  type: 'app',
  typescript: {
    strictTypescriptEslint: true,
    tsconfigPath: './tsconfig.eslint.json',
  },
  ignores: [
    '*.md',
    '.kiro/**',
    'src/**/__tests__/**',
    '**/*.test.ts',
    '**/*.spec.ts',
    '**/*.property.test.ts',
    '**/*.integration.test.ts',
  ],
})

export default config as unknown
