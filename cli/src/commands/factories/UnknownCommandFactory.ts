import type {Command} from '../Command'
import type {PrioritizedCommandFactory} from '../CommandFactory'
import type {ParsedCliArgs} from '@/pipeline/CliArgumentParser'
import {FactoryPriority} from '../CommandFactory'
import {UnknownCommand} from '../UnknownCommand'

/**
 * Factory for creating UnknownCommand
 * Handles unknown/invalid subcommands
 */
export class UnknownCommandFactory implements PrioritizedCommandFactory {
  readonly priority = FactoryPriority.Unknown

  canHandle(args: ParsedCliArgs): boolean {
    return args.unknownCommand != null
  }

  createCommand(args: ParsedCliArgs): Command {
    if (args.unknownCommand == null) return new UnknownCommand('')
    return new UnknownCommand(args.unknownCommand)
  }
}
