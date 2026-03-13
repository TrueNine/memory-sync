import type {Command, CommandContext, CommandResult} from './Command'

const INIT_DEPRECATION_MESSAGE = '`tnmsc init` is deprecated and no longer initializes aindex. Maintain the public target-relative definitions manually under `~/workspace/aindex/public/`.'

export class InitCommand implements Command {
  readonly name = 'init'

  async execute(ctx: CommandContext): Promise<CommandResult> {
    const {logger} = ctx

    logger.warn('deprecated init command invoked', {command: 'init'})

    return {
      success: false,
      filesAffected: 0,
      dirsAffected: 0,
      message: INIT_DEPRECATION_MESSAGE
    }
  }
}
