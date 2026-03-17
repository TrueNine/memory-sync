import type {ILogger, OutputCleanContext, OutputCollectedContext, OutputPlugin, OutputRuntimeTargets, OutputWriteContext, PluginOptions} from './plugins/plugin-core'
import type {Command, CommandContext, CommandResult} from '@/commands/Command'
import type {PipelineConfig} from '@/config'
import type {ParsedCliArgs} from '@/pipeline/CliArgumentParser'
import {JsonOutputCommand} from '@/commands/JsonOutputCommand'
import {extractUserArgs, parseArgs, resolveCommand} from '@/pipeline/CliArgumentParser'
import {discoverOutputRuntimeTargets} from '@/pipeline/OutputRuntimeTargets'
import {createLogger, setGlobalLogLevel} from './plugins/plugin-core'

/**
 * Plugin Pipeline - Orchestrates plugin execution
 *
 * This class has been refactored to use modular components:
 * - CliArgumentParser: CLI argument parsing (moved to @/pipeline)
 * - DependencyResolver: dependency ordering (moved to @/pipeline)
 * - ContextMerger: Context merging (moved to @/pipeline)
 */
export class PluginPipeline {
  private readonly logger: ILogger
  readonly args: ParsedCliArgs
  private outputPlugins: OutputPlugin[] = []
  private runtimeTargets?: OutputRuntimeTargets

  constructor(...cmdArgs: (string | undefined)[]) {
    const filtered = cmdArgs.filter((arg): arg is string => arg != null)
    const userArgs = extractUserArgs(filtered)
    this.args = parseArgs(userArgs)

    const resolvedLogLevel = this.args.logLevel // Resolve log level from parsed args and set globally
    if (resolvedLogLevel != null) setGlobalLogLevel(resolvedLogLevel)
    this.logger = createLogger('PluginPipeline', resolvedLogLevel)
    this.logger.debug('initialized', {args: this.args})
  }

  registerOutputPlugins(plugins: OutputPlugin[]): this {
    this.outputPlugins.push(...plugins)
    return this
  }

  async run(config: PipelineConfig): Promise<CommandResult> {
    const {context, outputPlugins, userConfigOptions} = config
    this.registerOutputPlugins([...outputPlugins])

    let command: Command = resolveCommand(this.args)

    if (this.args.jsonFlag) {
      setGlobalLogLevel('silent') // Suppress all console logging in JSON mode

      const selfJsonCommands = new Set(['config-show', 'plugins']) // only need log suppression, not JsonOutputCommand wrapping // Commands that handle their own JSON output (config --show, plugins)
      if (!selfJsonCommands.has(command.name)) command = new JsonOutputCommand(command)
    }

    const commandCtx = this.createCommandContext(context, userConfigOptions)
    return command.execute(commandCtx)
  }

  private createCommandContext(ctx: OutputCollectedContext, userConfigOptions: Required<PluginOptions>): CommandContext {
    return {
      logger: this.logger,
      outputPlugins: this.outputPlugins,
      collectedOutputContext: ctx,
      userConfigOptions,
      createCleanContext: (dryRun: boolean) => this.createCleanContext(ctx, userConfigOptions, dryRun),
      createWriteContext: (dryRun: boolean) => this.createWriteContext(ctx, userConfigOptions, dryRun)
    }
  }

  private createCleanContext(
    ctx: OutputCollectedContext,
    userConfigOptions: Required<PluginOptions>,
    dryRun: boolean
  ): OutputCleanContext {
    return {
      logger: this.logger,
      collectedOutputContext: ctx,
      pluginOptions: userConfigOptions,
      runtimeTargets: this.getRuntimeTargets(),
      dryRun
    }
  }

  private createWriteContext(
    ctx: OutputCollectedContext,
    userConfigOptions: Required<PluginOptions>,
    dryRun: boolean
  ): OutputWriteContext {
    return {
      logger: this.logger,
      collectedOutputContext: ctx,
      pluginOptions: userConfigOptions,
      runtimeTargets: this.getRuntimeTargets(),
      dryRun,
      registeredPluginNames: this.outputPlugins.map(p => p.name)
    }
  }

  private getRuntimeTargets(): OutputRuntimeTargets {
    this.runtimeTargets ??= discoverOutputRuntimeTargets(this.logger)
    return this.runtimeTargets
  }
}
