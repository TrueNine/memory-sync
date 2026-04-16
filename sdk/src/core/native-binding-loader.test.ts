import type {NativeBindingLoaderOptions, PlatformBinding} from './native-binding-loader'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {
  createNativeBindingLoader,
  formatBindingLoadError,
  getPlatformBinding,
  loadBindingFromCliBinaryPackage,
  loadBindingFromDirectory
} from './native-binding-loader'

interface MockBinding {
  readonly testMethod: () => string
}

const {mockRequire, mockReaddirSync} = vi.hoisted(() => ({
  mockRequire: vi.fn(),
  mockReaddirSync: vi.fn()
}))

const mockPlatformBindings: Record<string, PlatformBinding> = {
  'win32-x64': {local: 'napi-test.win32-x64-msvc', suffix: 'win32-x64-msvc'},
  'linux-x64': {local: 'napi-test.linux-x64-gnu', suffix: 'linux-x64-gnu'},
  'linux-arm64': {local: 'napi-test.linux-arm64-gnu', suffix: 'linux-arm64-gnu'},
  'darwin-arm64': {local: 'napi-test.darwin-arm64', suffix: 'darwin-arm64'},
  'darwin-x64': {local: 'napi-test.darwin-x64', suffix: 'darwin-x64'}
}

const defaultOptions: NativeBindingLoaderOptions<MockBinding> = {
  packageName: '@truenine/test-package',
  binaryName: 'napi-test',
  bindingValidator: (value): value is MockBinding =>
    value != null
    && typeof value === 'object'
    && typeof (value as MockBinding).testMethod === 'function',
  _readdirSync: mockReaddirSync
}

function createValidBinding(): MockBinding {
  return {
    testMethod: () => 'test-result'
  }
}

vi.mock('node:module', async () => ({createRequire: () => mockRequire}))

describe('getPlatformBinding', () => {
  it('returns correct binding for supported platforms', () => {
    const linuxX64 = getPlatformBinding(mockPlatformBindings, '@truenine/test')
    expect(linuxX64).toEqual({
      local: 'napi-test.linux-x64-gnu',
      suffix: 'linux-x64-gnu'
    })
  })

  it('throws error for unsupported platform', () => {
    const originalPlatform = process.platform
    const originalArch = process.arch

    Object.defineProperty(process, 'platform', {value: 'freebsd'})
    Object.defineProperty(process, 'arch', {value: 'x64'})

    try {
      expect(() => getPlatformBinding(mockPlatformBindings, '@truenine/test')).toThrow(
        /Unsupported platform for @truenine\/test native binding/
      )
    }
    finally {
      Object.defineProperty(process, 'platform', {value: originalPlatform})
      Object.defineProperty(process, 'arch', {value: originalArch})
    }
  })
})

describe('formatBindingLoadError', () => {
  it('formats error with all details', () => {
    const localError = new Error('Cannot find module')
    const packageError = new Error('Package not found')
    const formatted = formatBindingLoadError(
      '@truenine/test-package',
      localError,
      packageError,
      'linux-x64-gnu'
    )

    expect(formatted.message).toContain('Failed to load @truenine/test-package native binding.')
    expect(formatted.message).toContain('@truenine/memory-sync-cli-linux-x64-gnu')
    expect(formatted.message).toContain('Local error: Cannot find module')
    expect(formatted.message).toContain('Package error: Package not found')
    expect(formatted.message).toContain('pnpm -F @truenine/test-package run build')
  })

  it('handles non-Error objects', () => {
    const formatted = formatBindingLoadError(
      '@truenine/test',
      'string-error',
      null,
      'win32-x64-msvc'
    )

    expect(formatted.message).toContain('Local error: string-error')
    expect(formatted.message).toContain('Package error: null')
  })
})

describe('loadBindingFromDirectory', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('finds and validates matching .node file', () => {
    const validBinding = createValidBinding()
    mockReaddirSync.mockReturnValue(['napi-test.linux-x64-gnu.node', 'other.file'])
    mockRequire.mockReturnValue(validBinding)

    const result = loadBindingFromDirectory(
      mockRequire as never,
      '/some/path',
      'napi-test',
      defaultOptions.bindingValidator,
      mockReaddirSync
    )

    expect(result).toBe(validBinding)
    expect(mockRequire).toHaveBeenCalledWith('/some/path/napi-test.linux-x64-gnu.node')
  })

  it('returns undefined when no valid binding found', () => {
    mockReaddirSync.mockReturnValue(['napi-test.linux-x64-gnu.node'])
    mockRequire.mockReturnValue({invalid: true})

    const result = loadBindingFromDirectory(
      mockRequire as never,
      '/some/path',
      'napi-test',
      defaultOptions.bindingValidator,
      mockReaddirSync
    )

    expect(result).toBeUndefined()
  })

  it('filters files by binary name prefix and .node extension', () => {
    mockReaddirSync.mockReturnValue([
      'napi-other.linux-x64-gnu.node',
      'napi-test.linux-x64-gnu.js',
      'readme.md',
      'napi-test.linux-x64-gnu.node'
    ])
    mockRequire.mockReturnValue(createValidBinding())

    loadBindingFromDirectory(
      mockRequire as never,
      '/path',
      'napi-test',
      defaultOptions.bindingValidator,
      mockReaddirSync
    )

    expect(mockRequire).toHaveBeenCalledTimes(1)
    expect(mockRequire).toHaveBeenCalledWith('/path/napi-test.linux-x64-gnu.node')
  })

  it('tries candidates in sorted order', () => {
    const binding1 = createValidBinding()
    const _binding2 = {...binding1, testMethod: () => 'second'}
    mockReaddirSync.mockReturnValue([
      'napi-test.zzz.node',
      'napi-test.aaa.node'
    ])
    mockRequire
      .mockReturnValueOnce(_binding2)
      .mockReturnValueOnce(binding1)

    const result = loadBindingFromDirectory(
      mockRequire as never,
      '/path',
      'napi-test',
      defaultOptions.bindingValidator,
      mockReaddirSync
    )

    expect(result?.testMethod()).toBe('second')
  })
})

