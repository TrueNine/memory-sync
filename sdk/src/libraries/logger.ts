import {createNativeBindingLoader} from '../core/native-binding-loader'

export type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'fatal' | 'silent'
export type DiagnosticLines = readonly [string, ...string[]]
export type LoggerDiagnosticLevel = Extract<LogLevel, 'warn' | 'error' | 'fatal'>
type LoggerMethod = (message: string | object, ...meta: unknown[]) => void
type LoggerDiagnosticMethod = (diagnostic: LoggerDiagnosticInput) => void

export interface LoggerDiagnosticInput {
  readonly code: string
  readonly title: string
  readonly rootCause: DiagnosticLines
  readonly exactFix?: DiagnosticLines | undefined
  readonly possibleFixes?: readonly DiagnosticLines[] | undefined
  readonly details?: Record<string, unknown> | undefined
}

export interface LoggerDiagnosticRecord extends LoggerDiagnosticInput {
  readonly level: LoggerDiagnosticLevel
  readonly namespace: string
  readonly copyText: DiagnosticLines
}

export interface ILogger {
  error: LoggerDiagnosticMethod
  warn: LoggerDiagnosticMethod
  info: LoggerMethod
  debug: LoggerMethod
  trace: LoggerMethod
  fatal: LoggerDiagnosticMethod
}

type ActiveLogLevel = Exclude<LogLevel, 'silent'>
type PlainLogLevel = Extract<ActiveLogLevel, 'info' | 'debug' | 'trace'>

interface NapiLoggerInstance {
  emit: (level: ActiveLogLevel, message: unknown, meta?: readonly unknown[]) => void
  emitDiagnostic: (level: LoggerDiagnosticLevel, diagnostic: LoggerDiagnosticInput) => void
}

interface NapiLoggerModule {
  createLogger: (namespace: string, level?: string) => NapiLoggerInstance
  setGlobalLogLevel: (level: string) => void
  getGlobalLogLevel: () => string | undefined
  clearBufferedDiagnostics: () => void
  drainBufferedDiagnostics: () => string
  flushOutput?: () => void
}

const DIAGNOSTIC_LOG_LEVELS: readonly LoggerDiagnosticLevel[] = ['error', 'warn', 'fatal']
const PLAIN_LOG_LEVELS: readonly PlainLogLevel[] = ['info', 'debug', 'trace']

function isNapiLoggerModule(value: unknown): value is NapiLoggerModule {
  if (value == null || typeof value !== 'object') return false

  const candidate = value as Partial<NapiLoggerModule>
  return typeof candidate.createLogger === 'function'
    && typeof candidate.setGlobalLogLevel === 'function'
    && typeof candidate.getGlobalLogLevel === 'function'
    && typeof candidate.clearBufferedDiagnostics === 'function'
    && typeof candidate.drainBufferedDiagnostics === 'function'
}

const getNapiBinding = createNativeBindingLoader<NapiLoggerModule>({
  packageName: '@truenine/memory-sync-sdk',
  binaryName: 'napi-memory-sync-cli',
  bindingValidator: isNapiLoggerModule,
  cliExportName: 'logger'
})

function parseBufferedDiagnostics(serialized: string): LoggerDiagnosticRecord[] {
  try {
    const parsed = JSON.parse(serialized) as unknown
    return Array.isArray(parsed) ? parsed as LoggerDiagnosticRecord[] : []
  }
  catch {
    return []
  }
}

function createLogMethod(instance: NapiLoggerInstance, level: PlainLogLevel): LoggerMethod {
  return (message: string | object, ...meta: unknown[]): void => {
    instance.emit(level, message, meta.length === 0 ? void 0 : meta)
  }
}

function createDiagnosticMethod(instance: NapiLoggerInstance, level: LoggerDiagnosticLevel): LoggerDiagnosticMethod {
  return (diagnostic: LoggerDiagnosticInput): void => {
    instance.emitDiagnostic(level, diagnostic)
  }
}

function createNapiAdapter(instance: NapiLoggerInstance): ILogger {
  const messageMethods = PLAIN_LOG_LEVELS.reduce((logger, level) => {
    logger[level] = createLogMethod(instance, level)
    return logger
  }, {} as Record<PlainLogLevel, LoggerMethod>)

  const diagnosticMethods = DIAGNOSTIC_LOG_LEVELS.reduce((logger, level) => {
    logger[level] = createDiagnosticMethod(instance, level)
    return logger
  }, {} as Record<LoggerDiagnosticLevel, LoggerDiagnosticMethod>)

  return {
    error: diagnosticMethods.error,
    warn: diagnosticMethods.warn,
    info: messageMethods.info,
    debug: messageMethods.debug,
    trace: messageMethods.trace,
    fatal: diagnosticMethods.fatal
  }
}

export function setGlobalLogLevel(level: LogLevel): void {
  getNapiBinding().setGlobalLogLevel(level)
}

export function getGlobalLogLevel(): LogLevel | undefined {
  return getNapiBinding().getGlobalLogLevel() as LogLevel | undefined
}

export function clearBufferedDiagnostics(): void {
  getNapiBinding().clearBufferedDiagnostics()
}

export function drainBufferedDiagnostics(): LoggerDiagnosticRecord[] {
  return parseBufferedDiagnostics(getNapiBinding().drainBufferedDiagnostics())
}

export function flushOutput(): void {
  getNapiBinding().flushOutput?.()
}

export function createLogger(namespace: string, logLevel?: LogLevel): ILogger {
  return createNapiAdapter(getNapiBinding().createLogger(namespace, logLevel))
}
