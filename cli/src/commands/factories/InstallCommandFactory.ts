import type {Command} from '../Command'
import type {CommandFactory} from '../CommandFactory'
import type {ParsedCliArgs} from '@/pipeline/CliArgumentParser'
import {InstallCommand} from '../InstallCommand'

export class InstallCommandFactory implements CommandFactory {
  canHandle(args: ParsedCliArgs): boolean {
    return args.subcommand == null || args.subcommand === 'install'
  }

  createCommand(): Command {
    return new InstallCommand()
  }
}
