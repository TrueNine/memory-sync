import {createRequire} from 'node:module'
import process from 'node:process'

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
interface PlatformBinding {readonly local: string, readonly suffix: string}

interface NapiLoggerInstance {
  log: (level: ActiveLogLevel, message: string, meta?: string) => void
  logDiagnostic: (level: LoggerDiagnosticLevel, diagnosticJson: string) => void
}

interface NapiLoggerModule {
  createLogger: (namespace: string, level?: string) => NapiLoggerInstance
  setGlobalLogLevel: (level: string) => void
  getGlobalLogLevel: () => string | undefined
  clearBufferedDiagnostics: () => void
  drainBufferedDiagnostics: () => string
}

const PLATFORM_BINDINGS: Record<string, PlatformBinding> = {
  'win32-x64': {local: 'napi-logger.win32-x64-msvc', suffix: 'win32-x64-msvc'},
  'linux-x64': {local: 'napi-logger.linux-x64-gnu', suffix: 'linux-x64-gnu'},
  'linux-arm64': {local: 'napi-logger.linux-arm64-gnu', suffix: 'linux-arm64-gnu'},
  'darwin-arm64': {local: 'napi-logger.darwin-arm64', suffix: 'darwin-arm64'},
  'darwin-x64': {local: 'napi-logger.darwin-x64', suffix: 'darwin-x64'}
}

const DIAGNOSTIC_LOG_LEVELS: readonly LoggerDiagnosticLevel[] = ['error', 'warn', 'fatal']
const PLAIN_LOG_LEVELS: readonly PlainLogLevel[] = ['info', 'debug', 'trace']

let napiBinding: NapiLoggerModule | undefined,
  napiBindingError: Error | undefined

function isNapiLoggerModule(value: unknown): value is NapiLoggerModule {
  if (value == null || typeof value !== 'object') return false

  const candidate = value as Partial<NapiLoggerModule>
  return typeof candidate.createLogger === 'function'
    && typeof candidate.setGlobalLogLevel === 'function'
    && typeof candidate.getGlobalLogLevel === 'function'
    && typeof candidate.clearBufferedDiagnostics === 'function'
    && typeof candidate.drainBufferedDiagnostics === 'function'
}

function getPlatformBinding(): PlatformBinding {
  const binding = PLATFORM_BINDINGS[`${process.platform}-${process.arch}`]
  if (binding != null) return binding

  throw new Error(
    `Unsupported platform for @truenine/logger native binding: ${process.platform}-${process.arch}`
  )
}

function formatBindingLoadError(localError: unknown, packageError: unknown, suffix: string): Error {
  const localMessage = localError instanceof Error ? localError.message : String(localError)
  const packageMessage = packageError instanceof Error ? packageError.message : String(packageError)
  return new Error(
    [
      'Failed to load @truenine/logger native binding.',
      `Tried local binary "./${PLATFORM_BINDINGS[`${process.platform}-${process.arch}`]?.local ?? 'unknown'}.node" and package "@truenine/memory-sync-cli-${suffix}".`,
      `Local error: ${localMessage}`,
      `Package error: ${packageMessage}`,
      'Run `pnpm -F @truenine/logger run build` to build the native module.'
    ].join('\n')
  )
}

function loadNativeBinding(): NapiLoggerModule {
  const moduleUrl = import.meta.url
  const runtimeRequire = createRequire(moduleUrl)
  const {local, suffix} = getPlatformBinding()

  try {
    return runtimeRequire(`./${local}.node`) as NapiLoggerModule
  }
  catch (localError) {
    try {
      const cliBinaryPackage = runtimeRequire(`@truenine/memory-sync-cli-${suffix}`) as Record<string, unknown>
      const loggerModule = cliBinaryPackage['logger']

      if (isNapiLoggerModule(loggerModule)) return loggerModule

      throw new Error(`Package "@truenine/memory-sync-cli-${suffix}" does not export a logger binding`)
    }
    catch (packageError) {
      throw formatBindingLoadError(localError, packageError, suffix)
    }
  }
}

