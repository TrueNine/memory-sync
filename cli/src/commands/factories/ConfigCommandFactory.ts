import type {Command} from '../Command'
import type {CommandFactory} from '../CommandFactory'
import type {ParsedCliArgs} from '@/pipeline/CliArgumentParser'
import {ConfigCommand} from '../ConfigCommand'
import {ConfigShowCommand} from '../ConfigShowCommand'

/**
 * Factory for creating ConfigCommand or ConfigShowCommand
 * Handles 'config' subcommand with --show flag or key=value arguments
 */
export class ConfigCommandFactory implements CommandFactory {
  canHandle(args: ParsedCliArgs): boolean {
    return args.subcommand === 'config'
  }

  createCommand(args: ParsedCliArgs): Command {
    if (args.showFlag) { // Config --show subcommand
      return new ConfigShowCommand()
    }

    const parsedPositional: [key: string, value: string][] = [] // Parse positional arguments as key=value pairs
    for (const arg of args.positional) {
      const eqIndex = arg.indexOf('=')
      if (eqIndex > 0) parsedPositional.push([arg.slice(0, eqIndex), arg.slice(eqIndex + 1)])
    }

    return new ConfigCommand([...args.setOption, ...parsedPositional])
  }
}
