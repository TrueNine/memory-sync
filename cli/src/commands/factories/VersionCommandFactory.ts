import type {Command} from '../Command'
import type {PrioritizedCommandFactory} from '../CommandFactory'
import type {ParsedCliArgs} from '@/pipeline/CliArgumentParser'
import {FactoryPriority} from '../CommandFactory'
import {VersionCommand} from '../VersionCommand'

export class VersionCommandFactory implements PrioritizedCommandFactory {
  readonly priority = FactoryPriority.Flags

  canHandle(args: ParsedCliArgs): boolean {
    return args.versionFlag || args.subcommand === 'version'
  }

  createCommand(): Command {
    return new VersionCommand()
  }
}
