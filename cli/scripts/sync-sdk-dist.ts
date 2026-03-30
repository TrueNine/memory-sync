#!/usr/bin/env tsx

import {cpSync, existsSync, mkdirSync, readdirSync, rmSync} from 'node:fs'
import {dirname, join, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const cliDir = resolve(__dirname, '..')
const sdkDistDir = resolve(cliDir, '../sdk/dist')
const cliDistDir = resolve(cliDir, 'dist')

const EXACT_FILES = new Set([
  'babel.cjs',
  'plugin-runtime.mjs',
  'script-runtime-worker.mjs',
  'tnmsc.schema.json'
])

function shouldCopy(fileName: string): boolean {
  return EXACT_FILES.has(fileName) || /^jiti-.*\.mjs$/u.test(fileName)
}

if (!existsSync(sdkDistDir)) {
  throw new Error(`sdk dist directory is missing: ${sdkDistDir}`)
}

mkdirSync(cliDistDir, {recursive: true})

for (const fileName of readdirSync(cliDistDir)) {
  if (!shouldCopy(fileName)) continue
  rmSync(join(cliDistDir, fileName), {force: true, recursive: true})
}

for (const fileName of readdirSync(sdkDistDir)) {
  if (!shouldCopy(fileName)) continue
  cpSync(join(sdkDistDir, fileName), join(cliDistDir, fileName), {recursive: true})
}
