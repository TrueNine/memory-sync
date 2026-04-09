#!/usr/bin/env tsx
import {execFileSync} from 'node:child_process'
import {existsSync} from 'node:fs'
import {homedir} from 'node:os'
import {dirname, join, resolve} from 'node:path'
import process from 'node:process'
import {fileURLToPath} from 'node:url'
import {writeMarkdownBlock, writeWarning} from './markdown-output'

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
  writeWarning('Skipping Rust dependency prefetch', {
    reason: 'cargo is not available on PATH.',
    install: 'https://rustup.rs',
  })
  process.exit(0)
}

const cargoDir = dirname(cargo)
const envWithCargo = {
  ...process.env,
  CARGO: cargo,
  PATH: `${cargoDir}${process.platform === 'win32' ? ';' : ':'}${process.env['PATH'] ?? ''}`,
}

writeMarkdownBlock('Using cargo toolchain', {cargo})

try {
  execFileSync(cargo, ['fetch', '--locked'], {
    cwd: root,
    env: envWithCargo,
    stdio: 'inherit',
  })
} catch {
  writeWarning('Rust dependency prefetch failed', {
    nextStep: 'Ensure the Rust toolchain and network access are available, then rerun `cargo fetch --locked`.',
  })
  process.exit(0)
}
