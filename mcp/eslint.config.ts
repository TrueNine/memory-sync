import {dirname, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

import eslint10 from '@truenine/eslint10-config'

const configDir = dirname(fileURLToPath(import.meta.url))

const config = eslint10({
  type: 'lib',
  typescript: {
    strictTypescriptEslint: true,
    tsconfigPath: resolve(configDir, 'tsconfig.json'),
    parserOptions: {
      allowDefaultProject: true
    }
  },
  ignores: [
    '.turbo/**',
    '*.md',
    '**/*.md',
    '**/*.toml',
    'dist/**'
  ]
})

export default config as unknown
