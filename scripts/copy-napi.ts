#!/usr/bin/env tsx
import {cpSync, existsSync, mkdirSync, readdirSync} from 'node:fs'
import {dirname, join, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import process from 'node:process'

import {writeMarkdownBlock, writeWarning} from './markdown-output'
import {resolveTargetDirs, writePlatformPackageShims} from './write-platform-package-shims'

const NATIVE_MODULES = [
  {name: 'sdk', distDir: 'sdk/dist'},
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

const npmPackagesDir = join(root, 'cli', 'npm')
writePlatformPackageShims(resolveTargetDirs([]))

if (suffix == null) {
  writeWarning('Wrote platform package shims only', {
    reason: `Unsupported platform: ${process.platform}-${process.arch}`,
  })
  process.exit(0)
}

const targetDir = join(npmPackagesDir, suffix)
mkdirSync(targetDir, {recursive: true})

let copied = 0

for (const mod of NATIVE_MODULES) {
  const modDist = join(root, mod.distDir)
  if (!existsSync(modDist)) {
    writeWarning('Skipping native module copy', {
      module: mod.name,
      reason: 'dist/ was not found.',
      nextStep: 'Run the NAPI build first.',
    })
    continue
  }
  const nodeFiles = readdirSync(modDist).filter(f => f.endsWith('.node'))
  if (nodeFiles.length === 0) {
    writeWarning('Skipping native module copy', {
      module: mod.name,
      reason: 'No .node files were found in dist/.',
      nextStep: 'Run the NAPI build first.',
    })
    continue
  }
  for (const file of nodeFiles) {
    const src = join(modDist, file)
    const dst = join(targetDir, file)
    cpSync(src, dst, {force: true})
    writeMarkdownBlock('Copied NAPI artifact', {
      module: mod.name,
      file,
      target: `cli/npm/${suffix}/`,
    })
    copied++
  }
}

if (copied > 0) {
  writeMarkdownBlock('NAPI copy complete', {
    files: copied,
    target: `cli/npm/${suffix}/`,
  })
} else {
  writeWarning('No NAPI artifacts were copied', {
    nextSteps: [
      'pnpm -F @truenine/memory-sync-sdk run build:native',
    ],
  })
}
