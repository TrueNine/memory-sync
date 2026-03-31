import type {Command} from '../Command'
import type {CommandFactory} from '../CommandFactory'
import type {ParsedCliArgs} from '@/pipeline/CliArgumentParser'
import {CleanCommand} from '../CleanCommand'
import {DryRunCleanCommand} from '../DryRunCleanCommand'

export class CleanCommandFactory implements CommandFactory {
  canHandle(args: ParsedCliArgs): boolean {
    return args.subcommand === 'clean'
  }

  createCommand(args: ParsedCliArgs): Command {
    return args.dryRun ? new DryRunCleanCommand() : new CleanCommand()
  }
}
