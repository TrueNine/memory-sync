import type {MdxGlobalScope} from '@truenine/md-compiler/globals'
import type {ILogger, InputCollectedContext, InputPlugin, InputPluginContext, OutputCleanContext, OutputCollectedContext, OutputPlugin, OutputWriteContext, PluginOptions, UserConfigFile} from './plugins/plugin-core'
import type {Command, CommandContext} from '@/commands/Command'
import type {PipelineConfig} from '@/config'
import type {ParsedCliArgs} from '@/pipeline/CliArgumentParser'
import * as fs from 'node:fs'
import * as path from 'node:path'
import glob from 'fast-glob'
import {JsonOutputCommand} from '@/commands/JsonOutputCommand'
import {extractUserArgs, parseArgs, resolveCommand} from '@/pipeline/CliArgumentParser'
import {buildDependencyContext, mergeContexts} from '@/pipeline/ContextMerger'
import {topologicalSort} from '@/pipeline/PluginDependencyResolver'
import {createLogger, GlobalScopeCollector, ScopePriority, ScopeRegistry, setGlobalLogLevel} from './plugins/plugin-core'

/**
 * Plugin Pipeline - Orchestrates plugin execution
 *
 * This class has been refactored to use modular components:
 * - CliArgumentParser: CLI argument parsing (moved to @/pipeline)
 * - PluginDependencyResolver: Dependency resolution (moved to @/pipeline)
 * - ContextMerger: Context merging (moved to @/pipeline)
 */
export class PluginPipeline {
  private readonly logger: ILogger
  readonly args: ParsedCliArgs
  private outputPlugins: OutputPlugin[] = []

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

  async run(config: PipelineConfig): Promise<void> {
    const {context, outputPlugins, userConfigOptions} = config
    this.registerOutputPlugins([...outputPlugins])

    let command: Command = resolveCommand(this.args)

    if (this.args.jsonFlag) {
      setGlobalLogLevel('silent') // Suppress all console logging in JSON mode

      const selfJsonCommands = new Set(['config-show', 'plugins']) // only need log suppression, not JsonOutputCommand wrapping // Commands that handle their own JSON output (config --show, plugins)
      if (!selfJsonCommands.has(command.name)) command = new JsonOutputCommand(command)
    }

    const commandCtx = this.createCommandContext(context, userConfigOptions)
    await command.execute(commandCtx)
  }

  private createCommandContext(ctx: OutputCollectedContext, userConfigOptions: Required<PluginOptions>): CommandContext {
    return {
      logger: this.logger,
      outputPlugins: this.outputPlugins,
      collectedOutputContext: ctx,
      userConfigOptions,
      createCleanContext: (dryRun: boolean) => this.createCleanContext(ctx, dryRun),
      createWriteContext: (dryRun: boolean) => this.createWriteContext(ctx, dryRun)
    }
  }

  private createCleanContext(ctx: OutputCollectedContext, dryRun: boolean): OutputCleanContext {
    return {
      logger: this.logger,
      fs,
      path,
      glob,
      collectedOutputContext: ctx,
      dryRun
    }
  }

  private createWriteContext(ctx: OutputCollectedContext, dryRun: boolean): OutputWriteContext {
    return {
      logger: this.logger,
      fs,
      path,
      glob,
      collectedOutputContext: ctx,
      dryRun,
      registeredPluginNames: this.outputPlugins.map(p => p.name)
    }
  }

  async executePluginsInOrder(
    plugins: readonly InputPlugin[],
    baseCtx: Omit<InputPluginContext, 'dependencyContext' | 'globalScope' | 'scopeRegistry'>,
    dryRun: boolean = false,
    userConfig?: UserConfigFile
  ): Promise<Partial<InputCollectedContext>> {
    if (plugins.length === 0) return {}

    const sortedPlugins = topologicalSort(plugins) as InputPlugin[] // Sort plugins by dependencies

    const globalScopeCollector = new GlobalScopeCollector({userConfig}) // Create GlobalScopeCollector and ScopeRegistry for MDX expression evaluation
    const globalScope: MdxGlobalScope = globalScopeCollector.collect()
    const scopeRegistry = new ScopeRegistry()
    scopeRegistry.setGlobalScope(globalScope)

    this.logger.debug('global scope collected', {
      osInfo: {platform: globalScope.os.platform, arch: globalScope.os.arch, shellKind: globalScope.os.shellKind},
      hasProfile: Object.keys(globalScope.profile).length > 0,
      hasTool: Object.keys(globalScope.tool).length > 0
    })

    const outputsByPlugin = new Map<string, Partial<InputCollectedContext>>() // Track outputs by plugin name for dependency resolution

    let accumulatedContext: Partial<InputCollectedContext> = {} // Accumulated context from all executed plugins

    for (const plugin of sortedPlugins) {
      const dependencyContext = buildDependencyContext(plugin, outputsByPlugin, mergeContexts) // Build dependency context from direct dependencies only

      const ctx: InputPluginContext = { // Create context with dependency outputs, globalScope, and scopeRegistry
        ...baseCtx,
        dependencyContext,
        globalScope,
        scopeRegistry
      }

      const inputPlugin = plugin as InputPlugin & {executeEffects?: (ctx: InputPluginContext, dryRun: boolean) => Promise<unknown>} // AbstractInputPlugin provides executeEffects method for effect-based plugins // Execute effects before collect() if plugin has any
      if (inputPlugin.executeEffects != null) await inputPlugin.executeEffects(ctx, dryRun)

      const output = await plugin.collect(ctx) // Execute plugin

      outputsByPlugin.set(plugin.name, output) // Store output for this plugin

      accumulatedContext = mergeContexts(accumulatedContext, output) // Merge into accumulated context

      const inputPluginWithScopes = plugin as InputPlugin & {getRegisteredScopes?: () => readonly {namespace: string, values: Record<string, unknown>}[]} // Collect registered scopes from plugin and register them to ScopeRegistry
      if (inputPluginWithScopes.getRegisteredScopes != null) {
        const registeredScopes = inputPluginWithScopes.getRegisteredScopes()
        for (const {namespace, values} of registeredScopes) {
          scopeRegistry.register(namespace, values, ScopePriority.PluginRegistered)
          this.logger.debug('plugin scope registered', {plugin: plugin.name, namespace, keys: Object.keys(values)})
        }
      }
    }

    return accumulatedContext
  }
}
