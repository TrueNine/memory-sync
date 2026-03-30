import type {Command} from '../Command'
import type {CommandFactory} from '../CommandFactory'
import type {ParsedCliArgs} from '@/pipeline/CliArgumentParser'
import {ExecuteCommand} from '../ExecuteCommand'

/**
 * Factory for creating ExecuteCommand (default command)
 * Handles default execution when no specific subcommand matches
 */
export class ExecuteCommandFactory implements CommandFactory {
  canHandle(args: ParsedCliArgs): boolean { // This is a catch-all factory with lowest priority
    void args
    return true
  }

  createCommand(args: ParsedCliArgs): Command {
    void args
    return new ExecuteCommand()
  }
}
