import type {Command} from '../Command'
import type {CommandFactory} from '../CommandFactory'
import type {ParsedCliArgs} from '@/pipeline/CliArgumentParser'
import {DryRunOutputCommand} from '../DryRunOutputCommand'

export class DryRunCommandFactory implements CommandFactory {
  canHandle(args: ParsedCliArgs): boolean {
    return args.subcommand === 'dry-run'
  }

  createCommand(): Command {
    return new DryRunOutputCommand()
  }
}
