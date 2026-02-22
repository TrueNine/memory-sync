import {createRequire} from 'node:module'
import process from 'node:process'

export type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'fatal' | 'silent'

export interface ILogger {
  error: (message: string | object, ...meta: unknown[]) => void
  warn: (message: string | object, ...meta: unknown[]) => void
  info: (message: string | object, ...meta: unknown[]) => void
  debug: (message: string | object, ...meta: unknown[]) => void
  trace: (message: string | object, ...meta: unknown[]) => void
  fatal: (message: string | object, ...meta: unknown[]) => void
} // Napi binding types (loaded at runtime)

interface NapiLoggerInstance {
  error: (message: string) => void
  errorWithMeta: (message: string, meta: string) => void
  warn: (message: string) => void
  warnWithMeta: (message: string, meta: string) => void
  info: (message: string) => void
  infoWithMeta: (message: string, meta: string) => void
  debug: (message: string) => void
  debugWithMeta: (message: string, meta: string) => void
  trace: (message: string) => void
  traceWithMeta: (message: string, meta: string) => void
  fatal: (message: string) => void
  fatalWithMeta: (message: string, meta: string) => void
}

interface NapiLoggerModule {
  createLogger: (namespace: string, level?: string) => NapiLoggerInstance
  setGlobalLogLevel: (level: string) => void
  getGlobalLogLevel: () => string | undefined
} // Load napi binding (CJS) with fallback to pure-TS implementation

let napiBinding: NapiLoggerModule | null = null

try {
  const require = createRequire(import.meta.url)
  const {platform, arch} = process
  const platforms: Record<string, [local: string, suffix: string]> = {
    'win32-x64': ['napi-logger.win32-x64-msvc', 'win32-x64-msvc'],
    'linux-x64': ['napi-logger.linux-x64-gnu', 'linux-x64-gnu'],
    'linux-arm64': ['napi-logger.linux-arm64-gnu', 'linux-arm64-gnu'],
    'darwin-arm64': ['napi-logger.darwin-arm64', 'darwin-arm64'],
    'darwin-x64': ['napi-logger.darwin-x64', 'darwin-x64']
  }
  const entry = platforms[`${platform}-${arch}`]
  if (entry != null) {
    const [local, suffix] = entry
    try {
      napiBinding = require(`./${local}.node`) as NapiLoggerModule
    }
    catch {
      try {
        const pkg = require(`@truenine/memory-sync-cli-${suffix}`) as Record<string, unknown>
        napiBinding = pkg['logger'] as NapiLoggerModule
      }
      catch {}
    }
  }
}
catch {} // Native module not available — fall back to pure-TS implementation

const colors = {
  reset: '\x1B[0m',
  red: '\x1B[31m',
  yellow: '\x1B[33m',
  cyan: '\x1B[36m',
  magenta: '\x1B[35m',
  gray: '\x1B[90m',
  blue: '\x1B[34m',
  green: '\x1B[32m',
  white: '\x1B[37m',
  dim: '\x1B[2m',
  bgRed: '\x1B[41m'
} as const

const colorize = {
  red: (text: string) => `${colors.red}${text}${colors.reset}`,
  yellow: (text: string) => `${colors.yellow}${text}${colors.reset}`,
  cyan: (text: string) => `${colors.cyan}${text}${colors.reset}`,
  magenta: (text: string) => `${colors.magenta}${text}${colors.reset}`,
  gray: (text: string) => `${colors.gray}${text}${colors.reset}`,
  blue: (text: string) => `${colors.blue}${text}${colors.reset}`,
  green: (text: string) => `${colors.green}${text}${colors.reset}`,
  white: (text: string) => `${colors.white}${text}${colors.reset}`,
  dim: (text: string) => `${colors.dim}${text}${colors.reset}`,
  bgRed: (text: string) => `${colors.bgRed}${text}${colors.reset}`
}

let globalLogLevel: LogLevel | undefined

const LEVEL_COLORS: Record<string, (s: string) => string> = {
  error: colorize.red,
  warn: colorize.yellow,
  info: colorize.cyan,
  debug: colorize.magenta,
  trace: colorize.gray,
  fatal: colorize.bgRed
}

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  silent: 0,
  fatal: 1,
  error: 2,
  warn: 3,
  info: 4,
  debug: 5,
  trace: 6
}

function colorizeValue(value: unknown): string {
  if (value === null) return colorize.dim('null')
  if (typeof value === 'undefined') return colorize.dim('undefined')
  if (typeof value === 'boolean') return colorize.yellow(String(value))
  if (typeof value === 'number') return colorize.blue(String(value))
  if (typeof value === 'string') return colorize.green(`"${value}"`)
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]'
    return `[${value.map(v => colorizeValue(v)).join(',')}]`
  }
  if (value instanceof Error) {
    const errorObj: Record<string, unknown> = {
      name: value.name,
      message: value.message,
      stack: value.stack
    }
    for (const key of Object.getOwnPropertyNames(value)) {
      if (key !== 'name' && key !== 'message' && key !== 'stack') errorObj[key] = (value as unknown as Record<string, unknown>)[key]
    }
    return tsToJson(errorObj)
  }
  if (typeof value === 'object') return tsToJson(value as Record<string, unknown>)
  return String(value)
}

