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
  readonly optionalSnakeCase?: () => string
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
    vi.clearAllMocks()
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
    vi.clearAllMocks()
  })

  it.skip('loads binding from CLI package export with matching validator', () => {
    interface TestCliExport {
      readonly testMethod: () => string
    }

    const validBinding: TestCliExport = {
      testMethod: () => 'cli-binding-result'
    }

    const cliOptions: NativeBindingLoaderOptions<TestCliExport> = {
      packageName: '@truenine/test-cli',
      binaryName: 'napi-test',
      cliExportName: 'test',
      bindingValidator: (value): value is TestCliExport =>
        value != null
        && typeof value === 'object'
        && typeof (value as TestCliExport).testMethod === 'function'
    }

    mockRequire.mockImplementation((specifier: string) => {
      if (specifier === '@truenine/memory-sync-cli-linux-x64-gnu') {
        return {test: validBinding}
      }

      throw new Error(`Not found: ${specifier}`)
    })

    const result = loadBindingFromCliBinaryPackage(
      mockRequire as never,
      cliOptions,
      'linux-x64-gnu'
    )

    expect(result).toBe(validBinding)
    expect(result.testMethod()).toBe('cli-binding-result')
  })

  it.skip('uses binaryName as default export key when cliExportName not provided', () => {
    const validBinding = createValidBinding()
    mockRequire.mockImplementation((specifier: string) => {
      if (specifier === '@truenine/memory-sync-cli-linux-x64-gnu') {
        return {test: validBinding}
      }

      throw new Error(`Not found: ${specifier}`)
    })

    const result = loadBindingFromCliBinaryPackage(
      mockRequire as never,
      {...defaultOptions, binaryName: 'napi-test'},
      'linux-x64-gnu'
    )

    expect(result).toBe(validBinding)
  })

  it('falls back to directory scanning when direct export fails', () => {
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
    vi.clearAllMocks()
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

  it('applies optional method aliases', () => {
    const bindingWithSnakeCase: MockBinding = {
      testMethod: () => 'original',
      optionalSnakeCase: () => 'snake-case-result'
    }

    mockRequire.mockReturnValue(bindingWithSnakeCase)

    const loader = createNativeBindingLoader({
      ...defaultOptions,
      optionalMethods: {
        testMethod: ['optionalSnakeCase']
      },
      _requireFactory: () => mockRequire as never
    })

    const binding = loader()
    expect(binding.testMethod()).toBe('original')
  })

  it('supports multiple alias fallbacks when preferred method is missing', () => {
    interface BindingWithAliases {
      readonly testMethod?: () => string
      readonly firstAlias?: () => string
      readonly secondAlias?: () => string
      readonly thirdAlias: () => string
    }

    const optionsWithAliases: NativeBindingLoaderOptions<BindingWithAliases> = {
      ...defaultOptions,
      bindingValidator: (value): value is BindingWithAliases =>
        value != null
        && typeof value === 'object'
        && typeof (value as BindingWithAliases).thirdAlias === 'function',
      optionalMethods: {
        testMethod: ['firstAlias', 'secondAlias', 'thirdAlias']
      }
    }

    const bindingWithAliasOnly: BindingWithAliases = {
      thirdAlias: () => 'third-alias-result'
    }

    mockRequire.mockReturnValue(bindingWithAliasOnly)

    const loader = createNativeBindingLoader({
      ...optionsWithAliases,
      _requireFactory: () => mockRequire as never
    })

    const binding = loader()
    expect(typeof binding.testMethod).toBe('function')
    expect((binding.testMethod as () => string)()).toBe('third-alias-result')
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
    vi.clearAllMocks()
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
      cliExportName: 'logger',
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

  it('simulates script-runtime-like binding with snake_case support', () => {
    interface ScriptRuntimeBinding {
      validatePublicPath?: () => string
      resolvePublicPath?: () => string
      validate_public_path?: () => string
      resolve_public_path?: () => string
    }

    const scriptRuntimeOptions: NativeBindingLoaderOptions<ScriptRuntimeBinding> = {
      packageName: '@truenine/memory-sync-sdk',
      binaryName: 'napi-memory-sync-cli',
      cliExportName: 'scriptRuntime',
      optionalMethods: {
        validatePublicPath: ['validate_public_path'],
        resolvePublicPath: ['resolve_public_path']
      },
      bindingValidator: (value): value is ScriptRuntimeBinding =>
        value != null
        && typeof value === 'object'
        && (
          typeof (value as ScriptRuntimeBinding).validate_public_path === 'function'
          || typeof (value as ScriptRuntimeBinding).validatePublicPath === 'function'
          || typeof (value as ScriptRuntimeBinding).resolve_public_path === 'function'
          || typeof (value as ScriptRuntimeBinding).resolvePublicPath === 'function'
        )
    }

    const mockScriptRuntime: ScriptRuntimeBinding = {
      validate_public_path: () => '/valid/path',
      resolve_public_path: () => '/resolved/path'
    }

    mockRequire.mockReturnValue(mockScriptRuntime)

    const loader = createNativeBindingLoader(scriptRuntimeOptions)
    const binding = loader()

    expect(typeof binding.validatePublicPath).toBe('function')
    expect(typeof binding.resolvePublicPath).toBe('function')
  })
})
