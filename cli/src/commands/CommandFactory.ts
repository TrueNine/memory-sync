import type {Command} from './Command'
import type {ParsedCliArgs} from '@/pipeline/CliArgumentParser'

export interface CommandFactory {
  canHandle: (args: ParsedCliArgs) => boolean
  createCommand: (args: ParsedCliArgs) => Command
}

export enum FactoryPriority {
  Flags = 0,
  Unknown = 1,
  Subcommand = 2
}

export interface PrioritizedCommandFactory extends CommandFactory {
  readonly priority: FactoryPriority
}
