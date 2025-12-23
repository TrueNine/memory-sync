import process from 'node:process'
import pc from 'picocolors'
import winston from 'winston'

export type Logger = winston.Logger

const LEVEL_COLORS: Record<string, (s: string) => string> = {
  error: pc.red,
  warn: pc.yellow,
  info: pc.cyan,
  debug: pc.magenta,
}

function colorizeValue(value: unknown): string {
  if (value === null) {
    return pc.dim('null')
  }
  if (typeof value === 'undefined') {
    return pc.dim('undefined')
  }
  if (typeof value === 'boolean') {
    return pc.yellow(String(value))
  }
  if (typeof value === 'number') {
    return pc.blue(String(value))
  }
  if (typeof value === 'string') {
    return pc.green(`"${value}"`)
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return '[]'
    }
    return `[${value.map((v) => colorizeValue(v)).join(',')}]`
  }
  if (typeof value === 'object') {
    return toJson5(value as Record<string, unknown>)
  }
  return String(value)
}

function toJson5(obj: Record<string, unknown>): string {
  const entries = Object.entries(obj)
  if (entries.length === 0) {
    return '{}'
  }
  const parts = entries.map(([k, v]) => {
    // JSON5: unquoted keys (pink), quoted keys (yellow)
    const isValidIdentifier = /^[\w$]+$/.test(k)
    const key = isValidIdentifier ? pc.magenta(k) : pc.yellow(`"${k}"`)
    return `${key}:${colorizeValue(v)}`
  })
  return `{${parts.join(',')}}`
}

function formatLog(info: winston.Logform.TransformableInfo): string {
  const { timestamp, level, message, scope, ...rest } = info
  const colorFn = LEVEL_COLORS[level] ?? pc.white
  const base = {
    $: [timestamp, colorFn(level.toUpperCase()), scope],
  }
  if (message == null) {
    return toJson5(base as unknown as Record<string, unknown>)
  }
  const hasRest = Object.keys(rest).length > 0
  const _ = hasRest ? { [message as string]: rest } : message
  return toJson5({ ...base, _ } as unknown as Record<string, unknown>)
}

export function createLogger(scope: string, logLevel?: string): Logger {
  return winston.createLogger({
    level: logLevel ?? process.env['LOG_LEVEL'] ?? 'info',
    defaultMeta: { scope },
    format: winston.format.combine(
      winston.format.timestamp({
        format: 'HH:mm:ss.SSS',
      }),
      winston.format.printf(formatLog),
    ),
    transports: [new winston.transports.Console()],
  })
}
