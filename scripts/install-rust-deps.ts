#!/usr/bin/env tsx
import {execFileSync} from 'node:child_process'
import {existsSync} from 'node:fs'
import {homedir} from 'node:os'
import {dirname, join, resolve} from 'node:path'
import process from 'node:process'
import {fileURLToPath} from 'node:url'

const __dirname = import.meta.dirname ?? dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

function findCargo(): string | null {
  const candidates: string[] = [
    process.env['CARGO'] ?? '',
    join(homedir(), '.cargo', 'bin', 'cargo'),
    join(homedir(), '.cargo', 'bin', 'cargo.exe'),
    'cargo',
  ].filter(Boolean)

  for (const candidate of candidates) {
    try {
      if (candidate === 'cargo') {
        execFileSync(candidate, ['--version'], {stdio: 'ignore'})
        return candidate
      }

      if (existsSync(candidate)) return candidate
    } catch {}
  }

  return null
}

const cargo = findCargo()
if (cargo == null) {
  console.warn('[install-rust-deps] cargo not found, skipping Rust dependency fetch')
  console.warn('[install-rust-deps] Install Rust: https://rustup.rs')
  process.exit(0)
}

const cargoDir = dirname(cargo)
const envWithCargo = {
  ...process.env,
  CARGO: cargo,
  PATH: `${cargoDir}${process.platform === 'win32' ? ';' : ':'}${process.env['PATH'] ?? ''}`,
}

console.log(`[install-rust-deps] Using cargo: ${cargo}`)

try {
  execFileSync(cargo, ['fetch', '--locked'], {
    cwd: root,
    env: envWithCargo,
    stdio: 'inherit',
  })
} catch {
  console.warn('[install-rust-deps] cargo fetch failed, continuing without prefetch')
  console.warn('[install-rust-deps] Ensure Rust toolchain + network access are available, then rerun: cargo fetch --locked')
  process.exit(0)
}
