import type {Command} from '../Command'
import type {PrioritizedCommandFactory} from '../CommandFactory'
import type {ParsedCliArgs} from '@/pipeline/CliArgumentParser'
import {FactoryPriority} from '../CommandFactory'
import {HelpCommand} from '../HelpCommand'

/**
 * Factory for creating HelpCommand
 * Handles --help flag and 'help' subcommand
 */
export class HelpCommandFactory implements PrioritizedCommandFactory {
  readonly priority = FactoryPriority.Flags

  canHandle(args: ParsedCliArgs): boolean {
    return args.helpFlag || args.subcommand === 'help'
  }

  createCommand(args: ParsedCliArgs): Command {
    void args
    return new HelpCommand()
  }
}
