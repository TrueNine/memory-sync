import type {Command, CommandContext, CommandResult, JsonPluginInfo} from './Command'
import process from 'node:process'
import {PluginKind} from '../plugins/plugin-core'

/**
 * Command that outputs all registered plugin information as JSON.
 *
 * Invoked via `tnmsc plugins --json`.
 * Writes a `JsonPluginInfo[]` array to stdout containing each plugin's
 * name, kind (Input/Output), description, and dependency list.
 *
 * When used without `--json`, logs the plugin list via the logger.
 */
export class PluginsCommand implements Command {
  readonly name = 'plugins'

  async execute(ctx: CommandContext): Promise<CommandResult> {
    const {logger, outputPlugins, userConfigOptions} = ctx

    const allPlugins = userConfigOptions.plugins
    const pluginInfos: JsonPluginInfo[] = []

    for (const plugin of allPlugins) {
      pluginInfos.push({
        name: plugin.name,
        kind: plugin.type === PluginKind.Input ? 'Input' : 'Output',
        description: plugin.name,
        dependencies: [...plugin.dependsOn ?? []]
      })
    }

    const registeredNames = new Set(pluginInfos.map(p => p.name)) // (they are registered separately via registerOutputPlugins) // Also include output plugins that may not be in userConfigOptions.plugins
    for (const plugin of outputPlugins) {
      if (!registeredNames.has(plugin.name)) {
        pluginInfos.push({
          name: plugin.name,
          kind: 'Output',
          description: plugin.name,
          dependencies: [...plugin.dependsOn ?? []]
        })
      }
    }

    process.stdout.write(`${JSON.stringify(pluginInfos)}\n`)

    logger.info('plugins listed', {count: pluginInfos.length})

    return {
      success: true,
      filesAffected: 0,
      dirsAffected: 0,
      message: `Listed ${pluginInfos.length} plugin(s)`
    }
  }
}
