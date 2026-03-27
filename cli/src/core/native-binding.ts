import {createRequire} from 'node:module'
import process from 'node:process'

function shouldSkipNativeBinding(): boolean {
  if (process.env['TNMSC_FORCE_NATIVE_BINDING'] === '1') return false
  if (process.env['TNMSC_DISABLE_NATIVE_BINDING'] === '1') return true

  return process.env['NODE_ENV'] === 'test'
    || process.env['VITEST'] != null
    || process.env['VITEST_WORKER_ID'] != null
}

export function tryLoadNativeBinding<T extends object>(): T | undefined {
  if (shouldSkipNativeBinding()) return void 0

  const suffixMap: Readonly<Record<string, string>> = {
    'win32-x64': 'win32-x64-msvc',
    'linux-x64': 'linux-x64-gnu',
    'linux-arm64': 'linux-arm64-gnu',
    'darwin-arm64': 'darwin-arm64',
    'darwin-x64': 'darwin-x64'
  }
  const suffix = suffixMap[`${process.platform}-${process.arch}`]
  if (suffix == null) return void 0

  try {
    const _require = createRequire(import.meta.url)
    const packageName = `@truenine/memory-sync-cli-${suffix}`
    const binaryFile = `napi-memory-sync-cli.${suffix}.node`
    const candidates = [
      packageName,
      `${packageName}/${binaryFile}`,
      `./${binaryFile}`,
      `../npm/${suffix}`,
      `../npm/${suffix}/${binaryFile}`,
      `../../npm/${suffix}`,
      `../../npm/${suffix}/${binaryFile}`
    ]

    for (const specifier of candidates) {
      try {
        const loaded = _require(specifier) as unknown
        const possibleBindings = [
          (loaded as {config?: unknown})?.config,
          (loaded as {default?: {config?: unknown}})?.default?.config,
          (loaded as {default?: unknown})?.default,
          loaded
        ]

        for (const candidate of possibleBindings) {
          if (candidate != null && typeof candidate === 'object') return candidate as T
        }
      }
      catch {}
    }
  }
  catch {
  }

  return void 0
}

export function getNativeBinding<T extends object>(): T | undefined {
  return tryLoadNativeBinding<T>()
}
