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
    public readonly missingDependency: string,
  ) {
    super(`Plugin "${pluginName}" depends on non-existent plugin "${missingDependency}"`)
    this.name = 'MissingDependencyError'
  }
}

/**
 * 作用域相关错误基类
 * Base class for scope-related errors
 */
export class ScopeError extends Error {
  constructor(
    message: string,
    readonly expression?: string,
    readonly filePath?: string,
  ) {
    super(message)
    this.name = 'ScopeError'
  }
}

/**
 * 未定义变量错误
 * Error thrown when referencing an undefined variable in an expression
 */
export class UndefinedVariableError extends ScopeError {
  constructor(
    readonly variableName: string,
    expression?: string,
    filePath?: string,
  ) {
    const msg = filePath != null && filePath.length > 0
      ? `Undefined variable "${variableName}" in expression "${expression}" (file: ${filePath})`
      : `Undefined variable "${variableName}" in expression "${expression}"`
    super(msg, expression, filePath)
    this.name = 'UndefinedVariableError'
  }
}

/**
 * 未定义命名空间错误
 * Error thrown when referencing an undefined namespace in an expression
 */
export class UndefinedNamespaceError extends ScopeError {
  constructor(
    readonly namespace: string,
    expression?: string,
    filePath?: string,
  ) {
    const msg = filePath != null && filePath.length > 0
      ? `Undefined namespace "${namespace}" in expression "${expression}" (file: ${filePath})`
      : `Undefined namespace "${namespace}" in expression "${expression}"`
    super(msg, expression, filePath)
    this.name = 'UndefinedNamespaceError'
  }
}

/**
 * Export 解析错误
 * Error thrown when an export statement cannot be parsed or statically evaluated
 */
export class ExportParseError extends Error {
  constructor(
    message: string,
    readonly exportName?: string,
    readonly filePath?: string,
  ) {
    const hasFilePath = filePath != null && filePath.length > 0
    const hasExportName = exportName != null && exportName.length > 0
    const msg = hasFilePath
      ? `${message} (export: ${exportName}, file: ${filePath})`
      : hasExportName
        ? `${message} (export: ${exportName})`
        : message
    super(msg)
    this.name = 'ExportParseError'
  }
}

/**
 * 元数据验证错误
 * Error thrown when export metadata is missing required fields
 */
export class MetadataValidationError extends Error {
  constructor(
    readonly missingFields: readonly string[],
    readonly filePath?: string,
  ) {
    const msg = filePath != null && filePath.length > 0
      ? `Missing required metadata fields: ${missingFields.join(', ')} (file: ${filePath})`
      : `Missing required metadata fields: ${missingFields.join(', ')}`
    super(msg)
    this.name = 'MetadataValidationError'
  }
}

/**
 * 配置验证错误
 * Error thrown when configuration file contains invalid fields
 */
export class ConfigValidationError extends Error {
  constructor(
    readonly field: string,
    readonly reason: string,
    readonly filePath?: string,
  ) {
    const msg = filePath != null && filePath.length > 0
      ? `Invalid configuration field "${field}": ${reason} (file: ${filePath})`
      : `Invalid configuration field "${field}": ${reason}`
    super(msg)
    this.name = 'ConfigValidationError'
  }
}
