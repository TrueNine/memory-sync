#!/usr/bin/env tsx
import {execFileSync} from 'node:child_process'
import {existsSync} from 'node:fs'
import {homedir} from 'node:os'
import {join} from 'node:path'
import {writeError} from './markdown-output'

const candidates: string[] = [
  process.env['CARGO'] ?? '',
  join(homedir(), '.cargo', 'bin', 'cargo'),
  join(homedir(), '.cargo', 'bin', 'cargo.exe'),
  'cargo'
].filter(Boolean)

let cargoPath: string | null = null
for (const c of candidates) {
  if (c === 'cargo' || existsSync(c)) {
    cargoPath = c
    break
  }
}

if (cargoPath == null) {
  writeError('cargo is not available on PATH', {
    install: 'https://rustup.rs',
  })
  process.exit(1)
}

const args = process.argv.slice(2)
try {
  execFileSync(cargoPath, ['test', ...args], {stdio: 'inherit', cwd: process.cwd()})
}
catch (err) {
  const status = err instanceof Error && 'status' in err
    ? ((err as NodeJS.ErrnoException & {status?: number}).status ?? 1)
    : 1
  if (status === 101) {
    writeError('Rust build failed before tests could run', {
      likelyCause: 'Missing linker or toolchain.',
      install: 'https://aka.ms/vs/17/release/vs_BuildTools.exe',
    })
    process.exit(1)
  }
  process.exit(status)
}
