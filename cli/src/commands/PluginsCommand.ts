import type {Command, CommandContext, CommandResult, JsonPluginInfo} from './Command'
import process from 'node:process'

export class PluginsCommand implements Command {
  readonly name = 'plugins'

  async execute(ctx: CommandContext): Promise<CommandResult> {
    const {outputPlugins} = ctx
    const pluginInfos: JsonPluginInfo[] = []

    for (const plugin of outputPlugins) {
      pluginInfos.push({
        name: plugin.name,
        kind: 'Output',
        description: plugin.name,
        dependencies: [...plugin.dependsOn ?? []]
      })
    }

    if (process.argv.includes('--bridge-json')) {
      process.stdout.write(`${JSON.stringify(pluginInfos)}\n`)
    } else {
      const lines = ['# Registered plugins', '']
      if (pluginInfos.length === 0) {
        lines.push('- No plugins are currently registered.')
      } else {
        for (const plugin of pluginInfos) {
          const dependencySuffix = plugin.dependencies.length > 0
            ? ` (depends on: ${plugin.dependencies.join(', ')})`
            : ''
          lines.push(`- ${plugin.name}${dependencySuffix}`)
        }
      }
      process.stdout.write(`${lines.join('\n')}\n`)
    }

    return {success: true, filesAffected: 0, dirsAffected: 0, message: `Listed ${pluginInfos.length} plugin(s)`}
  }
}
