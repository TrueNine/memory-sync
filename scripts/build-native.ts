#!/usr/bin/env tsx
import {execFileSync, execSync} from 'node:child_process'
import {existsSync, readFileSync} from 'node:fs'
import {homedir} from 'node:os'
import {dirname, join, resolve} from 'node:path'
import process from 'node:process'
import {fileURLToPath} from 'node:url'
import {writeError, writeMarkdownBlock, writeWarning} from './markdown-output'

const NATIVE_MODULES = [
  {name: 'sdk', dir: 'sdk'},
] as const

const __dirname = import.meta.dirname ?? dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

interface PackageManifestWithScripts {
  readonly scripts?: Readonly<Record<string, string>>
}

function findCargo(): string | null {
  const candidates: string[] = [
    process.env['CARGO'] ?? '',
    join(homedir(), '.cargo', 'bin', 'cargo'),
    join(homedir(), '.cargo', 'bin', 'cargo.exe'),
    'cargo',
  ].filter(Boolean)

  for (const c of candidates) {
    try {
      if (c === 'cargo') {
        execFileSync(c, ['--version'], {stdio: 'ignore'})
        return c
      }
      if (existsSync(c)) return c
    } catch {}
  }
  return null
}

const cargo = findCargo()
if (cargo == null) {
  writeWarning('Skipping native build', {
    reason: 'cargo is not available on PATH.',
    install: 'https://rustup.rs',
  })
  process.exit(0)
}

writeMarkdownBlock('Using cargo toolchain', {cargo})

const cargoDir = dirname(cargo)
const envWithCargo = {
  ...process.env,
  CARGO: cargo,
  PATH: `${cargoDir}${process.platform === 'win32' ? ';' : ':'}${process.env['PATH'] ?? ''}`,
}

let failed = false
for (const mod of NATIVE_MODULES) {
  const moduleDir = join(root, mod.dir)
  writeMarkdownBlock('Building native module', {module: mod.name})
  try {
    const packageJsonPath = join(moduleDir, 'package.json')
    if (existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as PackageManifestWithScripts
      if (packageJson.scripts?.['build:ts'] != null) {
        writeMarkdownBlock('Building TypeScript artifacts', {module: mod.name})
        execSync('pnpm run build:ts', {stdio: 'inherit', cwd: moduleDir, env: envWithCargo})
      }
    }

    execSync(
      'npx napi build --platform --release --output-dir dist -- --features napi',
      {stdio: 'inherit', cwd: moduleDir, env: envWithCargo},
    )
  } catch {
    writeError('Native build failed', {module: mod.name})
    failed = true
  }
}

if (failed) {
  writeWarning('Skipping NAPI copy step', {
    reason: 'One or more native modules failed to build.',
    nextStep: 'Ensure the Rust toolchain and linker are available, then rerun `pnpm run build:native`.',
  })
  process.exit(0)
}

writeMarkdownBlock('Copying built NAPI artifacts')
try {
  execSync('tsx scripts/copy-napi.ts', {stdio: 'inherit', cwd: root})
} catch {
  writeWarning('NAPI copy step failed', {
    reason: 'The built .node files may not be in place.',
  })
}
