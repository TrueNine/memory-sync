export * from './AindexTypes'
export * from './ConfigTypes.schema'
export * from './enums'
export * from './ExportMetadataTypes'
export * from './InputTypes'
export * from './OutputTypes'
export * from './plugin'
export * from './PromptTypes'
export type {
  DiagnosticLines,
  ILogger,
  LoggerDiagnosticInput,
  LoggerDiagnosticRecord,
  LogLevel
} from '@truenine/logger'

export class MissingDependencyError extends Error {
  readonly pluginName: string

  readonly missingDependency: string

  constructor(pluginName: string, missingDependency: string) {
    super(`Plugin "${pluginName}" depends on missing plugin "${missingDependency}"`)
    this.name = 'MissingDependencyError'
    this.pluginName = pluginName
    this.missingDependency = missingDependency
  }
}

export class CircularDependencyError extends Error {
  readonly cyclePath: readonly string[]

  constructor(cyclePath: readonly string[]) {
    super(`Circular plugin dependency detected: ${cyclePath.join(' -> ')}`)
    this.name = 'CircularDependencyError'
    this.cyclePath = [...cyclePath]
  }
}
