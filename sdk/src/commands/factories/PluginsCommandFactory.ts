import type {Command} from '../Command'
import type {CommandFactory} from '../CommandFactory'
import type {ParsedCliArgs} from '@/pipeline/CliArgumentParser'
import {PluginsCommand} from '../PluginsCommand'

/**
 * Factory for creating PluginsCommand
 * Handles 'plugins' subcommand
 */
export class PluginsCommandFactory implements CommandFactory {
  canHandle(args: ParsedCliArgs): boolean {
    return args.subcommand === 'plugins'
  }

  createCommand(args: ParsedCliArgs): Command {
    void args
    return new PluginsCommand()
  }
}
