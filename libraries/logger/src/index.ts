import {readdirSync} from 'node:fs'
import {createRequire} from 'node:module'
import {dirname, join} from 'node:path'
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

interface PlatformBinding {
  readonly local: string
  readonly suffix: string
}

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
      `Tried local binaries next to the source/bundle and package "@truenine/memory-sync-cli-${suffix}".`,
      `Local error: ${localMessage}`,
      `Package error: ${packageMessage}`,
      'Run `pnpm -F @truenine/logger run build` to build the native module.'
    ].join('\n')
  )
}

function loadBindingFromCliBinaryPackage(
  runtimeRequire: ReturnType<typeof createRequire>,
  suffix: string
): NapiLoggerModule {
  const packageName = `@truenine/memory-sync-cli-${suffix}`

  try {
    const cliBinaryPackage = runtimeRequire(packageName) as Record<string, unknown>
    const loggerModule = cliBinaryPackage['logger']

    if (isNapiLoggerModule(loggerModule)) return loggerModule
  }
  catch {
  }

  const packageJsonPath = runtimeRequire.resolve(`${packageName}/package.json`)
  const packageDir = dirname(packageJsonPath)
  const bindingCandidates = readdirSync(packageDir)
    .filter(fileName => fileName.startsWith('napi-logger.') && fileName.endsWith('.node'))
    .sort()

  for (const candidateFile of bindingCandidates) {
    const bindingModule = runtimeRequire(join(packageDir, candidateFile)) as unknown

    if (isNapiLoggerModule(bindingModule)) return bindingModule
  }

  throw new Error(`Package "${packageName}" does not export a logger binding or contain a compatible native module`)
}

function loadNativeBinding(): NapiLoggerModule {
  const runtimeRequire = createRequire(import.meta.url)
  const {local, suffix} = getPlatformBinding()
  const localCandidates = [`./${local}.node`, `../dist/${local}.node`]
  let localError: unknown = new Error(`No local candidate matched "${local}"`)

  for (const candidate of localCandidates) {
    try {
      return runtimeRequire(candidate) as NapiLoggerModule
    }
    catch (error) {
      localError = error
    }
  }

  try {
    return loadBindingFromCliBinaryPackage(runtimeRequire, suffix)
  }
  catch (packageError) {
    throw formatBindingLoadError(localError, packageError, suffix)
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
