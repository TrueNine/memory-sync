import type {Command, CommandContext, CommandResult, JsonCommandResult} from './Command'
import process from 'node:process'

/**
 * Decorator command that wraps any Command to produce JSON output on stdout.
 *
 * When the `--json` flag is detected, this wrapper:
 * 1. Suppresses all Winston console logging (sets global log level to 'silent')
 * 2. Delegates execution to the inner command
 * 3. Converts the CommandResult to a JsonCommandResult
 * 4. Writes the JSON string to stdout
 *
 * This ensures clean, parseable JSON output for consumption by
 * Tauri sidecar or other external tooling.
 */
export class JsonOutputCommand implements Command {
  readonly name: string
  private readonly inner: Command

  constructor(inner: Command) {
    this.inner = inner
    this.name = `json:${inner.name}`
  }

  async execute(ctx: CommandContext): Promise<CommandResult> {
    const result = await this.inner.execute(ctx)
    const jsonResult = toJsonCommandResult(result)
    process.stdout.write(`${JSON.stringify(jsonResult)}\n`)
    return result
  }
}

/**
 * Convert a CommandResult to a JsonCommandResult.
 * Maps the base result fields and initialises optional arrays as empty
 * when not present, ensuring a consistent JSON shape.
 */
export function toJsonCommandResult(result: CommandResult): JsonCommandResult {
  const json: JsonCommandResult = {
    success: result.success,
    filesAffected: result.filesAffected,
    dirsAffected: result.dirsAffected,
    ...result.message != null && {message: result.message},
    pluginResults: [],
    errors: []
  }
  return json
}
