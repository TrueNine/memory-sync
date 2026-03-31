import type {Command} from '../Command'
import type {CommandFactory} from '../CommandFactory'
import type {ParsedCliArgs} from '@/pipeline/CliArgumentParser'
import {PluginsCommand} from '../PluginsCommand'

export class PluginsCommandFactory implements CommandFactory {
  canHandle(args: ParsedCliArgs): boolean {
    return args.subcommand === 'plugins'
  }

  createCommand(): Command {
    return new PluginsCommand()
  }
}
