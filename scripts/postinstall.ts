#!/usr/bin/env tsx
import {execSync} from 'node:child_process'
import process from 'node:process'
import {writeError, writeMarkdownBlock} from './markdown-output'

const CI_ENV_VARS = ['CI', 'GITHUB_ACTIONS', 'VERCEL', 'VERCEL_ENV'] as const

function hasTruthyEnv(name: (typeof CI_ENV_VARS)[number]): boolean {
  const value = process.env[name]
  return typeof value === 'string' && value.length > 0 && value !== '0' && value !== 'false'
}

if (CI_ENV_VARS.some(hasTruthyEnv)) {
  writeMarkdownBlock('Skipping local postinstall bootstrap', {
    reason: 'CI or Vercel environment detected.',
  })
  process.exit(0)
}

const commands = [
  'simple-git-hooks',
  'pnpm run install:rust-deps',
  'pnpm run build:native',
] as const

for (const command of commands) {
  try {
    execSync(command, {
      stdio: 'inherit',
    })
  } catch (error) {
    writeError('Postinstall command failed', {command})
    if (error instanceof Error && 'status' in error) {
      writeError('Postinstall exit code', {
        command,
        exitCode: (error as {status: number}).status,
      })
    }
    process.exit(1)
  }
}
