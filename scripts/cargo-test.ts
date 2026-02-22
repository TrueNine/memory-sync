#!/usr/bin/env tsx
import {execFileSync} from 'node:child_process'
import {existsSync} from 'node:fs'
import {homedir} from 'node:os'
import {join} from 'node:path'

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
  console.error('[cargo-test] cargo not found. Install Rust: https://rustup.rs')
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
    console.error('[cargo-test] Rust build failed (likely missing linker/toolchain). Install Visual Studio Build Tools: https://aka.ms/vs/17/release/vs_BuildTools.exe')
    process.exit(1)
  }
  process.exit(status)
}
