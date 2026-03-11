import type {Command} from '../Command'
import type {CommandFactory} from '../CommandFactory'
import type {ParsedCliArgs} from '@/pipeline/CliArgumentParser'
import {InitCommand} from '../InitCommand'

export class InitCommandFactory implements CommandFactory {
  canHandle(args: ParsedCliArgs): boolean {
    return args.subcommand === 'init'
  }

  createCommand(_args: ParsedCliArgs): Command {
    return new InitCommand()
  }
}
