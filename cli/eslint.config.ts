import {dirname, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

import eslint10 from '@truenine/eslint10-config'

const configDir = dirname(fileURLToPath(import.meta.url))

const config = await eslint10({
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
    'npm/**/noop.cjs',
    'npm/**/noop.d.ts',
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

const overrides = {
  files: ['src/**/*.ts', 'src/**/*.tsx'],
  rules: {
    'e18e/prefer-static-regex': 'off',
    'ts/member-ordering': 'off'
  }
}

export default [...config, overrides] as unknown
