#!/usr/bin/env tsx
import {cpSync, existsSync, mkdirSync, readdirSync, writeFileSync} from 'node:fs'
import {dirname, join, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import process from 'node:process'

const NATIVE_MODULES = [
  {name: 'logger', distDir: 'libraries/logger/dist'},
  {name: 'md-compiler', distDir: 'libraries/md-compiler/dist'},
  {name: 'script-runtime', distDir: 'libraries/script-runtime/dist'},
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

const PLATFORM_PACKAGE_SHIM = `'use strict'

const {readdirSync} = require('node:fs')
const {join} = require('node:path')

const EXPORT_BINDINGS = [
  ['logger', 'napi-logger.'],
  ['mdCompiler', 'napi-md-compiler.'],
  ['scriptRuntime', 'napi-script-runtime.'],
  ['config', 'napi-memory-sync-cli.']
]

const nodeFiles = readdirSync(__dirname).filter(file => file.endsWith('.node'))
const bindings = {}

for (const [exportName, prefix] of EXPORT_BINDINGS) {
  const file = nodeFiles.find(candidate => candidate.startsWith(prefix))
  if (file == null) continue

  Object.defineProperty(bindings, exportName, {
    enumerable: true,
    get() {
      return require(join(__dirname, file))
    }
  })
}

module.exports = bindings
`

const PLATFORM_PACKAGE_TYPES = `declare const bindings: {
  readonly logger?: unknown
  readonly mdCompiler?: unknown
  readonly scriptRuntime?: unknown
  readonly config?: unknown
}

export = bindings
`

function writePlatformPackageShim(targetDir: string): void {
  writeFileSync(join(targetDir, 'noop.cjs'), PLATFORM_PACKAGE_SHIM, 'utf8')
  writeFileSync(join(targetDir, 'noop.d.ts'), PLATFORM_PACKAGE_TYPES, 'utf8')
}

const npmPackagesDir = join(root, 'cli', 'npm')
const platformPackageDirs = readdirSync(npmPackagesDir, {withFileTypes: true})
  .filter(entry => entry.isDirectory())
  .map(entry => join(npmPackagesDir, entry.name))

for (const targetDir of platformPackageDirs) {
  writePlatformPackageShim(targetDir)
}

if (suffix == null) {
  console.warn(`[copy-napi] Unsupported platform: ${process.platform}-${process.arch}, wrote package shims only`)
  process.exit(0)
}

const targetDir = join(npmPackagesDir, suffix)
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
