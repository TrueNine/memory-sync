import type {Command, CommandContext, CommandResult, JsonPluginInfo} from './Command'
import process from 'node:process'

export class PluginsCommand implements Command {
  readonly name = 'plugins'

  async execute(ctx: CommandContext): Promise<CommandResult> {
    const {logger, outputPlugins} = ctx
    const pluginInfos: JsonPluginInfo[] = []

    for (const plugin of outputPlugins) {
      pluginInfos.push({
        name: plugin.name,
        kind: 'Output',
        description: plugin.name,
        dependencies: [...plugin.dependsOn ?? []]
      })
    }

    process.stdout.write(`${JSON.stringify(pluginInfos)}\n`)
    logger.info('plugins listed', {count: pluginInfos.length})
    return {success: true, filesAffected: 0, dirsAffected: 0, message: `Listed ${pluginInfos.length} plugin(s)`}
  }
}
