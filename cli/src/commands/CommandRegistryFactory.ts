import {FactoryPriority} from './CommandFactory'
import {CommandRegistry} from './CommandRegistry'
import {CleanCommandFactory} from './factories/CleanCommandFactory'
import {ConfigCommandFactory} from './factories/ConfigCommandFactory'
import {DryRunCommandFactory} from './factories/DryRunCommandFactory'
import {ExecuteCommandFactory} from './factories/ExecuteCommandFactory'
import {HelpCommandFactory} from './factories/HelpCommandFactory'
import {InitCommandFactory} from './factories/InitCommandFactory'
import {OutdatedCommandFactory} from './factories/OutdatedCommandFactory'
import {PluginsCommandFactory} from './factories/PluginsCommandFactory'
import {UnknownCommandFactory} from './factories/UnknownCommandFactory'
import {VersionCommandFactory} from './factories/VersionCommandFactory'

/**
 * Create a default command registry with all standard factories pre-registered
 *
 * This is in a separate file to avoid circular dependencies between
 * CommandRegistry -> Factories -> Commands -> index
 */
export function createDefaultCommandRegistry(): CommandRegistry {
  const registry = new CommandRegistry()

  registry.register(new VersionCommandFactory()) // High priority: flag-based commands
  registry.register(new HelpCommandFactory())
  registry.register(new UnknownCommandFactory())

  registry.registerWithPriority(new OutdatedCommandFactory(), FactoryPriority.Subcommand) // Normal priority: subcommand-based commands
  registry.registerWithPriority(new InitCommandFactory(), FactoryPriority.Subcommand)
  registry.registerWithPriority(new DryRunCommandFactory(), FactoryPriority.Subcommand)
  registry.registerWithPriority(new CleanCommandFactory(), FactoryPriority.Subcommand)
  registry.registerWithPriority(new PluginsCommandFactory(), FactoryPriority.Subcommand)
  registry.registerWithPriority(new ConfigCommandFactory(), FactoryPriority.Subcommand)

  registry.registerWithPriority(new ExecuteCommandFactory(), FactoryPriority.Subcommand) // Lowest priority: default/catch-all command

  return registry
}
