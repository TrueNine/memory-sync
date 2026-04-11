import process from 'node:process'
import {afterEach, describe, expect, it, vi} from 'vitest'

interface PlatformBinding {
  readonly local: string
  readonly suffix: string
}

const PLATFORM_BINDINGS: Record<string, PlatformBinding> = {
  'win32-x64': {local: 'napi-script-runtime.win32-x64-msvc', suffix: 'win32-x64-msvc'},
  'linux-x64': {local: 'napi-script-runtime.linux-x64-gnu', suffix: 'linux-x64-gnu'},
  'linux-arm64': {local: 'napi-script-runtime.linux-arm64-gnu', suffix: 'linux-arm64-gnu'},
  'darwin-arm64': {local: 'napi-script-runtime.darwin-arm64', suffix: 'darwin-arm64'},
  'darwin-x64': {local: 'napi-script-runtime.darwin-x64', suffix: 'darwin-x64'}
}

function getPlatformBinding(): PlatformBinding | undefined {
  return PLATFORM_BINDINGS[`${process.platform}-${process.arch}`]
}

afterEach(() => {
  vi.doUnmock('node:module')
  vi.resetModules()
  vi.restoreAllMocks()
})

describe('script-runtime native binding lookup', () => {
  it('loads the repo cli platform artifact when bundled into sdk dist', async () => {
    const platformBinding = getPlatformBinding()
    if (platformBinding == null) return

    vi.resetModules()

    const attempted: string[] = []
    const fakeBinding = {
      validate_public_path: vi.fn((resolvedPath: string) => resolvedPath)
    }

    vi.doMock('node:module', () => ({
      createRequire() {
        return Object.assign(
          (specifier: string) => {
            attempted.push(specifier)

            if (specifier === `../../../cli/npm/${platformBinding.suffix}/${platformBinding.local}.node`) {
              return fakeBinding
            }

            throw new Error(`Cannot find module '${specifier}'`)
          },
          {
            resolve(specifier: string) {
              attempted.push(`resolve:${specifier}`)
              throw new Error(`Cannot find module '${specifier}'`)
            }
          }
        )
      }
    }))

    const {validatePublicPath} = await import('./index')

    expect(validatePublicPath('/tmp/demo', {aindexPublicDir: '/tmp'})).toBe('/tmp/demo')
    expect(attempted).toContain(
      `../../../cli/npm/${platformBinding.suffix}/${platformBinding.local}.node`
    )
    expect(fakeBinding.validate_public_path).toHaveBeenCalledWith('/tmp/demo', '/tmp')
  })
})
