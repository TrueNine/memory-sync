import type {Command, CommandContext, CommandResult} from './Command'
import process from 'node:process'
import {
  clearBufferedDiagnostics,
  drainBufferedDiagnostics,
  type LoggerDiagnosticRecord,
  partitionBufferedDiagnostics
} from '@truenine/memory-sync-sdk'

type PublicLoggerDiagnosticRecord = Omit<LoggerDiagnosticRecord, 'level'>

interface JsonCommandResult {
  readonly success: boolean
  readonly filesAffected: number
  readonly dirsAffected: number
  readonly message?: string
  readonly pluginResults: readonly []
  readonly warnings: readonly PublicLoggerDiagnosticRecord[]
  readonly errors: readonly PublicLoggerDiagnosticRecord[]
}

export class JsonOutputCommand implements Command {
  readonly name: string

  constructor(private readonly inner: Command) {
    this.name = `json:${inner.name}`
  }

  async execute(ctx: CommandContext): Promise<CommandResult> {
    clearBufferedDiagnostics()
    const result = await this.inner.execute(ctx)
    process.stdout.write(
      `${JSON.stringify(
        toJsonCommandResult(result, drainBufferedDiagnostics())
      )}\n`
    )
    return result
  }
}

export function toJsonCommandResult(
  result: CommandResult,
  diagnostics = drainBufferedDiagnostics()
): JsonCommandResult {
  const {warnings, errors} = partitionBufferedDiagnostics(diagnostics)
  return {
    success: result.success,
    filesAffected: result.filesAffected,
    dirsAffected: result.dirsAffected,
    ...result.message != null ? {message: result.message} : {},
    pluginResults: [],
    warnings,
    errors
  }
}
