import process from 'node:process'

// ANSI color codes - internal use only
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
  bgRed: '\x1B[41m',
} as const

// Color helper functions - internal use only
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
  bgRed: (text: string) => `${colors.bgRed}${text}${colors.reset}`,
}

// Public types
export type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'fatal' | 'silent'

export interface ILogger {
  error: (message: string | object, ...meta: unknown[]) => void
  warn: (message: string | object, ...meta: unknown[]) => void
  info: (message: string | object, ...meta: unknown[]) => void
  debug: (message: string | object, ...meta: unknown[]) => void
  trace: (message: string | object, ...meta: unknown[]) => void
  fatal: (message: string | object, ...meta: unknown[]) => void
}

// Internal types
interface LogRecord<M extends string | number | symbol = string> {
  $: [datetime: string, level: LogLevel, namespace: string]
  _: M | {[message in M]: object} | object
}

interface LeveledLogMethod {
  (message: string, ...meta: unknown[]): LogRecord
  (message: unknown): LogRecord
  (infoObject: object): LogRecord
}

// Internal state
let globalLogLevel: LogLevel | undefined

// Internal constants
const LEVEL_COLORS: Record<string, (s: string) => string> = {
  error: colorize.red,
  warn: colorize.yellow,
  info: colorize.cyan,
  debug: colorize.magenta,
  trace: colorize.gray,
  fatal: colorize.bgRed,
}

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  silent: 0,
  fatal: 1,
  error: 2,
  warn: 3,
  info: 4,
  debug: 5,
  trace: 6,
}

// Internal helper functions
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
  if (typeof value === 'object') return toJson5(value as Record<string, unknown>)
  return String(value)
}

function toJson5(obj: Record<string, unknown>): string {
  const entries = Object.entries(obj)
  if (entries.length === 0) return '{}'
  const parts = entries.map(([k, v]) => {
    // JSON5: unquoted keys (pink), quoted keys (yellow)
    const isValidIdentifier = /^[\w$]+$/.test(k)
    const key = isValidIdentifier ? colorize.magenta(k) : colorize.yellow(`"${k}"`)
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

function formatLog(
  level: LogLevel,
  namespace: string,
  message: unknown,
  meta?: Record<string, unknown>,
): LogRecord {
  const timestamp = getTimestamp()
  const colorFn = LEVEL_COLORS[level] ?? colorize.white

  const record: LogRecord = {
    $: [timestamp, level, namespace],
    _: meta != null && Object.keys(meta).length > 0
      ? {[String(message)]: meta}
      : message as string,
  }

  // Output to console
  const base = {
    $: [timestamp, colorFn(level.toUpperCase()), namespace],
  }
  const _ = meta != null && Object.keys(meta).length > 0
    ? {[String(message)]: meta}
    : message
  const output = toJson5({...base, _} as unknown as Record<string, unknown>)

  // Use appropriate console method based on level
  if (level === 'error' || level === 'fatal') console.error(output)
  else if (level === 'warn') console.warn(output)
  // eslint-disable-next-line no-console
  else if (level === 'debug' || level === 'trace') console.debug(output)
  // eslint-disable-next-line no-console
  else console.log(output)

  return record
}

function createLeveledMethod(
  level: LogLevel,
  namespace: string,
  currentLevel: LogLevel,
): LeveledLogMethod {
  const levelPriority = LEVEL_PRIORITY[level]
  const currentPriority = LEVEL_PRIORITY[currentLevel]

  return (messageOrObject: unknown, ...meta: unknown[]): LogRecord => {
    // Check if logging is enabled for this level
    if (levelPriority > currentPriority) {
      // Return empty record without logging
      return {
        $: [getTimestamp(), level, namespace],
        _: messageOrObject as string,
      }
    }

    // Handle different call signatures
    if (typeof messageOrObject === 'string') {
      // (message: string, ...meta: unknown[])
      const metaObj = meta.length === 1 && typeof meta[0] === 'object' && meta[0] !== null
        ? meta[0] as Record<string, unknown>
        : meta.length > 0
          ? {args: meta}
          : void 0
      return formatLog(level, namespace, messageOrObject, metaObj)
    }

    if (typeof messageOrObject === 'object' && messageOrObject !== null) {
      // (infoObject: object)
      return formatLog(level, namespace, '', messageOrObject as Record<string, unknown>)
    }

    // (message: unknown)
    return formatLog(level, namespace, messageOrObject)
  }
}

// Public API functions

/**
 * Set the global log level for all loggers.
 * This should be called early in the application lifecycle,
 * before plugins are initialized.
 *
 * @param level - The log level to set globally
 */
export function setGlobalLogLevel(level: LogLevel): void {
  globalLogLevel = level
}

/**
 * Get the current global log level.
 * @returns The global log level, or undefined if not set
 */
export function getGlobalLogLevel(): LogLevel | undefined {
  return globalLogLevel
}

export function createLogger(namespace: string, logLevel?: LogLevel): ILogger {
  const level = logLevel ?? globalLogLevel ?? (process.env.LOG_LEVEL as LogLevel) ?? 'info'

  return {
    error: createLeveledMethod('error', namespace, level),
    warn: createLeveledMethod('warn', namespace, level),
    info: createLeveledMethod('info', namespace, level),
    debug: createLeveledMethod('debug', namespace, level),
    trace: createLeveledMethod('trace', namespace, level),
    fatal: createLeveledMethod('fatal', namespace, level),
  }
}
