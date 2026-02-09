import {dirname, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

import eslint9 from '@truenine/eslint9-config'

const configDir = dirname(fileURLToPath(import.meta.url))

const config = eslint9({
  type: 'lib',
  typescript: {
    strictTypescriptEslint: true,
    tsconfigPath: resolve(configDir, 'tsconfig.eslint.json'),
    parserOptions: {
      allowDefaultProject: true
    }
  },
  ignores: [
    '.turbo/**',
    'aindex/**',
    '*.md',
    '**/*.md',
    '.kiro/**',
    '.claude/**',
    '.factory/**',
    'src/AGENTS.md',
    'public/**',
    '.skills/**',
    '**/.skills/**',
    '.agent/**'
  ]
})

export default config as unknown
