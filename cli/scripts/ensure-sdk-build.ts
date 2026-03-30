#!/usr/bin/env tsx

import {spawnSync} from 'node:child_process'
import {existsSync} from 'node:fs'
import {dirname, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const cliDir = resolve(__dirname, '..')
const workspaceDir = resolve(cliDir, '..')
const sdkDistDir = resolve(cliDir, '../sdk/dist')

const REQUIRED_SDK_OUTPUTS = [
  'index.mjs',
  'index.d.mts',
  'globals.mjs',
  'globals.d.mts',
  'plugin-runtime.mjs',
  'script-runtime-worker.mjs',
  'tnmsc.schema.json'
] as const

function hasRequiredSdkOutputs(): boolean {
  return REQUIRED_SDK_OUTPUTS.every(fileName => existsSync(resolve(sdkDistDir, fileName)))
}

if (!hasRequiredSdkOutputs()) {
  const result = spawnSync(
    'pnpm',
    ['-F', '@truenine/memory-sync-sdk', 'run', 'build'],
    {
      cwd: workspaceDir,
      stdio: 'inherit'
    }
  )

  process.exit(result.status ?? 1)
}
