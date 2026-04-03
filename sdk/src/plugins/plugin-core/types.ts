export * from '../../execution-plan'
export * from './AindexConfigDefaults'
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
  readonly nodeName: string

  readonly missingDependency: string

  constructor(nodeName: string, missingDependency: string) {
    super(`Node "${nodeName}" depends on missing dependency "${missingDependency}"`)
    this.name = 'MissingDependencyError'
    this.nodeName = nodeName
    this.missingDependency = missingDependency
  }
}

export class CircularDependencyError extends Error {
  readonly cyclePath: readonly string[]

  constructor(cyclePath: readonly string[]) {
    super(`Circular dependency detected: ${cyclePath.join(' -> ')}`)
    this.name = 'CircularDependencyError'
    this.cyclePath = [...cyclePath]
  }
}
