import eslint9 from '@truenine/eslint9-config'

const config = eslint9({
  type: 'lib',
  typescript: {
    strictTypescriptEslint: true,
    tsconfigPath: './tsconfig.eslint.json',
  },
  ignores: [
    '*.md',
    '.kiro/**',
    '.claude/**',
    '.factory/**',
    'src/AGENTS.md',
    'public/**',
  ],
})

export default config as unknown
