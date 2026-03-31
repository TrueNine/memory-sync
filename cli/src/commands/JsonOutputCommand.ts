import type {Command, CommandContext, CommandResult, JsonCommandResult} from './Command'
import process from 'node:process'
import {clearBufferedDiagnostics, drainBufferedDiagnostics, partitionBufferedDiagnostics} from '@truenine/memory-sync-sdk'

export class JsonOutputCommand implements Command {
  readonly name: string

  constructor(private readonly inner: Command) {
    this.name = `json:${inner.name}`
  }

  async execute(ctx: CommandContext): Promise<CommandResult> {
    clearBufferedDiagnostics()
    const result = await this.inner.execute(ctx)
    process.stdout.write(`${JSON.stringify(toJsonCommandResult(result, drainBufferedDiagnostics()))}\n`)
    return result
  }
}

export function toJsonCommandResult(result: CommandResult, diagnostics = drainBufferedDiagnostics()): JsonCommandResult {
  const {warnings, errors} = partitionBufferedDiagnostics(diagnostics)
  return {
    success: result.success,
    filesAffected: result.filesAffected,
    dirsAffected: result.dirsAffected,
    ...result.message != null && {message: result.message},
    pluginResults: [],
    warnings,
    errors
  }
}