function tsToJson(obj: Record<string, unknown>): string {
  const entries = Object.entries(obj)
  if (entries.length === 0) return '{}'
  const parts = entries.map(([k, v]) => {
    const key = colorize.magenta(`"${k}"`)
    return `${key}:${colorizeValue(v)}`
  })
  return `{${parts.join(',')}}`
}

function getTimestamp(): string {
  const now = new Date()
  const hours = String(now.getHours()).padStart(2, '0')
  const minutes = String(now.getMinutes()).padStart(2, '0')
  const seconds = String(now.getSeconds()).padStart(2, '0')
  const ms = String(now.getMilliseconds()).padStart(3, '0')
  return `${hours}:${minutes}:${seconds}.${ms}`
}

function formatLog(level: LogLevel, namespace: string, message: unknown, meta?: Record<string, unknown>): void {
  const timestamp = getTimestamp()
  const colorFn = LEVEL_COLORS[level] ?? colorize.white
  const messageStr = String(message)
  const hasMeta = meta != null && Object.keys(meta).length > 0
  const isEmptyMessage = messageStr === ''
  const base = {$: [timestamp, colorFn(level.toUpperCase()), namespace]}
  const _ = hasMeta ? isEmptyMessage ? meta : {[messageStr]: meta} : message
  const output = tsToJson({...base, _} as unknown as Record<string, unknown>)
  if (level === 'error' || level === 'fatal') console.error(output)
  else if (level === 'warn') console.warn(output)
  // eslint-disable-next-line no-console
  else if (level === 'debug' || level === 'trace') console.debug(output)
  // eslint-disable-next-line no-console
  else console.log(output)
}

function createTsLevelMethod(level: LogLevel, namespace: string, currentLevel: LogLevel) {
  const levelPriority = LEVEL_PRIORITY[level]
  const currentPriority = LEVEL_PRIORITY[currentLevel]
  return (messageOrObject: string | object, ...meta: unknown[]): void => {
    if (levelPriority > currentPriority) return
    if (typeof messageOrObject === 'string') {
      const metaObj = meta.length === 1 && typeof meta[0] === 'object' && meta[0] !== null
        ? meta[0] as Record<string, unknown>
        : meta.length > 0 ? {args: meta} : void 0
      formatLog(level, namespace, messageOrObject, metaObj)
    } else if (typeof messageOrObject === 'object' && messageOrObject !== null) formatLog(level, namespace, '', messageOrObject as Record<string, unknown>)
    else formatLog(level, namespace, messageOrObject)
  }
}

function createTsFallbackLogger(namespace: string, logLevel?: LogLevel): ILogger {
  const level = logLevel ?? globalLogLevel ?? (process.env['LOG_LEVEL'] as LogLevel) ?? 'info'
  return {
    error: createTsLevelMethod('error', namespace, level),
    warn: createTsLevelMethod('warn', namespace, level),
    info: createTsLevelMethod('info', namespace, level),
    debug: createTsLevelMethod('debug', namespace, level),
    trace: createTsLevelMethod('trace', namespace, level),
    fatal: createTsLevelMethod('fatal', namespace, level)
  }
} // Napi adapter — wraps NapiLoggerInstance to implement ILogger

function serializeMeta(message: string | object, meta: unknown[]): {msg: string, metaStr: string | undefined} {
  if (typeof message !== 'string') return {msg: '', metaStr: JSON.stringify(message)}

  const metaObj = meta.length === 1 && typeof meta[0] === 'object' && meta[0] !== null
    ? meta[0]
    : meta.length > 0 ? {args: meta} : void 0
  return {msg: message, metaStr: metaObj != null ? JSON.stringify(metaObj) : void 0}
}

function createNapiAdapter(instance: NapiLoggerInstance): ILogger {
  function makeMethod(
    plain: (msg: string) => void,
    withMeta: (msg: string, meta: string) => void
  ) {
    return (message: string | object, ...meta: unknown[]): void => {
      const {msg, metaStr} = serializeMeta(message, meta)
      if (metaStr != null) withMeta(msg, metaStr)
      else plain(msg)
    }
  }
  return {
    error: makeMethod(m => instance.error(m), (m, s) => instance.errorWithMeta(m, s)),
    warn: makeMethod(m => instance.warn(m), (m, s) => instance.warnWithMeta(m, s)),
    info: makeMethod(m => instance.info(m), (m, s) => instance.infoWithMeta(m, s)),
    debug: makeMethod(m => instance.debug(m), (m, s) => instance.debugWithMeta(m, s)),
    trace: makeMethod(m => instance.trace(m), (m, s) => instance.traceWithMeta(m, s)),
    fatal: makeMethod(m => instance.fatal(m), (m, s) => instance.fatalWithMeta(m, s))
  }
} // Public API

/**
 * Set the global log level for all loggers.
 */
export function setGlobalLogLevel(level: LogLevel): void {
  globalLogLevel = level
  napiBinding?.setGlobalLogLevel(level)
}

/**
 * Get the current global log level.
 */
export function getGlobalLogLevel(): LogLevel | undefined {
  if (napiBinding != null) return napiBinding.getGlobalLogLevel() as LogLevel | undefined
  return globalLogLevel
}

/**
 * Create a logger. Uses Rust napi-logger when available, falls back to pure-TS.
 */
export function createLogger(namespace: string, logLevel?: LogLevel): ILogger {
  if (napiBinding == null) return createTsFallbackLogger(namespace, logLevel)

  const instance = napiBinding.createLogger(namespace, logLevel)
  return createNapiAdapter(instance)
}
