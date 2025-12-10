/**
 * Winston logger configuration for the scripts CLI tool
 * Provides structured logging with console output only
 */

import winston from 'winston'

/**
 * Log levels in HTTP-like format
 * Note: In winston, lower numbers = higher priority (will be logged first)
 * We reverse the numbers so error (highest severity) has lowest number
 *
 * error: 0 (highest severity, always logged)
 * warn: 1
 * fatal: 2
 * info: 3
 * debug: 4
 * trace: 5 (most verbose, lowest priority)
 */
const levels = {
  error: 0,
  warn: 1,
  fatal: 2,
  info: 3,
  debug: 4,
  trace: 5,
}

/**
 * JSON log payload structure with shortened keys for compact storage
 */
interface JsonLogPayload {
  /**
   * Timestamp in milliseconds since epoch
   */
  ts: number
  /**
   * Log level (trace, debug, info, fatal, warn, error)
   */
  lvl: string
  /**
   * Log message
   */
  msg: string
  /**
   * Optional identifier for the log entry
   */
  id?: string
  /**
   * Optional stack trace for errors
   */
  stack?: string
  /**
   * Optional metadata object
   */
  meta?: Record<string, unknown>
}

/**
 * Metadata information type
 */
type MetaInfo = Record<string, unknown> & { id?: string }

/**
 * Custom Winston format that transforms log entries into compact console format
 *
 * Algorithm:
 * 1. Extract timestamp, level, message, stack, and remaining metadata
 * 2. Convert timestamp to milliseconds since epoch
 * 3. Extract 'id' field from metadata if present
 * 4. Include stack trace if present
 * 5. Bundle remaining metadata into 'meta' field
 * 6. Serialize to JSON with shortened keys (ts, lvl, msg)
 */
const shortKeyFormat = winston.format((info: winston.Logform.TransformableInfo) => {
  const { timestamp, level, message, stack, ...rest } = info
  const meta = { ...rest } as MetaInfo

  const payload: JsonLogPayload = {
    ts:
      typeof timestamp === 'string'
        ? Number.isNaN(Date.parse(timestamp))
          ? Date.now()
          : new Date(timestamp).valueOf()
        : Date.now(),
    lvl: typeof level === 'string' ? level : String(level),
    msg: typeof message === 'string' ? message : JSON.stringify(message),
  }

  const idValue = meta.id
  if (typeof idValue === 'string' && idValue.length > 0) {
    payload.id = idValue
    delete meta.id
  }

  if (typeof stack === 'string' && stack.length > 0) {
    payload.stack = stack
  }

  const metaEntries = Object.entries(meta)
  if (metaEntries.length > 0) {
    payload.meta = Object.fromEntries(metaEntries)
  }

  info[Symbol.for('message')] = JSON.stringify(payload)
  return info
})

/**
 * Winston logger instance configured with console output only
 *
 * Features:
 * - Six log levels: trace, debug, info, fatal, warn, error (HTTP-like format)
 * - Console output only (no file logging)
 * - Compact JSON format with shortened keys
 * - Stack trace capture for errors
 */
const logger = winston.createLogger({
  levels,
  level: 'trace',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    shortKeyFormat(),
  ),
  transports: [new winston.transports.Console({ level: 'trace' })],
  silent: false,
  exitOnError: false,
})

export default logger
