import type {Command} from '../Command'
import type {CommandFactory} from '../CommandFactory'
import type {ParsedCliArgs} from '@/pipeline'
import {CleanCommand} from '../CleanCommand'
import {DryRunCleanCommand} from '../DryRunCleanCommand'

/**
 * Factory for creating CleanCommand or DryRunCleanCommand
 * Handles 'clean' subcommand with optional --dry-run flag
 */
export class CleanCommandFactory implements CommandFactory {
  canHandle(args: ParsedCliArgs): boolean {
    return args.subcommand === 'clean'
  }

  createCommand(args: ParsedCliArgs): Command {
    if (args.dryRun) return new DryRunCleanCommand()
    return new CleanCommand()
  }
}
