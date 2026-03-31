import type {Command} from '../Command'
import type {CommandFactory} from '../CommandFactory'
import type {ParsedCliArgs} from '@/pipeline/CliArgumentParser'
import {ConfigCommand} from '../ConfigCommand'
import {ConfigShowCommand} from '../ConfigShowCommand'

export class ConfigCommandFactory implements CommandFactory {
  canHandle(args: ParsedCliArgs): boolean {
    return args.subcommand === 'config'
  }

  createCommand(args: ParsedCliArgs): Command {
    if (args.showFlag) return new ConfigShowCommand()

    const parsedPositional: [key: string, value: string][] = []
    for (const arg of args.positional) {
      const eqIndex = arg.indexOf('=')
      if (eqIndex > 0) parsedPositional.push([arg.slice(0, eqIndex), arg.slice(eqIndex + 1)])
    }
    return new ConfigCommand([...args.setOption, ...parsedPositional])
  }
}
