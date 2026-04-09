import {beforeEach, describe, expect, it, vi} from 'vitest'

const nativeLogger = vi.hoisted(() => ({
  log: vi.fn(),
  logDiagnostic: vi.fn()
}))

const nativeModule = vi.hoisted(() => ({
  createLogger: vi.fn(() => nativeLogger),
  setGlobalLogLevel: vi.fn(),
  getGlobalLogLevel: vi.fn(() => 'info'),
  clearBufferedDiagnostics: vi.fn(),
  flushOutput: vi.fn(),
  drainBufferedDiagnostics: vi.fn(() => JSON.stringify([
    {
      code: 'BUFFERED_WARN',
      title: 'Buffered warning',
      rootCause: ['A warning was buffered.'],
      level: 'warn',
      namespace: 'logger-test',
      copyText: ['Buffered warning']
    }
  ]))
}))

vi.mock('node:module', () => ({
  createRequire: () => (specifier: string): unknown => {
    if (specifier.startsWith('./')) return nativeModule
    throw new Error(`Unexpected require target: ${specifier}`)
  }
}))

describe('logger bindings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    nativeModule.createLogger.mockReturnValue(nativeLogger)
    nativeModule.getGlobalLogLevel.mockReturnValue('info')
    nativeModule.drainBufferedDiagnostics.mockReturnValue(JSON.stringify([
      {
        code: 'BUFFERED_WARN',
        title: 'Buffered warning',
        rootCause: ['A warning was buffered.'],
        level: 'warn',
        namespace: 'logger-test',
        copyText: ['Buffered warning']
      }
    ]))
  })

  it('routes warn diagnostics through logDiagnostic with serialized details', async () => {
    const circular: {self?: unknown} = {}
    circular.self = circular
    const runtimeError = new Error('boom')
    const {createLogger} = await import('./index')
    const logger = createLogger('logger-test')

    logger.warn({
      code: 'WARN_CODE',
      title: 'Warn title',
      rootCause: ['The warning explains the root cause.'],
      details: {
        error: runtimeError,
        circular
      }
    })

    expect(nativeLogger.logDiagnostic).toHaveBeenCalledTimes(1)
    expect(nativeLogger.logDiagnostic).toHaveBeenCalledWith(
      'warn',
      expect.stringContaining('"code":"WARN_CODE"')
    )

    const payload = JSON.parse(String(nativeLogger.logDiagnostic.mock.calls[0]?.[1])) as Record<string, unknown>
    expect(payload['details']).toMatchObject({
      error: expect.objectContaining({message: 'boom'}),
      circular: expect.objectContaining({self: '[Circular]'})
    })
  })

  it('keeps info logging on the generic log path', async () => {
    const {createLogger} = await import('./index')
    const logger = createLogger('logger-test')

    logger.info('hello', {count: 1})

    expect(nativeLogger.log).toHaveBeenCalledTimes(1)
    expect(nativeLogger.log).toHaveBeenCalledWith(
      'info',
      'hello',
      expect.any(String)
    )
    const payload = JSON.parse(String(nativeLogger.log.mock.calls[0]?.[2])) as Record<string, unknown>
    expect(payload['count']).toBe(1)
    expect(payload['loggerTiming']).toBeUndefined()
    expect(nativeLogger.logDiagnostic).not.toHaveBeenCalled()
  })

  it('keeps metadata undefined when no extra fields are provided', async () => {
    const {createLogger} = await import('./index')
    const logger = createLogger('logger-test')

    logger.info('hello')

    expect(nativeLogger.log.mock.calls[0]?.[2]).toBeUndefined()
  })

  it('skips serializing filtered plain logs on the JS side', async () => {
    const {createLogger} = await import('./index')
    const logger = createLogger('logger-test', 'info')

    logger.debug('suppressed', {count: 1})

    expect(nativeLogger.log).not.toHaveBeenCalled()
  })

  it('keeps silent diagnostics flowing to native buffering', async () => {
    const {createLogger} = await import('./index')
    const logger = createLogger('logger-test', 'silent')

    logger.warn({
      code: 'BUFFERED_WARN',
      title: 'Buffered warning',
      rootCause: ['Silent mode should still buffer diagnostics.']
    })

    expect(nativeLogger.logDiagnostic).toHaveBeenCalledTimes(1)
  })

  it('exposes buffered diagnostics helpers', async () => {
    const {clearBufferedDiagnostics, drainBufferedDiagnostics, flushOutput} = await import('./index')

    clearBufferedDiagnostics()
    const diagnostics = drainBufferedDiagnostics()
    flushOutput()

    expect(nativeModule.clearBufferedDiagnostics).toHaveBeenCalledTimes(1)
    expect(nativeModule.drainBufferedDiagnostics).toHaveBeenCalledTimes(1)
    expect(nativeModule.flushOutput).toHaveBeenCalledTimes(1)
    expect(diagnostics).toEqual([
      expect.objectContaining({
        code: 'BUFFERED_WARN',
        level: 'warn',
        namespace: 'logger-test'
      })
    ])
  })
})
