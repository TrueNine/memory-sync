import type {Command, CommandContext, CommandResult, ConfigSource, JsonConfigInfo} from './Command'
import process from 'node:process'
import {ConfigLoader} from '@truenine/memory-sync-sdk'

export class ConfigShowCommand implements Command {
  readonly name = 'config-show'

  async execute(ctx: CommandContext): Promise<CommandResult> {
    const {logger} = ctx
    const loader = new ConfigLoader()
    const mergedResult = loader.load()
    const sources: ConfigSource[] = mergedResult.sources.map(sourcePath => {
      const loaded = loader.loadFromFile(sourcePath)
      return {path: sourcePath, layer: 'global', config: loaded.config}
    })
    const configInfo: JsonConfigInfo = {merged: mergedResult.config, sources}
    process.stdout.write(`${JSON.stringify(configInfo)}\n`)
    logger.info('config shown', {sources: mergedResult.sources.length})
    return {success: true, filesAffected: 0, dirsAffected: 0, message: `Configuration displayed (${sources.length} source(s))`}
  }
}
