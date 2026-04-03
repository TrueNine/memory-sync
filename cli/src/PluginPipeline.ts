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
import type {
  Command,
  CommandContext,
  CommandResult
} from '@/commands/Command'
import type {ParsedCliArgs} from '@/pipeline/CliArgumentParser'
import {
  createLogger,
  discoverOutputRuntimeTargets,
  setGlobalLogLevel
} from '@truenine/memory-sync-sdk'
import {
  extractUserArgs,
  parseArgs,
  resolveCommand
} from '@/pipeline/CliArgumentParser'

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
    const {context, outputPlugins, userConfigOptions, executionPlan} = config
    this.registerOutputPlugins([...outputPlugins])
    const command: Command = resolveCommand(this.args)
    return command.execute(
      this.createCommandContext(context, userConfigOptions, executionPlan)
    )
  }

  private createCommandContext(
    ctx: OutputCollectedContext,
    userConfigOptions: Required<PluginOptions>,
    executionPlan: PipelineConfig['executionPlan']
  ): CommandContext {
    return {
      logger: this.logger,
      outputPlugins: this.outputPlugins,
      collectedOutputContext: ctx,
      userConfigOptions,
      executionPlan,
      createCleanContext: dryRun =>
        this.createCleanContext(ctx, userConfigOptions, executionPlan, dryRun),
      createWriteContext: dryRun =>
        this.createWriteContext(ctx, userConfigOptions, executionPlan, dryRun)
    }
  }

  private createCleanContext(
    ctx: OutputCollectedContext,
    userConfigOptions: Required<PluginOptions>,
    executionPlan: PipelineConfig['executionPlan'],
    dryRun: boolean
  ): OutputCleanContext {
    return {
      logger: this.logger,
      collectedOutputContext: ctx,
      pluginOptions: userConfigOptions,
      runtimeTargets: this.getRuntimeTargets(),
      executionPlan,
      dryRun
    }
  }

  private createWriteContext(
    ctx: OutputCollectedContext,
    userConfigOptions: Required<PluginOptions>,
    executionPlan: PipelineConfig['executionPlan'],
    dryRun: boolean
  ): OutputWriteContext {
    return {
      logger: this.logger,
      collectedOutputContext: ctx,
      pluginOptions: userConfigOptions,
      runtimeTargets: this.getRuntimeTargets(),
      executionPlan,
      dryRun,
      registeredPluginNames: this.outputPlugins.map(plugin => plugin.name)
    }
  }

  private getRuntimeTargets(): OutputRuntimeTargets {
    this.runtimeTargets ??= discoverOutputRuntimeTargets(this.logger)
    return this.runtimeTargets
  }
}
