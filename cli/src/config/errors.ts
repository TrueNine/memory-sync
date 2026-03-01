/**
 * Error classes for the TNMSC configuration system.
 *
 * This module provides specific error types for different configuration
 * failure scenarios, enabling better error handling and user feedback.
 */

/**
 * Base error class for all configuration-related errors.
 */
export class ConfigError extends Error {
  readonly configPath: string | undefined

  constructor(message: string, configPath?: string) {
    super(message)
    this.name = 'ConfigError'
    this.configPath = configPath ?? void 0

    if (Error.captureStackTrace !== void 0 && Error.captureStackTrace !== null) { // Maintain proper stack trace in V8 environments
      Error.captureStackTrace(this, ConfigError)
    }
  }

  override toString(): string {
    const pathInfo = this.configPath !== void 0 && this.configPath !== null && this.configPath.length > 0 ? ` (${this.configPath})` : ''
    return `${this.name}${pathInfo}: ${this.message}`
  }
}

/**
 * Error thrown when the configuration file cannot be found.
 */
export class ConfigFileNotFoundError extends ConfigError {
  constructor(configPath: string) {
    super(`Configuration file not found: ${configPath}`, configPath)
    this.name = 'ConfigFileNotFoundError'

    if (Error.captureStackTrace !== void 0 && Error.captureStackTrace !== null) Error.captureStackTrace(this, ConfigFileNotFoundError)
  }
}

/**
 * Error thrown when the configuration file contains invalid JSON.
 */
export class ConfigParseError extends ConfigError {
  readonly syntaxError: SyntaxError

  constructor(configPath: string, syntaxError: SyntaxError) {
    super(`Invalid JSON in configuration file: ${syntaxError.message}`, configPath)
    this.name = 'ConfigParseError'
    this.syntaxError = syntaxError

    if (Error.captureStackTrace !== void 0 && Error.captureStackTrace !== null) Error.captureStackTrace(this, ConfigParseError)
  }
}

/**
 * Error thrown when the configuration fails schema validation.
 */
export class ConfigValidationError extends ConfigError {
  readonly validationErrors: readonly string[]

  constructor(configPath: string, validationErrors: string[]) {
    const errorList = validationErrors.join('; ')
    super(`Configuration validation failed: ${errorList}`, configPath)
    this.name = 'ConfigValidationError'
    this.validationErrors = validationErrors

    if (Error.captureStackTrace !== void 0 && Error.captureStackTrace !== null) Error.captureStackTrace(this, ConfigValidationError)
  }

  get formattedErrors(): string {
    return this.validationErrors.map((err, i) => `  ${i + 1}. ${err}`).join('\n')
  }

  override toString(): string {
    const pathInfo = this.configPath !== void 0 && this.configPath !== null && this.configPath.length > 0 ? ` (${this.configPath})` : ''
    return `${this.name}${pathInfo}:\n${this.formattedErrors}`
  }
}

/**
 * Error thrown when path resolution fails.
 */
export class ConfigPathError extends ConfigError {
  readonly path: string

  constructor(configPath: string, path: string, reason: string) {
    super(`Path resolution failed for "${path}": ${reason}`, configPath)
    this.name = 'ConfigPathError'
    this.path = path

    if (Error.captureStackTrace !== void 0 && Error.captureStackTrace !== null) Error.captureStackTrace(this, ConfigPathError)
  }
}

/**
 * Error thrown when the configuration file cannot be read due to permissions.
 */
export class ConfigPermissionError extends ConfigError {
  readonly originalError: Error

  constructor(configPath: string, originalError: Error) {
    super(`Cannot read configuration file: ${originalError.message}`, configPath)
    this.name = 'ConfigPermissionError'
    this.originalError = originalError

    if (Error.captureStackTrace !== void 0 && Error.captureStackTrace !== null) Error.captureStackTrace(this, ConfigPermissionError)
  }
}

/**
 * Type guard to check if an error is a ConfigError.
 *
 * @param error - The error to check
 * @returns True if the error is a ConfigError
 */
export function isConfigError(error: unknown): error is ConfigError {
  return error instanceof ConfigError
}

/**
 * Type guard to check if an error is a ConfigFileNotFoundError.
 *
 * @param error - The error to check
 * @returns True if the error is a ConfigFileNotFoundError
 */
export function isConfigFileNotFoundError(error: unknown): error is ConfigFileNotFoundError {
  return error instanceof ConfigFileNotFoundError
}

/**
 * Type guard to check if an error is a ConfigParseError.
 *
 * @param error - The error to check
 * @returns True if the error is a ConfigParseError
 */
export function isConfigParseError(error: unknown): error is ConfigParseError {
  return error instanceof ConfigParseError
}

/**
 * Type guard to check if an error is a ConfigValidationError.
 *
 * @param error - The error to check
 * @returns True if the error is a ConfigValidationError
 */
export function isConfigValidationError(error: unknown): error is ConfigValidationError {
  return error instanceof ConfigValidationError
}

/**
 * Format any error into a user-friendly message.
 *
 * @param error - The error to format
 * @returns A formatted error message
 */
export function formatConfigError(error: unknown): string {
  if (isConfigError(error)) return error.toString()

  if (error instanceof Error) return `Error: ${error.message}`

  return `Unknown error: ${String(error)}`
}
