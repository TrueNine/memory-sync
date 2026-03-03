import type {Command} from './Command'
import type {ParsedCliArgs} from '@/pipeline'

/**
 * Command factory interface
 * Each factory knows how to create a specific command based on CLI args
 */
export interface CommandFactory {
  canHandle: (args: ParsedCliArgs) => boolean

  createCommand: (args: ParsedCliArgs) => Command
}

/**
 * Priority levels for command factory resolution
 * Lower number = higher priority
 */
export enum FactoryPriority {
  Flags = 0, // --version, --help flags (highest priority)
  Unknown = 1, // Unknown command handling
  Subcommand = 2 // Named subcommands
}

/**
 * Extended factory interface with priority
 */
export interface PrioritizedCommandFactory extends CommandFactory {
  readonly priority: FactoryPriority
}
