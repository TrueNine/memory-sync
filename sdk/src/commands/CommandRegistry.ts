import type {Command} from './Command'
import type {CommandFactory, PrioritizedCommandFactory} from './CommandFactory'
import type {ParsedCliArgs} from '@/pipeline/CliArgumentParser'
import {FactoryPriority} from './CommandFactory'

/**
 * Command registry that manages command factories
 * Uses priority-based resolution for factory selection
 */
export class CommandRegistry {
  private readonly factories: PrioritizedCommandFactory[] = []

  register(factory: PrioritizedCommandFactory): void {
    this.factories.push(factory)
    this.factories.sort((a, b) => a.priority - b.priority) // Sort by priority (lower number = higher priority)
  }

  registerWithPriority(factory: CommandFactory, priority: FactoryPriority): void {
    const prioritized: PrioritizedCommandFactory = { // Create a wrapper that delegates to the original factory while adding priority
      priority,
      canHandle: (args: ParsedCliArgs) => factory.canHandle(args),
      createCommand: (args: ParsedCliArgs) => factory.createCommand(args)
    }
    this.factories.push(prioritized)
    this.factories.sort((a, b) => a.priority - b.priority)
  }

  resolve(args: ParsedCliArgs): Command {
    for (const factory of this.factories) { // First pass: check prioritized factories (flags, unknown commands)
      if (factory.priority <= FactoryPriority.Unknown && factory.canHandle(args)) return factory.createCommand(args)
    }

    for (const factory of this.factories) { // Second pass: check subcommand factories
      if (factory.priority === FactoryPriority.Subcommand && factory.canHandle(args)) return factory.createCommand(args)
    }

    for (const factory of this.factories) { // Third pass: use catch-all factory (ExecuteCommandFactory)
      if (factory.canHandle(args)) return factory.createCommand(args)
    }

    throw new Error('No command factory found for the given arguments') // This should never happen if ExecuteCommandFactory is registered
  }
}
