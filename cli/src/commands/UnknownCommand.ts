import type {Command, CommandContext, CommandResult} from './Command'
import {buildUsageDiagnostic, diagnosticLines} from '@truenine/memory-sync-sdk'

export class UnknownCommand implements Command {
  readonly name = 'unknown'

  constructor(private readonly unknownCmd: string) {}

  async execute(ctx: CommandContext): Promise<CommandResult> {
    ctx.logger.error(
      buildUsageDiagnostic({
        code: 'UNKNOWN_COMMAND',
        title: 'Command not found',
        rootCause: diagnosticLines(
          `tnmsc does not recognize "${this.unknownCmd}".`
        ),
        exactFix: diagnosticLines('Run `tnmsc help`, then retry with a supported command.'),
        possibleFixes: [diagnosticLines('Check the command spelling and remove unsupported aliases or flags.')],
        details: {command: this.unknownCmd}
      })
    )
    return {success: false, filesAffected: 0, dirsAffected: 0, message: `Unknown command: ${this.unknownCmd}`}
  }
}
