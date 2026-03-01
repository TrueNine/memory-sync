import type {Command} from '../Command'
import type {CommandFactory} from '../CommandFactory'
import type {ParsedCliArgs} from '@/pipeline'
import {PluginsCommand} from '../PluginsCommand'

/**
 * Factory for creating PluginsCommand
 * Handles 'plugins' subcommand
 */
export class PluginsCommandFactory implements CommandFactory {
  canHandle(args: ParsedCliArgs): boolean {
    return args.subcommand === 'plugins'
  }

  createCommand(_args: ParsedCliArgs): Command {
    return new PluginsCommand()
  }
}
