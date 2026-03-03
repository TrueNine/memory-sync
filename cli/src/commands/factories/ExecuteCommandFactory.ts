import type {Command} from '../Command'
import type {CommandFactory} from '../CommandFactory'
import type {ParsedCliArgs} from '@/pipeline'
import {ExecuteCommand} from '../ExecuteCommand'

/**
 * Factory for creating ExecuteCommand (default command)
 * Handles default execution when no specific subcommand matches
 */
export class ExecuteCommandFactory implements CommandFactory {
  canHandle(_args: ParsedCliArgs): boolean { // This is a catch-all factory with lowest priority
    return true
  }

  createCommand(_args: ParsedCliArgs): Command {
    return new ExecuteCommand()
  }
}
