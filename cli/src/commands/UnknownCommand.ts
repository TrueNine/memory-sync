import type {Command, CommandContext, CommandResult} from './Command'

/**
 * Unknown command - displays error for unrecognized subcommands
 */
export class UnknownCommand implements Command {
  readonly name = 'unknown'

  constructor(private readonly unknownCmd: string) { }

  async execute(ctx: CommandContext): Promise<CommandResult> {
    ctx.logger.error('unknown command', {command: this.unknownCmd})
    ctx.logger.info('run "tnmsc help" for available commands')

    return {
      success: false,
      filesAffected: 0,
      dirsAffected: 0,
      message: `Unknown command: ${this.unknownCmd}`
    }
  }
}
