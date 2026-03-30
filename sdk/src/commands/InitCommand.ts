import type {Command, CommandContext, CommandResult} from './Command'
import {buildUsageDiagnostic, diagnosticLines} from '@/diagnostics'

const INIT_DEPRECATION_MESSAGE = '`tnmsc init` is deprecated and no longer initializes aindex. Maintain the public target-relative definitions manually under `~/workspace/aindex/public/`.'

export class InitCommand implements Command {
  readonly name = 'init'

  async execute(ctx: CommandContext): Promise<CommandResult> {
    const {logger} = ctx

    logger.warn(buildUsageDiagnostic({
      code: 'INIT_COMMAND_DEPRECATED',
      title: 'The init command is deprecated',
      rootCause: diagnosticLines(
        '`tnmsc init` no longer initializes aindex content or project definitions.'
      ),
      exactFix: diagnosticLines(
        'Maintain the target-relative definitions manually under `~/workspace/aindex/public/`.'
      ),
      possibleFixes: [
        diagnosticLines('Run `tnmsc help` to find a supported replacement command for your workflow.')
      ],
      details: {
        command: 'init'
      }
    }))

    return {
      success: false,
      filesAffected: 0,
      dirsAffected: 0,
      message: INIT_DEPRECATION_MESSAGE
    }
  }
}
