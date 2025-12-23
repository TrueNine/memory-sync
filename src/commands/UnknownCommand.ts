import type { Command, CommandContext, CommandResult } from './Command'

/**
 * Unknown command - displays error for unrecognized subcommands
 */
export class UnknownCommand implements Command {
  readonly name = 'unknown'

  constructor(private readonly unknownCmd: string) { }

  async execute(_ctx: CommandContext): Promise<CommandResult> {
    console.error(`Unknown command: ${this.unknownCmd}`)

    console.error('Run "tnmsc help" for available commands.')

    return {
      success: false,
      filesAffected: 0,
      dirsAffected: 0,
    }
  }
}
