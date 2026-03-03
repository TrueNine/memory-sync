#!/usr/bin/env tsx
import {cpSync, existsSync, mkdirSync, readdirSync} from 'node:fs'
import {dirname, join, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import process from 'node:process'

const NATIVE_MODULES = [
  {name: 'logger', distDir: 'libraries/logger/dist'},
  {name: 'md-compiler', distDir: 'libraries/md-compiler/dist'},
  {name: 'cli', distDir: 'cli/dist'},
] as const

const PLATFORM_MAP: Record<string, string> = {
  'win32-x64': 'win32-x64-msvc',
  'linux-x64': 'linux-x64-gnu',
  'linux-arm64': 'linux-arm64-gnu',
  'darwin-arm64': 'darwin-arm64',
  'darwin-x64': 'darwin-x64',
}

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const suffix = PLATFORM_MAP[`${process.platform}-${process.arch}`]

if (suffix == null) {
  console.warn(`[copy-napi] Unsupported platform: ${process.platform}-${process.arch}, skipping`)
  process.exit(0)
}

const targetDir = join(root, 'cli', 'npm', suffix)
mkdirSync(targetDir, {recursive: true})

let copied = 0

for (const mod of NATIVE_MODULES) {
  const modDist = join(root, mod.distDir)
  if (!existsSync(modDist)) {
    console.warn(`[copy-napi] ${mod.name}: dist/ not found, skipping (run napi build first)`)
    continue
  }
  const nodeFiles = readdirSync(modDist).filter(f => f.endsWith('.node'))
  if (nodeFiles.length === 0) {
    console.warn(`[copy-napi] ${mod.name}: no .node files in dist/, skipping (run napi build first)`)
    continue
  }
  for (const file of nodeFiles) {
    const src = join(modDist, file)
    const dst = join(targetDir, file)
    cpSync(src, dst)
    console.log(`[copy-napi] ${mod.name}: ${file} → cli/npm/${suffix}/`)
    copied++
  }
}

if (copied > 0) {
  console.log(`[copy-napi] Done: ${copied} file(s) copied to cli/npm/${suffix}/`)
} else {
  console.warn('[copy-napi] No .node files found. Build napi first:')
  console.warn('  pnpm -F @truenine/logger run build:native')
  console.warn('  pnpm -F @truenine/md-compiler run build:native')
  console.warn('  pnpm -C cli exec napi build --platform --release --output-dir dist -- --features napi')
}
