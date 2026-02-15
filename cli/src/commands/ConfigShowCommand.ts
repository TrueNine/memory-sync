import type {Command, CommandContext, CommandResult, ConfigSource, JsonConfigInfo} from './Command'
import process from 'node:process'
import {ConfigLoader} from '@/ConfigLoader'

/**
 * Command that outputs the current merged configuration and its source layers as JSON.
 *
 * Invoked via `tnmsc config --show --json`.
 * Writes a `JsonConfigInfo` object to stdout containing:
 * - `merged`: the final merged UserConfigFile
 * - `sources`: an array of ConfigSource entries describing each layer
 *
 * When used without `--json`, logs the config info via the logger.
 */
export class ConfigShowCommand implements Command {
  readonly name = 'config-show'

  async execute(ctx: CommandContext): Promise<CommandResult> {
    const {logger} = ctx
    const loader = new ConfigLoader()
    const mergedResult = loader.load()

    const sources: ConfigSource[] = mergedResult.sources.map(sourcePath => {
      const loaded = loader.loadFromFile(sourcePath)
      const layer = this.inferLayer(sourcePath)
      return {
        path: sourcePath,
        layer,
        config: loaded.config
      }
    })

    const configInfo: JsonConfigInfo = {
      merged: mergedResult.config,
      sources
    }

    process.stdout.write(`${JSON.stringify(configInfo)}\n`)

    logger.info('config shown', {sources: mergedResult.sources.length})

    return {
      success: true,
      filesAffected: 0,
      dirsAffected: 0,
      message: `Configuration displayed (${sources.length} source(s))`
    }
  }

  private inferLayer(sourcePath: string): ConfigSource['layer'] {
    const cwd = process.cwd()
    if (sourcePath.startsWith(cwd)) return 'cwd'
    return 'global'
  }
}
