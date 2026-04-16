import {createRequire} from 'node:module'
import process from 'node:process'

function shouldSkipNativeBinding(): boolean {
  if (process.env['TNMSC_FORCE_NATIVE_BINDING'] === '1') return false
  if (process.env['TNMSC_DISABLE_NATIVE_BINDING'] === '1') return true

  return process.env['NODE_ENV'] === 'test' || process.env['VITEST'] != null || process.env['VITEST_WORKER_ID'] != null
}

export function tryLoadNativeBinding<T extends object>(): T | undefined {
  const testGlobals = globalThis as typeof globalThis & {__TNMSC_TEST_NATIVE_BINDING__?: object}
  const testBinding: unknown = testGlobals.__TNMSC_TEST_NATIVE_BINDING__
  if (testBinding != null && typeof testBinding === 'object') return testBinding as T
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
      `./${binaryFile}`,
      `../${binaryFile}`,
      `../../dist/${binaryFile}`,
      `../../../cli/npm/${suffix}/${binaryFile}`,
      `${packageName}/${binaryFile}`,
      packageName
    ]

    for (const specifier of candidates) {
      try {
        const loaded = _require(specifier) as unknown
        if (loaded != null && typeof loaded === 'object') return loaded as T
      } catch {}
    }
  } catch {}

  return void 0
}

export function getNativeBinding<T extends object>(): T | undefined {
  return tryLoadNativeBinding<T>()
}