function getNapiBinding(): NapiLoggerModule {
  if (napiBinding != null) return napiBinding

  if (napiBindingError != null) throw napiBindingError

  try {
    napiBinding = loadNativeBinding()
    return napiBinding
  }
  catch (error) {
    napiBindingError = error instanceof Error ? error : new Error(String(error))
    throw napiBindingError
  }
}

function serializeError(error: Error): Record<string, unknown> {
  const serializedError: Record<string, unknown> = {
    name: error.name,
    message: error.message,
    stack: error.stack
  }

  for (const key of Object.getOwnPropertyNames(error)) {
    if (key === 'name' || key === 'message' || key === 'stack') continue

    serializedError[key] = (error as unknown as Record<string, unknown>)[key]
  }

  return serializedError
}

function createJsonReplacer(): (this: unknown, key: string, value: unknown) => unknown {
  const seen = new WeakSet<object>()

  return function jsonReplacer(_key: string, value: unknown): unknown {
    if (value instanceof Error) return serializeError(value)

    if (typeof value === 'bigint') return value.toString()

    if (typeof value === 'function') return `[Function ${value.name || 'anonymous'}]`

    if (typeof value === 'symbol') return value.toString()

    if (typeof value !== 'object' || value === null) return value

    if (seen.has(value)) return '[Circular]'

    seen.add(value)
    return value
  }
}

function serializePayload(value: unknown): string {
  return JSON.stringify(value, createJsonReplacer()) ?? 'null'
}

function parseBufferedDiagnostics(serialized: string): LoggerDiagnosticRecord[] {
  try {
    const parsed = JSON.parse(serialized) as unknown
    return Array.isArray(parsed) ? parsed as LoggerDiagnosticRecord[] : []
  }
  catch {
    return []
  }
}

function normalizeLogArguments(message: string | object, meta: unknown[]): {message: string, metaJson: string | undefined} {
  if (typeof message !== 'string') {
    return {
      message: '',
      metaJson: serializePayload(message)
    }
  }

  const metaValue = meta.length === 1 && typeof meta[0] === 'object' && meta[0] !== null
    ? meta[0]
    : meta.length > 0 ? {args: meta} : void 0

  return {
    message,
    metaJson: metaValue == null ? void 0 : serializePayload(metaValue)
  }
}

function createLogMethod(instance: NapiLoggerInstance, level: PlainLogLevel): LoggerMethod {
  return (message: string | object, ...meta: unknown[]): void => {
    const {message: normalizedMessage, metaJson} = normalizeLogArguments(message, meta)
    instance.log(level, normalizedMessage, metaJson)
  }
}

function createDiagnosticMethod(instance: NapiLoggerInstance, level: LoggerDiagnosticLevel): LoggerDiagnosticMethod {
  return (diagnostic: LoggerDiagnosticInput) => instance.logDiagnostic(level, serializePayload(diagnostic))
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

/**
 * Set the global log level for all loggers.
 */
export function setGlobalLogLevel(level: LogLevel): void {
  getNapiBinding().setGlobalLogLevel(level)
}

/**
 * Get the current global log level.
 */
export function getGlobalLogLevel(): LogLevel | undefined {
  return getNapiBinding().getGlobalLogLevel() as LogLevel | undefined
}

export function clearBufferedDiagnostics(): void {
  getNapiBinding().clearBufferedDiagnostics()
}

export function drainBufferedDiagnostics(): LoggerDiagnosticRecord[] {
  return parseBufferedDiagnostics(getNapiBinding().drainBufferedDiagnostics())
}

/**
 * Create a logger backed by the Rust native binding.
 */
export function createLogger(namespace: string, logLevel?: LogLevel): ILogger {
  const instance = getNapiBinding().createLogger(namespace, logLevel)
  return createNapiAdapter(instance)
}
