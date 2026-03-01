import type {Command} from '../Command'
import type {PrioritizedCommandFactory} from '../CommandFactory'
import type {ParsedCliArgs} from '@/pipeline'
import {FactoryPriority} from '../CommandFactory'
import {VersionCommand} from '../VersionCommand'

/**
 * Factory for creating VersionCommand
 * Handles --version flag and 'version' subcommand
 */
export class VersionCommandFactory implements PrioritizedCommandFactory {
  readonly priority = FactoryPriority.Flags

  canHandle(args: ParsedCliArgs): boolean {
    return args.versionFlag || args.subcommand === 'version'
  }

  createCommand(_args: ParsedCliArgs): Command {
    return new VersionCommand()
  }
}
