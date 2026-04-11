import {spawnSync} from 'node:child_process'
import markdownOutput from '../../scripts/markdown-output'

const {writeError, writeWarning} = markdownOutput

function cargoAvailable(): boolean {
  const result = spawnSync('cargo', ['--version'], {
    stdio: 'ignore',
    shell: process.platform === 'win32'
  })
  return result.status === 0
}

if (!cargoAvailable()) {
  // Skip Tauri tests when Rust toolchain is not installed locally so that
  // JS/Vitest tests can still pass. CI or dev machines with cargo installed
  // will still run the full `test:tauri` suite.
  writeWarning('Skipping Tauri tests', {
    reason: 'cargo is not available on PATH.',
  })
  process.exit(0)
}

const child = spawnSync('pnpm', ['run', 'test:tauri'], {
  stdio: 'inherit',
  shell: process.platform === 'win32'
})

if (child.error != null) {
  writeError('Failed to run `pnpm test:tauri`', {
    error: child.error.message,
  })
  process.exit(1)
}

process.exit(child.status ?? 1)
