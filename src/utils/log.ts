import logger from './logger'

let loggerShutdownPromise: Promise<void> | null = null
let isLoggerShutdown = false

/**
 * Logger adapter that provides SLF4J-style parameter passing
 * Supports format: log.info('User {} logged in with id {}', username, userId);
 */
export class LogAdapter {
  private id: string

  constructor(id: string) {
    this.id = id
  }

  /**
   * Format message by replacing {} with corresponding arguments
   * @param message Message template
   * @param args Argument list
   * @returns Formatted message
   */
  private formatMessage(message: string, ...args: unknown[]): string {
    let formattedMessage = message
    args.forEach((arg) => {
      formattedMessage = formattedMessage.replace('{}', String(arg))
    })
    return formattedMessage.trim()
  }

  /**
   * Check if logger is still writable
   */
  private canLog(): boolean {
    return !isLoggerShutdown
  }

  /**
   * Log trace message
   * @param message Message template
   * @param args Argument list
   */
  trace(message: string, ...args: unknown[]): void {
    if (this.canLog()) {
      logger.log('trace', this.formatMessage(message, ...args), { id: this.id })
    }
  }

  /**
   * Log debug message
   * @param message Message template
   * @param args Argument list
   */
  debug(message: string, ...args: unknown[]): void {
    if (this.canLog()) {
      logger.log('debug', this.formatMessage(message, ...args), { id: this.id })
    }
  }

  /**
   * Log info message
   * @param message Message template
   * @param args Argument list
   */
  info(message: string, ...args: unknown[]): void {
    if (this.canLog()) {
      logger.log('info', this.formatMessage(message, ...args), { id: this.id })
    }
  }

  /**
   * Log fatal message
   * @param message Message template
   * @param args Argument list
   */
  fatal(message: string, ...args: unknown[]): void {
    if (this.canLog()) {
      logger.log('fatal', this.formatMessage(message, ...args), { id: this.id })
    }
  }

  /**
   * Log warning message
   * @param message Message template
   * @param args Argument list
   */
  warn(message: string, ...args: unknown[]): void {
    if (this.canLog()) {
      logger.log('warn', this.formatMessage(message, ...args), { id: this.id })
    }
  }

  /**
   * Log error message
   * @param message Message template
   * @param args Argument list
   */
  error(message: string, ...args: unknown[]): void {
    if (this.canLog()) {
      logger.log('error', this.formatMessage(message, ...args), { id: this.id })
    }
  }
}

/**
 * Global default log adapter instance
 */
const log = new LogAdapter('default')
export default log

/**
 * Perform logger shutdown with proper cleanup
 *
 * Algorithm:
 * 1. Check if already shutdown - return immediately if so
 * 2. Check if shutdown is in progress - wait for existing promise
 * 3. Mark logger as shutdown to prevent new log entries
 * 4. Wait 100ms for any pending async log operations
 * 5. Call logger.end() to flush all transports
 * 6. Wait for 'finish' event with 5-second timeout
 * 7. Handle errors silently to ensure clean exit
 *
 * This ensures all log entries are written before process exit
 * and prevents race conditions during concurrent shutdown calls
 */
async function performLoggerShutdown(): Promise<void> {
  if (isLoggerShutdown) {
    return
  }

  if (loggerShutdownPromise != null) {
    await loggerShutdownPromise
    return
  }

  loggerShutdownPromise = (async () => {
    try {
      isLoggerShutdown = true

      await new Promise<void>((resolve) => {
        setTimeout(resolve, 100)
      })

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Logger shutdown timeout'))
        }, 5000)

        logger.on('finish', () => {
          clearTimeout(timeout)
          resolve()
        })

        logger.end()
      })
    } catch {
      isLoggerShutdown = true
    }
  })()

  await loggerShutdownPromise
}

/**
 * Shutdown the logger and flush all pending log entries
 * Should be called in finally blocks of command functions
 *
 * @example
 * ```typescript
 * try {
 *   await someOperation()
 * } finally {
 *   await shutdownLogger()
 * }
 * ```
 */
export async function shutdownLogger(): Promise<void> {
  await performLoggerShutdown()
}

/**
 * Get a logger adapter with a specific identifier
 *
 * @param id - Identifier for the logger (e.g., 'commands/export')
 * @returns LogAdapter instance
 */
export function getLogger(id: string = 'default'): LogAdapter {
  return new LogAdapter(id)
}
