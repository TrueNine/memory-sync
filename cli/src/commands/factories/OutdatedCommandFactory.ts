import type {Command} from '../Command'
import type {CommandFactory} from '../CommandFactory'
import type {ParsedCliArgs} from '@/pipeline/CliArgumentParser'
import {OutdatedCommand} from '../OutdatedCommand'

/**
 * Factory for creating OutdatedCommand
 * Handles 'outdated' subcommand
 */
export class OutdatedCommandFactory implements CommandFactory {
  canHandle(args: ParsedCliArgs): boolean {
    return args.subcommand === 'outdated'
  }

  createCommand(_args: ParsedCliArgs): Command {
    return new OutdatedCommand()
  }
}
