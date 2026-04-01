import type {Command, CommandContext, CommandResult} from './Command'
import {buildUsageDiagnostic, diagnosticLines} from '@truenine/memory-sync-sdk'

export class UnknownCommand implements Command {
  readonly name = 'unknown'

  constructor(private readonly unknownCmd: string) {}

  async execute(ctx: CommandContext): Promise<CommandResult> {
    ctx.logger.error(
      buildUsageDiagnostic({
        code: 'UNKNOWN_COMMAND',
        title: `Unknown tnmsc command: ${this.unknownCmd}`,
        rootCause: diagnosticLines(`tnmsc does not recognize the "${this.unknownCmd}" subcommand.`),
        exactFix: diagnosticLines('Run `tnmsc help` and invoke one of the supported commands.'),
        possibleFixes: [diagnosticLines('Check the command spelling and remove unsupported aliases or flags.')],
        details: {command: this.unknownCmd}
      })
    )
    ctx.logger.info('run "tnmsc help" for available commands')
    return {success: false, filesAffected: 0, dirsAffected: 0, message: `Unknown command: ${this.unknownCmd}`}
  }
}
