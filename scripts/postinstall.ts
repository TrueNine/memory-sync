#!/usr/bin/env tsx
import {execSync} from 'node:child_process'
import process from 'node:process'

const CI_ENV_VARS = ['CI', 'GITHUB_ACTIONS', 'VERCEL', 'VERCEL_ENV'] as const

function hasTruthyEnv(name: (typeof CI_ENV_VARS)[number]): boolean {
  const value = process.env[name]
  return typeof value === 'string' && value.length > 0 && value !== '0' && value !== 'false'
}

if (CI_ENV_VARS.some(hasTruthyEnv)) {
  console.log('[postinstall] CI or Vercel detected, skipping git hooks and native bootstrap')
  process.exit(0)
}

const commands = [
  'simple-git-hooks',
  'pnpm run install:rust-deps',
  'pnpm run build:native',
] as const

for (const command of commands) {
  execSync(command, {
    stdio: 'inherit',
  })
}
