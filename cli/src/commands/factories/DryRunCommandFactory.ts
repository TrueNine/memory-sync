import type {Command} from '../Command'
import type {CommandFactory} from '../CommandFactory'
import type {ParsedCliArgs} from '@/pipeline'
import {DryRunOutputCommand} from '../DryRunOutputCommand'

/**
 * Factory for creating DryRunOutputCommand
 * Handles 'dry-run' subcommand
 */
export class DryRunCommandFactory implements CommandFactory {
  canHandle(args: ParsedCliArgs): boolean {
    return args.subcommand === 'dry-run'
  }

  createCommand(_args: ParsedCliArgs): Command {
    return new DryRunOutputCommand()
  }
}
