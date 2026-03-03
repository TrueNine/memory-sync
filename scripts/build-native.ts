#!/usr/bin/env tsx
import {execFileSync, execSync} from 'node:child_process'
import {existsSync} from 'node:fs'
import {homedir} from 'node:os'
import {dirname, join, resolve} from 'node:path'
import process from 'node:process'
import {fileURLToPath} from 'node:url'

const NATIVE_MODULES = [
  {name: 'logger', dir: 'libraries/logger'},
  {name: 'md-compiler', dir: 'libraries/md-compiler'},
  {name: 'cli', dir: 'cli'},
] as const

const __dirname = import.meta.dirname ?? dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

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
  console.warn('[build-native] cargo not found, skipping native build')
  console.warn('[build-native] Install Rust: https://rustup.rs')
  process.exit(0)
}

console.log(`[build-native] Using cargo: ${cargo}`)

const cargoDir = dirname(cargo)
const envWithCargo = {
  ...process.env,
  CARGO: cargo,
  PATH: `${cargoDir}${process.platform === 'win32' ? ';' : ':'}${process.env['PATH'] ?? ''}`,
}

let failed = false
for (const mod of NATIVE_MODULES) {
  const moduleDir = join(root, mod.dir)
  console.log(`[build-native] Building ${mod.name}...`)
  try {
    execSync(
      'npx napi build --platform --release --output-dir dist -- --features napi',
      {stdio: 'inherit', cwd: moduleDir, env: envWithCargo},
    )
  } catch {
    console.error(`[build-native] ${mod.name}: build failed`)
    failed = true
  }
}

if (failed) {
  console.warn('[build-native] Some native modules failed to build, skipping copy')
  console.warn('[build-native] Ensure Rust toolchain + linker are available, then run: pnpm run build:native')
  process.exit(0)
}

console.log('[build-native] All libraries built, copying .node files...')
try {
  execSync('tsx scripts/copy-napi.ts', {stdio: 'inherit', cwd: root})
} catch {
  console.warn('[build-native] copy-napi failed, .node files may not be in place')
}
