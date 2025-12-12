/**
 * Base error class for all scripts-related errors
 */
export class ScriptsError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'ScriptsError'
    Error.captureStackTrace(this, this.constructor)
  }
}

/**
 * Error class for file system operations
 */
export class FileSystemError extends ScriptsError {
  constructor(message: string, path: string, cause?: Error) {
    super(message, 'FS_ERROR', { path, cause: cause?.message })
    this.name = 'FileSystemError'
  }
}
