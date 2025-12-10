import eslint9 from '@truenine/eslint9-config'

export default eslint9({
  type: 'lib',
  typescript: {
    strictTypescriptEslint: true,
    tsconfigPath: './tsconfig.eslint.json',
  },
  ignores: [
    '*.md',
    'src/**/__tests__/**',
    '**/*.test.ts',
    '**/*.spec.ts',
    '**/*.property.test.ts',
    '**/*.integration.test.ts',
  ],
})
