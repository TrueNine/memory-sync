import obsidianmd from 'eslint-plugin-obsidianmd'
import globals from 'globals'
import {defineConfig, globalIgnores} from 'eslint/config'

export default defineConfig(
  globalIgnores(['node_modules', 'dist', 'bun.lock', 'manifest.json', 'versions.json']),
  {
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  ...obsidianmd.configs.recommended,
  {
    files: ['scripts/**/*.ts'],
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      'obsidianmd/no-nodejs-modules': 'off',
      'obsidianmd/rule-custom-message': 'off',
    },
  },
  {
    files: ['src/settings-tab.ts'],
    rules: {
      'obsidianmd/settings-tab/prefer-setting-definitions': 'off',
    },
  },
)