describe('loadBindingFromCliBinaryPackage', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('loads binding directly from CLI package when it validates', () => {
    const validBinding = createValidBinding()
    mockRequire.mockImplementation((specifier: string) => {
      if (specifier === '@truenine/memory-sync-cli-linux-x64-gnu') {
        return validBinding
      }
      throw new Error(`Not found: ${specifier}`)
    })

    const result = loadBindingFromCliBinaryPackage(
      mockRequire as never,
      defaultOptions,
      'linux-x64-gnu'
    )

    expect(result).toBe(validBinding)
  })

  it('falls back to directory scanning when direct package fails validation', () => {
    const validBinding = createValidBinding()
    mockRequire.mockImplementation((specifier: string) => {
      if (specifier === '@truenine/memory-sync-cli-linux-x64-gnu') {
        return {}
      }

      if (specifier.endsWith('.node')) {
        return validBinding
      }

      if (specifier.includes('package.json')) {
        throw new Error('Not found')
      }

      throw new Error(`Not found: ${specifier}`)
    })

    mockReaddirSync.mockReturnValue(['napi-test.linux-x64-gnu.node'])

    const result = loadBindingFromCliBinaryPackage(
      mockRequire as never,
      defaultOptions,
      'linux-x64-gnu'
    )

    expect(result).toBe(validBinding)
  })

  it('throws error with last error when no binding found', () => {
    mockRequire.mockImplementation(() => {
      throw new Error('Module not found')
    })

    mockReaddirSync.mockReturnValue([])

    expect(() => loadBindingFromCliBinaryPackage(
      mockRequire as never,
      defaultOptions,
      'linux-x64-gnu'
    )).toThrow()
  })
})

describe('createNativeBindingLoader', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  afterEach(() => {
    vi.resetModules()
  })

  it('creates loader function that returns binding', () => {
    const validBinding = createValidBinding()
    mockRequire.mockReturnValue(validBinding)

    const loader = createNativeBindingLoader({
      ...defaultOptions,
      _requireFactory: () => mockRequire as never
    })
    const binding = loader()

    expect(binding).toBe(validBinding)
    expect(binding.testMethod()).toBe('test-result')
  })

  it('caches successful binding loads', () => {
    const binding1 = createValidBinding()
    mockRequire.mockReturnValueOnce(binding1)

    const loader = createNativeBindingLoader({
      ...defaultOptions,
      _requireFactory: () => mockRequire as never
    })
    const first = loader()
    const second = loader()

    expect(first).toBe(second)
    expect(mockRequire).toHaveBeenCalledTimes(1)
  })

  it('caches failed loads and rethrows same error', () => {
    const testError = new Error('Permanent failure')
    mockRequire.mockImplementation(() => {
      throw testError
    })

    const loader = createNativeBindingLoader({
      ...defaultOptions,
      _requireFactory: () => mockRequire as never
    })

    expect(() => loader()).toThrow('Permanent failure')
    expect(() => loader()).toThrow('Permanent failure')

    const secondLoader = createNativeBindingLoader({
      ...defaultOptions,
      _requireFactory: () => mockRequire as never
    })

    expect(() => secondLoader()).toThrow('Permanent failure')
  })

  it('respects custom packageSuffix option', () => {
    const validBinding = createValidBinding()
    mockRequire.mockReturnValue(validBinding)

    const loader = createNativeBindingLoader({
      ...defaultOptions,
      packageSuffix: 'custom-suffix',
      _requireFactory: () => mockRequire as never
    })

    loader()
    expect(mockRequire).toHaveBeenCalledWith(
      expect.stringContaining('custom-suffix')
    )
  })
})

describe('integration scenarios', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  afterEach(() => {
    vi.resetModules()
  })

  it('simulates full loading flow for logger-like binding', () => {
    interface LoggerBinding {
      createLogger: () => unknown
      setGlobalLogLevel: () => void
    }

    const loggerOptions: NativeBindingLoaderOptions<LoggerBinding> = {
      packageName: '@truenine/memory-sync-sdk',
      binaryName: 'napi-memory-sync-cli',
      bindingValidator: (value): value is LoggerBinding =>
        value != null
        && typeof value === 'object'
        && typeof (value as LoggerBinding).createLogger === 'function'
        && typeof (value as LoggerBinding).setGlobalLogLevel === 'function'
    }

    const mockLoggerBinding: LoggerBinding = {
      createLogger: () => ({emit: vi.fn()}),
      setGlobalLogLevel: vi.fn()
    }

    mockRequire.mockReturnValue(mockLoggerBinding)

    const loader = createNativeBindingLoader(loggerOptions)
    const binding = loader()

    expect(typeof binding.createLogger).toBe('function')
    expect(typeof binding.setGlobalLogLevel).toBe('function')
  })
})
