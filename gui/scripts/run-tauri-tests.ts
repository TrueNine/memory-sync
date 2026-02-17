import {spawnSync} from 'node:child_process'

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
  // eslint-disable-next-line no-console
  console.warn('[memory-sync-gui] cargo not found on PATH, skipping Tauri tests (test:tauri).')
  process.exit(0)
}

const child = spawnSync('pnpm', ['run', 'test:tauri'], {
  stdio: 'inherit',
  shell: process.platform === 'win32'
})

if (child.error != null) {
  // eslint-disable-next-line no-console
  console.error('[memory-sync-gui] Failed to run pnpm test:tauri:', child.error)
  process.exit(1)
}

process.exit(child.status ?? 1)

