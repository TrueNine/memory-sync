import {dirname, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

import eslint10 from '@truenine/eslint10-config'

const configDir = dirname(fileURLToPath(import.meta.url))

const config = eslint10({
  type: 'lib',
  typescript: {
    strictTypescriptEslint: true,
    tsconfigPath: resolve(configDir, 'tsconfig.eslint.json'),
    parserOptions: {
      allowDefaultProject: ['*.config.ts']
    }
  },
  ignores: [
    '.turbo/**',
    'aindex/**',
    '*.md',
    '**/*.md',
    '*.toml',
    '**/*.toml',
    '.kiro/**',
    '.claude/**',
    '.factory/**',
    'src/AGENTS.md',
    '.skills/**',
    '**/.skills/**',
    '.agent/**',
    'scripts/**'
  ]
})

export default config as unknown
