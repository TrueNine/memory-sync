import type {MdxGlobalScope} from '@truenine/md-compiler/globals'
import type {CollectedInputContext, ILogger, InputPlugin, InputPluginContext, OutputCleanContext, OutputPlugin, OutputWriteContext, PluginOptions, UserConfigFile} from '@truenine/plugin-shared'
import type {Command, CommandContext} from '@/commands'
import type {PipelineConfig} from '@/config'
import type {ParsedCliArgs} from '@/pipeline'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {GlobalScopeCollector, ScopePriority, ScopeRegistry} from '@truenine/plugin-input-shared'
import {createLogger, setGlobalLogLevel} from '@truenine/plugin-shared'
import glob from 'fast-glob'
import {
  buildDependencyGraph,
  extractUserArgs,
  mergeContexts,
  parseArgs,

  resolveCommand,
  resolveLogLevel,
  topologicalSort,
  validateDependencies
} from '@/pipeline'
import {startupVersionCheck} from '@/versionCheck'

export type {
  LogLevel,
  ParsedCliArgs,
  Subcommand
} from '@/pipeline' // Re-export types for backwards compatibility

export { // Re-export functions for backwards compatibility
  buildDependencyGraph,
  extractUserArgs,
  parseArgs,
  resolveCommand,
  resolveLogLevel,
  topologicalSort,
  validateDependencies
} from '@/pipeline'

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

    const resolvedLogLevel = resolveLogLevel(this.args) // Resolve log level from parsed args and set globally
    if (resolvedLogLevel != null) setGlobalLogLevel(resolvedLogLevel)
    this.logger = createLogger('PluginPipeline', resolvedLogLevel)
    this.logger.debug('initialized', {args: this.args})
  }

  registerOutputPlugins(plugins: OutputPlugin[]): this {
    this.outputPlugins.push(...plugins)
    return this
  }

  async run(config: PipelineConfig): Promise<void> {
    void startupVersionCheck(this.logger) // Don't await - let it run in background without blocking process exit // Startup version check (runs on even minutes, non-blocking)

    const {context, outputPlugins, userConfigOptions} = config
    this.registerOutputPlugins([...outputPlugins])

    let command: Command = this.resolveCommand()

    if (this.args.jsonFlag) {
      setGlobalLogLevel('silent') // Suppress all console logging in JSON mode

      const selfJsonCommands = new Set(['config-show', 'plugins']) // only need log suppression, not JsonOutputCommand wrapping // Commands that handle their own JSON output (config --show, plugins)
      if (!selfJsonCommands.has(command.name)) command = new (await import('@/commands')).JsonOutputCommand(command)
    }

    const commandCtx = this.createCommandContext(context, userConfigOptions)
    await command.execute(commandCtx)
  }

  private resolveCommand(): Command {
    return resolveCommand(this.args)
  }

  private createCommandContext(ctx: CollectedInputContext, userConfigOptions: Required<PluginOptions>): CommandContext {
    return {
      logger: this.logger,
      outputPlugins: this.outputPlugins,
      collectedInputContext: ctx,
      userConfigOptions,
      createCleanContext: (dryRun: boolean) => this.createCleanContext(ctx, dryRun),
      createWriteContext: (dryRun: boolean) => this.createWriteContext(ctx, dryRun)
    }
  }

  private createCleanContext(ctx: CollectedInputContext, dryRun: boolean): OutputCleanContext {
    return {
      logger: this.logger,
      fs,
      path,
      glob,
      collectedInputContext: ctx,
      dryRun
    }
  }

  private createWriteContext(ctx: CollectedInputContext, dryRun: boolean): OutputWriteContext {
    return {
      logger: this.logger,
      fs,
      path,
      glob,
      collectedInputContext: ctx,
      dryRun,
      registeredPluginNames: this.outputPlugins.map(p => p.name)
    }
  }

  topologicalSort<T extends {name: string, dependsOn?: readonly string[]}>(plugins: readonly T[]): T[] {
    return topologicalSort(plugins as unknown as Parameters<typeof topologicalSort>[0]) as unknown as T[] // Delegate to the modular implementation
  }

  buildDependencyGraph<T extends {name: string, dependsOn?: readonly string[]}>(plugins: readonly T[]): Map<string, Set<string>> {
    return buildDependencyGraph(plugins as unknown as Parameters<typeof buildDependencyGraph>[0]) as unknown as Map<string, Set<string>> // Delegate to the modular implementation
  }

  validateDependencies<T extends {name: string, dependsOn?: readonly string[]}>(plugins: readonly T[]): void {
    validateDependencies(plugins as unknown as Parameters<typeof validateDependencies>[0]) // Delegate to the modular implementation
  }

  async executePluginsInOrder(
    plugins: readonly InputPlugin[],
    baseCtx: Omit<InputPluginContext, 'dependencyContext' | 'globalScope' | 'scopeRegistry'>,
    dryRun: boolean = false,
    userConfig?: UserConfigFile
  ): Promise<Partial<CollectedInputContext>> {
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

    const outputsByPlugin = new Map<string, Partial<CollectedInputContext>>() // Track outputs by plugin name for dependency resolution

    let accumulatedContext: Partial<CollectedInputContext> = {} // Accumulated context from all executed plugins

    for (const plugin of sortedPlugins) {
      const dependencyContext = this.buildDependencyContext(plugin, outputsByPlugin) // Build dependency context from direct dependencies only

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

  private buildDependencyContext(
    plugin: InputPlugin,
    outputsByPlugin: Map<string, Partial<CollectedInputContext>>
  ): Partial<CollectedInputContext> {
    const deps = plugin.dependsOn ?? []
    if (deps.length === 0) return {}

    const allDeps = this.collectTransitiveDependencies(plugin, outputsByPlugin) // Collect all transitive dependencies

    let merged: Partial<CollectedInputContext> = {} // Merge all dependency outputs
    for (const depName of allDeps) {
      const depOutput = outputsByPlugin.get(depName)
      if (depOutput != null) merged = mergeContexts(merged, depOutput)
    }

    return merged
  }

  private collectTransitiveDependencies(
    plugin: InputPlugin,
    outputsByPlugin: Map<string, Partial<CollectedInputContext>>
  ): string[] {
    const visited = new Set<string>()
    const result: string[] = []

    const visit = (deps: readonly string[]): void => {
      for (const dep of deps) {
        if (visited.has(dep)) continue
        visited.add(dep)

        const depOutput = outputsByPlugin.get(dep)
        if (depOutput != null) result.push(dep)
      }
    }

    visit(plugin.dependsOn ?? [])
    return result
  }
}
