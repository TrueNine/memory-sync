import type {
  ILogger,
  OutputCleanContext,
  OutputCollectedContext,
  OutputPlugin,
  OutputRuntimeTargets,
  OutputWriteContext,
  PipelineConfig,
  PluginOptions
} from '@truenine/memory-sync-sdk'
import type {Command, CommandContext, CommandResult} from '@/commands/Command'
import type {ParsedCliArgs} from '@/pipeline/CliArgumentParser'
import {createLogger, discoverOutputRuntimeTargets, setGlobalLogLevel} from '@truenine/memory-sync-sdk'
import {JsonOutputCommand} from '@/commands/JsonOutputCommand'
import {extractUserArgs, parseArgs, resolveCommand} from '@/pipeline/CliArgumentParser'

export class PluginPipeline {
  private readonly logger: ILogger
  readonly args: ParsedCliArgs
  private outputPlugins: OutputPlugin[] = []
  private runtimeTargets?: OutputRuntimeTargets

  constructor(...cmdArgs: (string | undefined)[]) {
    const filtered = cmdArgs.filter((arg): arg is string => arg != null)
    this.args = parseArgs(extractUserArgs(filtered))
    if (this.args.logLevel != null) setGlobalLogLevel(this.args.logLevel)
    this.logger = createLogger('PluginPipeline', this.args.logLevel)
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

    if (!this.args.jsonFlag) return command.execute(this.createCommandContext(context, userConfigOptions))

    setGlobalLogLevel('silent')
    if (!new Set(['config-show', 'plugins']).has(command.name)) command = new JsonOutputCommand(command)
    return command.execute(this.createCommandContext(context, userConfigOptions))
  }

  private createCommandContext(ctx: OutputCollectedContext, userConfigOptions: Required<PluginOptions>): CommandContext {
    return {
      logger: this.logger,
      outputPlugins: this.outputPlugins,
      collectedOutputContext: ctx,
      userConfigOptions,
      createCleanContext: dryRun => this.createCleanContext(ctx, userConfigOptions, dryRun),
      createWriteContext: dryRun => this.createWriteContext(ctx, userConfigOptions, dryRun)
    }
  }

  private createCleanContext(ctx: OutputCollectedContext, userConfigOptions: Required<PluginOptions>, dryRun: boolean): OutputCleanContext {
    return {
      logger: this.logger,
      collectedOutputContext: ctx,
      pluginOptions: userConfigOptions,
      runtimeTargets: this.getRuntimeTargets(),
      dryRun
    }
  }

  private createWriteContext(ctx: OutputCollectedContext, userConfigOptions: Required<PluginOptions>, dryRun: boolean): OutputWriteContext {
    return {
      logger: this.logger,
      collectedOutputContext: ctx,
      pluginOptions: userConfigOptions,
      runtimeTargets: this.getRuntimeTargets(),
      dryRun,
      registeredPluginNames: this.outputPlugins.map(plugin => plugin.name)
    }
  }

  private getRuntimeTargets(): OutputRuntimeTargets {
    this.runtimeTargets ??= discoverOutputRuntimeTargets(this.logger)
    return this.runtimeTargets
  }
}
