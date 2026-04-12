import {beforeEach, describe, expect, it, vi} from 'vitest'

const nativeLogger = vi.hoisted(() => ({
  emit: vi.fn(),
  emitDiagnostic: vi.fn()
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
    if (specifier.endsWith('.node')) return nativeModule
    throw new Error(`Unexpected require target: ${specifier}`)
  }
}))

describe('logger bindings', () => {
  beforeEach(() => {
    vi.resetModules()
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

  it('routes warn diagnostics through the native diagnostic path without JS serialization', async () => {
    const {createLogger} = await import('./logger')
    const logger = createLogger('logger-test')

    logger.warn({
      code: 'WARN_CODE',
      title: 'Warn title',
      rootCause: ['The warning explains the root cause.'],
      details: {
        error: new Error('boom'),
        count: 1
      }
    })

    expect(nativeLogger.emitDiagnostic).toHaveBeenCalledTimes(1)
    expect(nativeLogger.emitDiagnostic).toHaveBeenCalledWith(
      'warn',
      expect.objectContaining({
        code: 'WARN_CODE',
        details: expect.objectContaining({count: 1})
      })
    )
  })

  it('forwards plain log arguments to the native emit path', async () => {
    const {createLogger} = await import('./logger')
    const logger = createLogger('logger-test')

    logger.info('hello', {count: 1})

    expect(nativeLogger.emit).toHaveBeenCalledTimes(1)
    expect(nativeLogger.emit).toHaveBeenCalledWith(
      'info',
      'hello',
      [{count: 1}]
    )
    expect(nativeLogger.emitDiagnostic).not.toHaveBeenCalled()
  })

  it('keeps metadata undefined when no extra fields are provided', async () => {
    const {createLogger} = await import('./logger')
    const logger = createLogger('logger-test')

    logger.info('hello')

    expect(nativeLogger.emit.mock.calls[0]?.[2]).toBeUndefined()
  })

  it('passes the explicit log level through to native logger creation', async () => {
    const {createLogger} = await import('./logger')
    const logger = createLogger('logger-test', 'info')

    logger.debug('visible-to-native', {count: 1})

    expect(nativeModule.createLogger).toHaveBeenCalledWith('logger-test', 'info')
    expect(nativeLogger.emit).toHaveBeenCalledWith('debug', 'visible-to-native', [{count: 1}])
  })

  it('keeps silent diagnostics flowing to native buffering', async () => {
    const {createLogger} = await import('./logger')
    const logger = createLogger('logger-test', 'silent')

    logger.warn({
      code: 'BUFFERED_WARN',
      title: 'Buffered warning',
      rootCause: ['Silent mode should still buffer diagnostics.']
    })

    expect(nativeLogger.emitDiagnostic).toHaveBeenCalledTimes(1)
  })

  it('exposes buffered diagnostics helpers', async () => {
    const {clearBufferedDiagnostics, drainBufferedDiagnostics, flushOutput} = await import('./logger')

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
