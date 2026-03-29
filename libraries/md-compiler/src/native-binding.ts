import process from 'node:process'

export function shouldSkipNativeBinding(): boolean {
  if (process.env['TNMSC_FORCE_NATIVE_BINDING'] === '1') return false
  if (process.env['TNMSC_DISABLE_NATIVE_BINDING'] === '1') return true

  return process.env['NODE_ENV'] === 'test'
    || process.env['VITEST'] != null
    || process.env['VITEST_WORKER_ID'] != null
}
