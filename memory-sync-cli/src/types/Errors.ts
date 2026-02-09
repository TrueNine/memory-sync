/**
 * Error thrown when a circular dependency is detected in the plugin graph.
 */
export class CircularDependencyError extends Error {
  constructor(public readonly cycle: string[]) {
    super(`Circular dependency detected: ${cycle.join(' -> ')}`)
    this.name = 'CircularDependencyError'
  }
}

/**
 * Error thrown when a plugin depends on a non-existent plugin.
 */
export class MissingDependencyError extends Error {
  constructor(
    public readonly pluginName: string,
    public readonly missingDependency: string
  ) {
    super(`Plugin "${pluginName}" depends on non-existent plugin "${missingDependency}"`)
    this.name = 'MissingDependencyError'
  }
}

/**
 * Configuration validation error
 * Error thrown when configuration file contains invalid fields
 */
export class ConfigValidationError extends Error {
  constructor(
    readonly field: string,
    readonly reason: string,
    readonly filePath?: string
  ) {
    const msg = filePath != null && filePath.length > 0
      ? `Invalid configuration field "${field}": ${reason} (file: ${filePath})`
      : `Invalid configuration field "${field}": ${reason}`
    super(msg)
    this.name = 'ConfigValidationError'
  }
}
