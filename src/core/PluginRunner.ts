/**
 * Plugin runner implementation
 * Orchestrates plugin lifecycle execution with InputPlugin and OutputPlugin support
 *
 * @see Requirements 22.5, 36.1, 36.2, 9.1, 9.2, 9.3, 28.1
 */

import type {
  BootstrapOptions,
  BootstrapResult,
  BuildEndParams,
  BuildStartParams,
  CleanResult,
  CleanupParams,
  ExtendedRunResult,
  GenerateBundleParams,
  InputBundle,
  InputPlugin,
  OutputPlugin,
  Plugin,
  PluginConfig,
  PluginContext,
  PluginState,
  RunResult,
  TransformationRecord,
  TransformChainSummary,
  TransformError,
  TransformParams,
  TransformResult,
  WriteBundleParams,
} from './types'
import process from 'node:process'
import { createMergedOptions } from './bootstrapUtils'
import { CleanupCollector } from './CleanupCollector'
import { createPluginContext, createPluginContextWithDeps } from './PluginContext'
import { PluginError, ValidationError } from './types'
import { validateOutputPlugin, validatePlugin } from './validation'

/**
 * Default priority for plugins without explicit priority
 */
const DEFAULT_PRIORITY = 100

/**
 * Error thrown when circular dependency is detected
 */
export class CircularDependencyError extends Error {
  public pluginName: string
  public dependencyChain: string[]

  constructor(pluginName: string, dependencyChain: string[]) {
    super(`Circular dependency detected: ${dependencyChain.join(' -> ')} -> ${pluginName}`)
    this.name = 'CircularDependencyError'
    this.pluginName = pluginName
    this.dependencyChain = dependencyChain
  }
}

/**
 * Error thrown when circular inheritance is detected
 */
export class CircularInheritanceError extends Error {
  public pluginName: string
  public inheritanceChain: string[]

  constructor(pluginName: string, inheritanceChain: string[]) {
    super(`Circular inheritance detected: ${inheritanceChain.join(' -> ')} -> ${pluginName}`)
    this.name = 'CircularInheritanceError'
    this.pluginName = pluginName
    this.inheritanceChain = inheritanceChain
  }
}

/**
 * Options for PluginRunner initialization
 */
export interface PluginRunnerOptions {
  /**
   * Plugin configuration
   */
  config: PluginConfig
  /**
   * Enable dry-run mode (simulate operations without writing)
   * @see Requirement 21.1
   */
  dryRun?: boolean
  /**
   * Enable clean-only mode (skip content generation)
   * @see Requirement 24.4
   */
  cleanOnly?: boolean
}

/**
 * Plugin runner that orchestrates lifecycle execution
 * Supports both InputPlugins and OutputPlugins with inheritance
 *
 * @see Requirements 22.5, 36.1, 36.2
 */
export class PluginRunner {
  private inputPlugins: InputPlugin[] = []
  private outputPlugins: OutputPlugin[] = []
  private plugins: Plugin[] = []
  private pluginStates: Map<string, PluginState> = new Map()
  private context: PluginContext
  private config: PluginConfig
  private collectedInputBundles: InputBundle[] = []
  private resolvedOutputPlugins: Map<string, OutputPlugin> = new Map()

  /**
   * Create a new PluginRunner instance
   * @param configOrOptions - Plugin configuration or options object
   * @see Requirement 22.5
   */
  constructor(configOrOptions: PluginConfig | PluginRunnerOptions) {
    // Support both legacy PluginConfig and new PluginRunnerOptions
    if ('config' in configOrOptions) {
      const options = configOrOptions
      this.config = options.config
      this.context = createPluginContext({
        config: options.config,
        dryRun: options.dryRun ?? false,
        cleanOnly: options.cleanOnly ?? false,
      })
    } else {
      this.config = configOrOptions
      this.context = createPluginContext({ config: configOrOptions })
    }
  }

  /**
   * Bootstrap the plugin system with provided options
   * This is the main entry point for running the plugin system, similar to Spring Boot's run()
   *
   * The bootstrap process:
   * 1. Loads configuration (provided or default)
   * 2. Merges options with precedence: CLI flags > BootstrapOptions.options > PluginConfig.options > defaults
   * 3. Registers all plugins from configuration
   * 4. Executes appropriate lifecycle based on options (clean, dry-run, or normal)
   * 5. Returns comprehensive result with statistics
   *
   * @param options - Bootstrap options containing config, flags, and overrides
   * @returns Promise resolving to BootstrapResult with execution statistics
   *
   * @example
   * ```typescript
   * // Simple usage with defaults
   * const result = await PluginRunner.bootstrap()
   *
   * // With dry-run mode
   * const result = await PluginRunner.bootstrap({ dryRun: true })
   *
   * // With custom config
   * const result = await PluginRunner.bootstrap({
   *   config: myPluginConfig,
   *   options: { logLevel: 'debug' },
   * })
   * ```
   *
   * @see Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 5.1, 5.2
   */
  static async bootstrap(options: BootstrapOptions = {}): Promise<BootstrapResult> {
    const startTime = Date.now()

    // Step 1: Load configuration (Requirement 3.1, 5.1, 5.2)
    let config: PluginConfig
    let inputPlugins: InputPlugin[] = []
    let outputPlugins: OutputPlugin[] = []

    if (options.config != null) {
      // Use provided config
      config = options.config
    } else {
      // Load default config from plugins.config.ts
      // Dynamic import to avoid circular dependency
      const defaultConfig = await import('../plugins.config')
      config = defaultConfig.default
      inputPlugins = defaultConfig.inputPlugins ?? []
      outputPlugins = defaultConfig.outputPlugins ?? []
    }

    // Step 2: Merge options with precedence (Requirement 5.3, 5.4)
    const mergedOptions = createMergedOptions(options, config)

    // Update config with merged options
    const finalConfig: PluginConfig = {
      ...config,
      options: mergedOptions,
    }

    // Step 3: Create runner with merged configuration
    const runner = new PluginRunner({
      config: finalConfig,
      dryRun: mergedOptions.dryRun ?? false,
      cleanOnly: mergedOptions.cleanOnly ?? false,
    })

    // Step 4: Register all plugins (Requirement 3.2)
    // Register InputPlugins
    for (const plugin of inputPlugins) {
      try {
        runner.registerInput(plugin)
      } catch (error) {
        // Continue registering other plugins, error will be captured
        const message = error instanceof Error ? error.message : String(error)
        runner.context.log.error(`Failed to register InputPlugin "${plugin.name}": ${message}`)
      }
    }

    // Register OutputPlugins
    for (const plugin of outputPlugins) {
      try {
        runner.registerOutput(plugin)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        runner.context.log.error(`Failed to register OutputPlugin "${plugin.name}": ${message}`)
      }
    }

    // Register legacy plugins from config.plugins
    for (const pluginOrFactory of config.plugins) {
      try {
        const plugin = typeof pluginOrFactory === 'function' ? pluginOrFactory() : pluginOrFactory
        runner.register(plugin)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        runner.context.log.error(`Failed to register plugin: ${message}`)
      }
    }

    // Step 5: Execute appropriate lifecycle (Requirement 3.3)
    let result: BootstrapResult
    const hasLegacyPlugins = runner.getPlugins().length > 0
    const hasInputOutputPlugins = runner.getInputPlugins().length > 0 || runner.getOutputPlugins().length > 0

    if (mergedOptions.cleanOnly === true) {
      // Execute clean-only mode
      const cleanResult = await runner.runClean()
      result = {
        success: cleanResult.success,
        duration: Date.now() - startTime,
        pluginsExecuted: runner.getOutputPlugins().length,
        inputPluginsExecuted: 0,
        outputPluginsExecuted: runner.getOutputPlugins().length,
        inputBundlesCollected: 0,
        filesEmitted: 0,
        errors: cleanResult.errors,
        emptyPlugins: [],
        cleanResult,
      }
    } else if (hasInputOutputPlugins) {
      // Execute full lifecycle with InputPlugins and OutputPlugins
      const runResult = await runner.runFull()

      // Also run legacy plugins if present
      let legacyResult: RunResult | null = null
      if (hasLegacyPlugins) {
        legacyResult = await runner.run()
      }

      // Combine results
      const combinedErrors = [...runResult.errors]
      if (legacyResult != null) {
        combinedErrors.push(...legacyResult.errors)
      }

      result = {
        success: runResult.success && (legacyResult?.success ?? true),
        duration: Date.now() - startTime,
        pluginsExecuted: runResult.pluginsExecuted + (legacyResult?.pluginsExecuted ?? 0),
        inputPluginsExecuted: runResult.inputPluginsExecuted,
        outputPluginsExecuted: runResult.outputPluginsExecuted + (legacyResult?.pluginsExecuted ?? 0),
        inputBundlesCollected: runResult.inputBundlesCollected,
        filesEmitted: runResult.filesEmitted + (legacyResult?.filesEmitted ?? 0),
        errors: combinedErrors,
        emptyPlugins: runResult.emptyPlugins,
      }

      // Include dry-run statistics if in dry-run mode (Requirement 6.3)
      if (mergedOptions.dryRun === true && runResult.dryRunStats != null) {
        result.dryRunStats = runResult.dryRunStats
      }
    } else if (hasLegacyPlugins) {
      // Only legacy plugins - use run()
      const runResult = await runner.run()
      result = {
        success: runResult.success,
        duration: Date.now() - startTime,
        pluginsExecuted: runResult.pluginsExecuted,
        inputPluginsExecuted: 0,
        outputPluginsExecuted: runResult.pluginsExecuted,
        inputBundlesCollected: 0,
        filesEmitted: runResult.filesEmitted,
        errors: runResult.errors,
        emptyPlugins: [],
      }

      // Include dry-run statistics if in dry-run mode (Requirement 6.3)
      if (mergedOptions.dryRun === true && runner.context.mode.dryRunTracker != null) {
        result.dryRunStats = runner.context.mode.dryRunTracker.getStats()
      }
    } else {
      // No plugins at all
      result = {
        success: true,
        duration: Date.now() - startTime,
        pluginsExecuted: 0,
        inputPluginsExecuted: 0,
        outputPluginsExecuted: 0,
        inputBundlesCollected: 0,
        filesEmitted: 0,
        errors: [],
        emptyPlugins: [],
      }

      // Include dry-run statistics if in dry-run mode (Requirement 6.3)
      if (mergedOptions.dryRun === true && runner.context.mode.dryRunTracker != null) {
        result.dryRunStats = runner.context.mode.dryRunTracker.getStats()
      }
    }

    return result
  }

  /**
   * CLI entry point - parses arguments and runs bootstrap with UI feedback
   *
   * @param args - Command line arguments (typically process.argv.slice(2))
   */
  static async main(args: string[]): Promise<void> {
    const clack = await import('@clack/prompts')
    const picocolors = await import('picocolors')
    const pc = picocolors.default
    const { shutdownLogger } = await import('../utils/log')
    const { intro, outro, spinner } = clack

    // Parse arguments
    const flags = { dryRun: false, clean: false, help: false, version: false }
    const invalidFlags: string[] = []

    for (const arg of args) {
      switch (arg) {
        case '--dry-run':
        case '-d':
          flags.dryRun = true
          break
        case '--clean':
        case '-c':
          flags.clean = true
          break
        case '--help':
        case '-h':
          flags.help = true
          break
        case '--version':
        case '-v':
          flags.version = true
          break
        default:
          if (arg.startsWith('-')) {
            invalidFlags.push(arg)
          }
          break
      }
    }

    // Handle help
    if (flags.help) {
      // eslint-disable-next-line no-console
      console.info(`
${pc.bold('aindex toolchain')} - Plugin-based AI prompt engineering toolchain

${pc.bold('Usage:')} node .scripts/dist/index.mjs [options]

${pc.bold('Options:')}
  -d, --dry-run    Simulate operations without writing to disk
  -c, --clean      Execute only cleanup-related operations
  -h, --help       Show this help message
  -v, --version    Show version number
`)
      return
    }

    // Handle version
    if (flags.version) {
      // eslint-disable-next-line no-console
      console.info('0.0.1')
      return
    }

    // Handle invalid flags
    if (invalidFlags.length > 0) {
      console.error(pc.red(`Error: Invalid flag(s): ${invalidFlags.join(', ')}`))
      process.exitCode = 1
      return
    }

    const modeStr = flags.clean
      ? (flags.dryRun ? 'Clean (dry-run)' : 'Clean')
      : (flags.dryRun ? 'Dry-run' : 'Normal')

    intro(pc.bgCyan(pc.black(` aindex toolchain - ${modeStr} mode `)))

    const s = spinner()

    try {
      s.start('Bootstrapping plugin system...')

      const result = await PluginRunner.bootstrap({
        dryRun: flags.dryRun,
        cleanOnly: flags.clean,
      })

      s.stop(result.success ? 'Bootstrap completed successfully' : 'Bootstrap completed with errors')

      // Display result
      PluginRunner.displayResult(result, flags.clean, pc)

      if (result.success) {
        outro(pc.green(flags.clean ? 'Cleanup completed successfully!' : 'All tasks completed successfully!'))
      } else {
        outro(pc.yellow('Completed with some errors'))
        process.exitCode = 1
      }
    } catch (error) {
      s.stop('Execution failed')
      console.error(pc.red(error instanceof Error ? error.message : String(error)))
      process.exitCode = 1
    } finally {
      await shutdownLogger()
    }
  }

  /**
   * Display bootstrap result to console
   */
  private static displayResult(
    result: BootstrapResult,
    isCleanMode: boolean,
    pc: typeof import('picocolors'),
  ): void {
    const formatDuration = (ms: number): string => {
      if (ms < 1000) {
        return `${ms}ms`
      }
      return `${(ms / 1000).toFixed(2)}s`
    }

    if (isCleanMode) {
      if (result.success) {
        const cleanResult = result.cleanResult
        if (cleanResult) {
          // eslint-disable-next-line no-console
          console.info(
            pc.green(`Cleanup complete: ${cleanResult.filesRemoved} file(s) removed, `
              + `${cleanResult.directoriesRemoved} director(ies) removed in ${formatDuration(result.duration)}`),
          )
        } else {
          // eslint-disable-next-line no-console
          console.info(pc.green(`Cleanup completed in ${formatDuration(result.duration)}`))
        }
      } else {
        console.warn(
          pc.yellow(`Cleanup completed with errors: ${result.errors.length} error(s) in ${formatDuration(result.duration)}`),
        )
        for (const error of result.errors) {
          console.error(pc.red(`  ${error}`))
        }
      }
    } else {
      if (result.success) {
        // eslint-disable-next-line no-console
        console.info(
          pc.green(`Completed: ${result.pluginsExecuted} plugin(s) executed, `
            + `${result.filesEmitted} file(s) emitted in ${formatDuration(result.duration)}`),
        )
      } else {
        console.warn(
          pc.yellow(`Completed with errors: ${result.pluginsExecuted} plugin(s) executed, `
            + `${result.errors.length} error(s) in ${formatDuration(result.duration)}`),
        )
        for (const error of result.errors) {
          console.error(pc.red(`  ${error}`))
        }
      }

      if (result.dryRunStats) {
        const stats = result.dryRunStats
        // eslint-disable-next-line no-console
        console.info(
          pc.cyan(`[dry-run] Summary: ${stats.filesToCreate} files to create, `
            + `${stats.filesToModify} files to modify, `
            + `${stats.filesToDelete} files to delete`),
        )
      }
    }
  }

  /**
   * Register an InputPlugin
   * InputPlugins execute before OutputPlugins to collect InputBundles
   *
   * @param plugin - InputPlugin to register
   * @throws ValidationError if plugin is invalid
   * @see Requirement 36.1
   */
  registerInput(plugin: InputPlugin): void {
    this.validateInputPlugin(plugin)

    if (this.inputPlugins.some((p) => p.name === plugin.name)) {
      throw new PluginError(
        `InputPlugin "${plugin.name}" is already registered`,
        plugin.name,
        'registerInput',
      )
    }

    this.inputPlugins.push(plugin)
    this.pluginStates.set(plugin.name, {
      name: plugin.name,
      status: 'pending',
      emittedFiles: [],
    })
  }

  /**
   * Register an OutputPlugin
   * Handles inheritance via extends property
   *
   * @param plugin - OutputPlugin to register
   * @throws ValidationError if plugin is invalid
   * @throws CircularInheritanceError if circular inheritance is detected
   * @see Requirements 22.1, 28.1
   */
  registerOutput(plugin: OutputPlugin): void {
    validateOutputPlugin(plugin)

    if (this.outputPlugins.some((p) => p.name === plugin.name)) {
      throw new PluginError(
        `OutputPlugin "${plugin.name}" is already registered`,
        plugin.name,
        'registerOutput',
      )
    }

    this.outputPlugins.push(plugin)
    this.pluginStates.set(plugin.name, {
      name: plugin.name,
      status: 'pending',
      emittedFiles: [],
    })
  }

  /**
   * Register a plugin (legacy method for backward compatibility)
   * @throws ValidationError if plugin is invalid
   */
  register(plugin: Plugin): void {
    validatePlugin(plugin)

    if (this.plugins.some((p) => p.name === plugin.name)) {
      throw new PluginError(
        `Plugin "${plugin.name}" is already registered`,
        plugin.name,
        'register',
      )
    }

    this.plugins.push(plugin)
    this.pluginStates.set(plugin.name, {
      name: plugin.name,
      status: 'pending',
      emittedFiles: [],
    })
  }

  /**
   * Get all registered plugins (legacy)
   */
  getPlugins(): Plugin[] {
    return [...this.plugins]
  }

  /**
   * Get all registered InputPlugins
   */
  getInputPlugins(): InputPlugin[] {
    return [...this.inputPlugins]
  }

  /**
   * Get all registered OutputPlugins
   */
  getOutputPlugins(): OutputPlugin[] {
    return [...this.outputPlugins]
  }

  /**
   * Get plugin state by name
   */
  getPluginState(name: string): PluginState | undefined {
    return this.pluginStates.get(name)
  }

  /**
   * Sort plugins by priority and dependencies using topological sort
   * Lower priority values execute first
   *
   * @param plugins - Array of plugins to sort
   * @returns Sorted array of plugins
   * @throws CircularDependencyError if circular dependency is detected
   * @see Requirements 9.1, 9.2, 9.3
   */
  sortPlugins<T extends { name: string, priority?: number, dependencies?: string[] }>(
    plugins: T[],
  ): T[] {
    const sorted: T[] = []
    const visited = new Set<string>()
    const visiting = new Set<string>()
    const pluginMap = new Map<string, T>()

    for (const plugin of plugins) {
      pluginMap.set(plugin.name, plugin)
    }

    const visit = (plugin: T, chain: string[] = []): void => {
      if (visited.has(plugin.name)) {
        return
      }

      if (visiting.has(plugin.name)) {
        throw new CircularDependencyError(plugin.name, chain)
      }

      visiting.add(plugin.name)
      const newChain = [...chain, plugin.name]

      const deps = plugin.dependencies
      if (deps != null && Array.isArray(deps)) {
        for (const depName of deps) {
          const dep = pluginMap.get(depName)
          if (dep != null) {
            visit(dep, newChain)
          }
        }
      }

      visiting.delete(plugin.name)
      visited.add(plugin.name)
      sorted.push(plugin)
    }

    // Sort by priority first (lower = earlier)
    const byPriority = [...plugins].sort((a, b) => {
      const priorityA = a.priority ?? DEFAULT_PRIORITY
      const priorityB = b.priority ?? DEFAULT_PRIORITY
      return priorityA - priorityB
    })

    for (const plugin of byPriority) {
      visit(plugin)
    }

    return sorted
  }

  /**
   * Resolve plugin inheritance
   * Merges parent plugin hooks and configurations into child plugin
   *
   * @param plugin - OutputPlugin to resolve
   * @returns Resolved OutputPlugin with inherited properties
   * @throws CircularInheritanceError if circular inheritance is detected
   * @see Requirements 28.1, 28.2, 28.3, 28.4, 28.5
   */
  resolveInheritance(plugin: OutputPlugin): OutputPlugin {
    // Check cache first
    const cached = this.resolvedOutputPlugins.get(plugin.name)
    if (cached != null) {
      return cached
    }

    const extendsName = plugin.extends
    if (extendsName == null) {
      this.resolvedOutputPlugins.set(plugin.name, plugin)
      return plugin
    }

    // Detect circular inheritance
    const inheritanceChain: string[] = []
    let current: OutputPlugin | null = plugin

    while (current != null) {
      const extName: string | undefined = current.extends
      if (extName == null) {
        break
      }

      if (inheritanceChain.includes(current.name)) {
        throw new CircularInheritanceError(current.name, inheritanceChain)
      }
      inheritanceChain.push(current.name)

      const parent: OutputPlugin | undefined = this.outputPlugins.find((p) => p.name === extName)
      if (parent == null) {
        // Parent not found, stop inheritance chain
        break
      }
      current = parent
    }

    // Build resolved plugin by merging from root to child
    const chain: OutputPlugin[] = [plugin]
    current = plugin

    while (current != null) {
      const extName: string | undefined = current.extends
      if (extName == null) {
        break
      }

      const parent: OutputPlugin | undefined = this.outputPlugins.find((p) => p.name === extName)
      if (parent == null) {
        break
      }
      chain.unshift(parent)
      current = parent
    }

    // Merge plugins from parent to child
    const firstPlugin = chain[0]
    if (firstPlugin == null) {
      this.resolvedOutputPlugins.set(plugin.name, plugin)
      return plugin
    }

    let resolved: OutputPlugin = { ...firstPlugin }

    for (let i = 1; i < chain.length; i++) {
      const childPlugin = chain[i]
      if (childPlugin != null) {
        resolved = this.mergePlugins(resolved, childPlugin)
      }
    }

    this.resolvedOutputPlugins.set(plugin.name, resolved)
    return resolved
  }

  /**
   * Merge parent and child plugins
   * Child properties override parent properties
   *
   * @param parent - Parent plugin
   * @param child - Child plugin
   * @returns Merged plugin
   * @see Requirements 28.2, 28.3, 28.4
   */
  private mergePlugins(parent: OutputPlugin, child: OutputPlugin): OutputPlugin {
    const merged: OutputPlugin = {
      ...parent,
      ...child,
      name: child.name,
    }

    // Merge arrays (child takes precedence for same items)
    const parentOutputs = parent.outputs
    const childOutputs = child.outputs
    if (childOutputs != null) {
      merged.outputs = childOutputs
    } else if (parentOutputs != null) {
      merged.outputs = parentOutputs
    }

    const parentInputTypes = parent.inputTypes
    const childInputTypes = child.inputTypes
    if (childInputTypes != null) {
      merged.inputTypes = childInputTypes
    } else if (parentInputTypes != null) {
      merged.inputTypes = parentInputTypes
    }

    const parentFilenameTransform = parent.filenameTransform
    const childFilenameTransform = child.filenameTransform
    if (childFilenameTransform != null) {
      merged.filenameTransform = childFilenameTransform
    } else if (parentFilenameTransform != null) {
      merged.filenameTransform = parentFilenameTransform
    }

    // Merge dependencies
    const parentDeps = parent.dependencies
    const childDeps = child.dependencies
    if (parentDeps != null || childDeps != null) {
      const parentDepsArray = parentDeps ?? []
      const childDepsArray = childDeps ?? []
      merged.dependencies = [...new Set([...parentDepsArray, ...childDepsArray])]
    }

    // Hooks: child overrides parent (Requirement 28.2, 28.3)
    // If child has hook, use child's; otherwise use parent's
    // This is already handled by spread operator above

    return merged
  }

  /**
   * Validate an InputPlugin
   * @throws ValidationError if plugin is invalid
   */
  private validateInputPlugin(plugin: unknown): asserts plugin is InputPlugin {
    if (plugin == null || typeof plugin !== 'object') {
      throw new ValidationError('InputPlugin must be a non-null object', 'plugin')
    }

    const obj = plugin as Record<string, unknown>

    if (!('name' in obj)) {
      throw new ValidationError('InputPlugin must have a name property', 'name')
    }

    if (typeof obj['name'] !== 'string') {
      throw new ValidationError('InputPlugin name must be a string', 'name')
    }

    if (obj['name'].trim().length === 0) {
      throw new ValidationError('InputPlugin name cannot be empty or whitespace only', 'name')
    }

    const priority = obj['priority']
    if (priority != null && typeof priority !== 'number') {
      throw new ValidationError('InputPlugin priority must be a number', 'priority')
    }

    if (!('scan' in obj) || typeof obj['scan'] !== 'function') {
      throw new ValidationError('InputPlugin must have a scan method', 'scan')
    }
  }

  /**
   * Run all plugins through the complete lifecycle
   * Legacy method for backward compatibility with Plugin interface
   */
  async run(): Promise<RunResult> {
    const startTime = Date.now()
    const errors: string[] = []
    let pluginsExecuted = 0
    const failedPlugins = new Set<string>()

    // Legacy plugin support
    const sortedPlugins = this.sortPlugins(this.plugins)
    const onError = this.config.options?.onError ?? 'continue'

    for (const plugin of sortedPlugins) {
      const state = this.pluginStates.get(plugin.name)
      if (state == null) {
        continue
      }

      const deps = plugin.dependencies
      if (deps != null && deps.some((dep) => failedPlugins.has(dep))) {
        state.status = 'skipped'
        continue
      }

      state.status = 'running'
      state.startTime = Date.now()

      try {
        await this.runPluginLifecycle(plugin)
        state.status = 'completed'
        pluginsExecuted++
      } catch (error) {
        state.status = 'failed'
        state.error = error instanceof Error ? error : new Error(String(error))
        failedPlugins.add(plugin.name)
        errors.push(`[${plugin.name}] ${state.error.message}`)

        if (onError === 'stop') {
          break
        }
      } finally {
        state.endTime = Date.now()
      }
    }

    return {
      success: errors.length === 0,
      pluginsExecuted,
      filesEmitted: this.context.getEmittedFiles().length,
      errors,
      duration: Date.now() - startTime,
    }
  }

  /**
   * Run the full plugin lifecycle with InputPlugins and OutputPlugins
   * Phase 1: Execute InputPlugins to collect InputBundles
   * Phase 2: Execute OutputPlugins to emit files
   *
   * @returns Extended run result with detailed execution info
   * @see Requirements 36.1, 36.2, 36.3, 22.5, 22.6
   */
  async runFull(): Promise<ExtendedRunResult> {
    const startTime = Date.now()
    const errors: string[] = []
    const emptyPlugins: string[] = []
    const failedPlugins = new Set<string>()
    let inputPluginsExecuted = 0
    let outputPluginsExecuted = 0
    const onError = this.config.options?.onError ?? 'continue'

    // Determine execution mode
    const mode: 'normal' | 'clean' | 'dryRun' = this.context.mode.cleanOnly
      ? 'clean'
      : this.context.mode.dryRun
        ? 'dryRun'
        : 'normal'

    // Phase 1: Execute InputPlugins (Requirement 36.1, 36.2, 36.3)
    const inputResult = await this.runInputPhase(onError, failedPlugins, errors)
    inputPluginsExecuted = inputResult.executed

    // If onError is 'stop' and we have errors, don't proceed to output phase
    if (onError === 'stop' && errors.length > 0) {
      const earlyResult: ExtendedRunResult = {
        success: false,
        pluginsExecuted: inputPluginsExecuted,
        inputPluginsExecuted,
        outputPluginsExecuted: 0,
        inputBundlesCollected: this.collectedInputBundles.length,
        filesEmitted: 0,
        errors,
        emptyPlugins,
        duration: Date.now() - startTime,
      }

      // Include dry-run statistics even on early exit (Requirement 21.3)
      if (this.context.mode.dryRun && this.context.mode.dryRunTracker != null) {
        earlyResult.dryRunStats = this.context.mode.dryRunTracker.getStats()
      }

      return earlyResult
    }

    // Phase 2: Execute OutputPlugins (Requirement 22.5, 22.6)
    const outputResult = await this.runOutputPhase(
      mode,
      onError,
      failedPlugins,
      errors,
      emptyPlugins,
    )
    outputPluginsExecuted = outputResult.executed

    // Build result object
    const result: ExtendedRunResult = {
      success: errors.length === 0,
      pluginsExecuted: inputPluginsExecuted + outputPluginsExecuted,
      inputPluginsExecuted,
      outputPluginsExecuted,
      inputBundlesCollected: this.collectedInputBundles.length,
      filesEmitted: this.context.getEmittedFiles().length,
      errors,
      emptyPlugins,
      duration: Date.now() - startTime,
    }

    // Include dry-run statistics if in dry-run mode (Requirements 21.2, 21.3)
    if (this.context.mode.dryRun && this.context.mode.dryRunTracker != null) {
      const stats = this.context.mode.dryRunTracker.getStats()
      result.dryRunStats = stats

      // Report total counts (Requirement 21.3)
      this.context.log.info(
        `[dry-run] Summary: ${stats.filesToCreate} files to create, `
        + `${stats.filesToModify} files to modify, `
        + `${stats.filesToDelete} files to delete`,
      )

      if (stats.directoriesToCreate > 0) {
        this.context.log.info(
          `[dry-run] Directories: ${stats.directoriesToCreate} to create, `
          + `${stats.directoriesToClean} to clean`,
        )
      }

      if (stats.copyOperations > 0) {
        this.context.log.info(`[dry-run] Copy operations: ${stats.copyOperations}`)
      }
    }

    return result
  }

  /**
   * Execute clean mode - collect all plugin output targets and delete
   * Skips content generation and transformation operations
   *
   * This method:
   * - Collects cleanup targets from all registered plugins (Requirement 24.2)
   * - Removes files and directories recursively (Requirement 24.3)
   * - Skips all content generation and transformation (Requirement 24.4)
   * - Reports cleanup results per plugin with counts (Requirement 24.5)
   *
   * @returns CleanResult with summary of cleanup operations
   * @see Requirements 24.1, 24.2, 24.3, 24.4, 24.5, 24.7
   */
  async runClean(): Promise<CleanResult> {
    const startTime = Date.now()

    // Create CleanupCollector with context dependencies
    const cleanupCollector = new CleanupCollector(
      this.context.fs,
      this.context.targets,
      this.context.log,
    )

    // Collect cleanup targets from all output plugins (Requirement 24.2, 24.7)
    // Note: We skip InputPlugins as they don't produce output
    const targets = cleanupCollector.collectTargets(this.outputPlugins)

    this.context.log.info(`Clean mode: collected ${targets.length} targets from ${this.outputPlugins.length} plugins`)

    // Execute cleanup - skips content generation and transformation (Requirement 24.4)
    // The CleanupCollector.clean method handles the actual removal
    const result = await cleanupCollector.clean(targets, this.context.mode.dryRun)

    // Report cleanup results per plugin (Requirement 24.5)
    for (const [pluginName, paths] of Object.entries(result.targetsByPlugin)) {
      const pathCount = paths.length
      if (this.context.mode.dryRun) {
        this.context.log.info(`[dry-run] Plugin "${pluginName}": would remove ${pathCount} targets`)
      } else {
        this.context.log.info(`Plugin "${pluginName}": removed ${pathCount} targets`)
      }
    }

    // Log summary
    if (this.context.mode.dryRun) {
      this.context.log.info(
        `[dry-run] Clean complete: would remove ${result.filesRemoved} files, ${result.directoriesRemoved} directories`,
      )
    } else {
      this.context.log.info(
        `Clean complete: removed ${result.filesRemoved} files, ${result.directoriesRemoved} directories`,
      )
    }

    // Adjust duration to reflect actual execution time
    return {
      ...result,
      duration: Date.now() - startTime,
    }
  }

  /**
   * Execute InputPlugins to collect InputBundles
   * InputPlugins execute before OutputPlugins to populate context
   *
   * @param onError - Error handling strategy
   * @param failedPlugins - Set of failed plugin names
   * @param errors - Array to collect error messages
   * @returns Number of InputPlugins executed
   * @see Requirements 36.1, 36.2, 36.3
   */
  private async runInputPhase(
    onError: 'continue' | 'stop',
    failedPlugins: Set<string>,
    errors: string[],
  ): Promise<{ executed: number }> {
    let executed = 0
    const sortedInputPlugins = this.sortPlugins(this.inputPlugins)

    for (const plugin of sortedInputPlugins) {
      const state = this.pluginStates.get(plugin.name)
      if (state == null) {
        continue
      }

      state.status = 'running'
      state.startTime = Date.now()

      try {
        // Execute scan method to collect InputBundles
        const bundles = await plugin.scan(this.context)
        this.collectedInputBundles.push(...bundles)

        state.status = 'completed'
        executed++

        this.context.log.debug(
          `InputPlugin "${plugin.name}" collected ${bundles.length} bundles`,
        )
      } catch (error) {
        // Capture errors with plugin and hook context (Requirement 10.1)
        state.status = 'failed'
        state.error = error instanceof Error ? error : new Error(String(error))
        failedPlugins.add(plugin.name)
        errors.push(`[${plugin.name}:scan] ${state.error.message}`)

        // Continue or stop based on configuration (Requirements 10.2, 10.3)
        if (onError === 'stop') {
          break
        }
        // Requirement 36.4: Continue with remaining InputPlugins on error
      } finally {
        state.endTime = Date.now()
      }
    }

    // Update context with collected bundles
    this.updateContextWithBundles()

    return { executed }
  }

  /**
   * Execute OutputPlugins to emit files
   * OutputPlugins execute after InputPlugins in sorted order
   *
   * @param mode - Execution mode (normal, clean, dryRun)
   * @param onError - Error handling strategy
   * @param failedPlugins - Set of failed plugin names
   * @param errors - Array to collect error messages
   * @param emptyPlugins - Array to collect plugins with no output
   * @returns Number of OutputPlugins executed
   * @see Requirements 22.5, 22.6
   */
  private async runOutputPhase(
    mode: 'normal' | 'clean' | 'dryRun',
    onError: 'continue' | 'stop',
    failedPlugins: Set<string>,
    errors: string[],
    emptyPlugins: string[],
  ): Promise<{ executed: number }> {
    let executed = 0
    const sortedOutputPlugins = this.sortPlugins(this.outputPlugins)

    // Resolve inheritance for all plugins first
    const resolvedPlugins = sortedOutputPlugins.map((p) => this.resolveInheritance(p))

    for (const plugin of resolvedPlugins) {
      const state = this.pluginStates.get(plugin.name)
      if (state == null) {
        continue
      }

      // Skip dependent plugins when dependency fails (Requirement 9.4)
      const deps = plugin.dependencies
      if (deps != null && deps.some((dep) => failedPlugins.has(dep))) {
        state.status = 'skipped'
        this.context.log.warn(
          `Skipping plugin "${plugin.name}" due to failed dependency`,
        )
        continue
      }

      state.status = 'running'
      state.startTime = Date.now()
      const filesBeforePlugin = this.context.getEmittedFiles().length

      try {
        // Execute lifecycle hooks (Requirement 5.1, 5.2, 5.5)
        await this.runOutputPluginLifecycle(plugin, mode)

        state.status = 'completed'
        executed++

        // Check for empty plugin output (Requirement 31.1, 31.2)
        const filesAfterPlugin = this.context.getEmittedFiles().length
        if (filesAfterPlugin === filesBeforePlugin) {
          this.warnEmptyPlugin(plugin.name)
          emptyPlugins.push(plugin.name)
        }
      } catch (error) {
        // Capture errors with plugin and hook context (Requirement 10.1)
        state.status = 'failed'
        state.error = error instanceof Error ? error : new Error(String(error))
        failedPlugins.add(plugin.name)

        const hookName = (error as PluginError).hookName ?? 'unknown'
        errors.push(`[${plugin.name}:${hookName}] ${state.error.message}`)

        // Continue or stop based on configuration (Requirements 10.2, 10.3)
        if (onError === 'stop') {
          break
        }
        // Preserve partial results where safe (Requirement 10.4)
      } finally {
        state.endTime = Date.now()
      }
    }

    return { executed }
  }

  /**
   * Execute lifecycle hooks for an OutputPlugin
   * Hooks: beforeCleanup, buildStart, generateBundle, writeBundle, afterCleanup, buildEnd
   *
   * @param plugin - OutputPlugin to execute
   * @param mode - Execution mode
   * @see Requirements 5.1, 5.2, 5.5
   */
  private async runOutputPluginLifecycle(
    plugin: OutputPlugin,
    mode: 'normal' | 'clean' | 'dryRun',
  ): Promise<void> {
    const allPluginNames = this.outputPlugins.map((p) => p.name)
    const emittedFiles = this.context.getEmittedFiles()
    const cleanupTargets = this.getCleanupTargets(plugin)

    // beforeCleanup hook (Requirement 5.1)
    await this.runOutputHook(plugin, 'beforeCleanup', {
      targets: cleanupTargets,
      dryRun: this.context.mode.dryRun,
    })

    // buildStart hook (Requirement 5.1)
    await this.runOutputHook(plugin, 'buildStart', {
      plugins: allPluginNames,
      mode,
    })

    // generateBundle hook (Requirement 5.6)
    await this.runOutputHook(plugin, 'generateBundle', {
      emittedFiles,
    })

    // writeBundle hook (Requirement 5.6)
    const outputDir = this.getOutputDir(plugin)
    await this.runOutputHook(plugin, 'writeBundle', {
      outputDir,
      files: this.context.getEmittedFiles(),
    })

    // afterCleanup hook (Requirement 5.2)
    await this.runOutputHook(plugin, 'afterCleanup', {
      targets: cleanupTargets,
      dryRun: this.context.mode.dryRun,
    })

    // buildEnd hook (Requirement 5.1)
    await this.runOutputHook(plugin, 'buildEnd', {
      success: true,
      errors: [],
    })
  }

  /**
   * Run a specific hook for an OutputPlugin with typed parameters
   *
   * @param plugin - OutputPlugin to run hook for
   * @param hookName - Name of the hook to run
   * @param params - Hook-specific parameters
   * @see Requirements 5.6, 5.7, 5.8
   */
  private async runOutputHook<K extends keyof OutputPlugin>(
    plugin: OutputPlugin,
    hookName: K,
    params: K extends 'beforeCleanup' | 'afterCleanup' ? CleanupParams
      : K extends 'buildStart' ? BuildStartParams
        : K extends 'generateBundle' ? GenerateBundleParams
          : K extends 'writeBundle' ? WriteBundleParams
            : K extends 'buildEnd' ? BuildEndParams
              : never,
  ): Promise<void> {
    const hook = plugin[hookName]
    if (typeof hook !== 'function') {
      return
    }

    try {
      await (hook as (ctx: PluginContext, p: typeof params) => Promise<void> | void)(
        this.context,
        params,
      )
    } catch (error) {
      const cause = error instanceof Error ? error : new Error(String(error))
      throw new PluginError(
        `Hook "${String(hookName)}" failed: ${cause.message}`,
        plugin.name,
        String(hookName),
        cause,
      )
    }
  }

  /**
   * Get cleanup targets for a plugin based on its output configuration
   */
  private getCleanupTargets(plugin: OutputPlugin): string[] {
    const outputs = plugin.outputs
    if (outputs == null) {
      return []
    }

    return outputs
      .filter((o) => o.enabled !== false)
      .map((o) => o.path)
  }

  /**
   * Get output directory for a plugin
   */
  private getOutputDir(plugin: OutputPlugin): string {
    const outputs = plugin.outputs
    if (outputs == null || outputs.length === 0) {
      return this.context.paths.dist
    }

    const firstOutput = outputs[0]
    return firstOutput?.path ?? this.context.paths.dist
  }

  /**
   * Update context with collected InputBundles
   * Creates a new context with the bundles available via getInputBundles
   */
  private updateContextWithBundles(): void {
    const bundles = this.collectedInputBundles
    this.context = createPluginContextWithDeps(
      {
        config: this.config,
        dryRun: this.context.mode.dryRun,
        cleanOnly: this.context.mode.cleanOnly,
      },
      {
        fs: this.context.fs,
        paths: this.context.paths,
        targets: this.context.targets,
        log: this.context.log,
        logger: this.context.logger,
        mode: this.context.mode,
        capabilities: this.context.capabilities,
        inputBundles: bundles,
        registry: this.context.registry,
      },
    )
  }

  /**
   * Warn when a plugin produces no output
   * Logs warning but continues execution
   *
   * @param pluginName - Name of the empty plugin
   * @see Requirements 31.1, 31.2, 31.3
   */
  private warnEmptyPlugin(pluginName: string): void {
    this.context.log.warn(`Plugin "${pluginName}" produced no output`)
  }

  /**
   * Run a single plugin through its lifecycle
   */
  private async runPluginLifecycle(plugin: Plugin): Promise<void> {
    await this.runHook(plugin, 'buildStart')
    await this.runHook(plugin, 'generateBundle')
    await this.runHook(plugin, 'writeBundle')
    await this.runHook(plugin, 'buildEnd')
  }

  /**
   * Run a specific hook for a plugin
   */
  async runHook<K extends keyof Plugin>(
    plugin: Plugin,
    hookName: K,
  ): Promise<void> {
    const hook = plugin[hookName]
    if (typeof hook !== 'function') {
      return
    }

    try {
      await (hook as (ctx: PluginContext) => Promise<void> | void)(this.context)
    } catch (error) {
      const cause = error instanceof Error ? error : new Error(String(error))
      throw new PluginError(
        `Hook "${hookName}" failed: ${cause.message}`,
        plugin.name,
        hookName,
        cause,
      )
    }
  }

  /**
   * Result of transform chain execution
   * Provides summary of changes made during transformation
   *
   * @see Requirement 3.4
   */
  private lastTransformSummary: TransformChainSummary | null = null

  /**
   * Run transform hook for all plugins (legacy Plugin interface)
   * Chains transformations in priority order - each plugin receives output of previous
   * Preserves original input on failure and reports error
   *
   * @param code - Original code to transform
   * @param id - File identifier
   * @returns Transform result or null if no transformations applied
   * @see Requirements 3.2, 3.3, 3.4
   */
  async runTransform(code: string, id: string): Promise<TransformResult | null> {
    const originalCode = code
    let currentCode = code
    let hasTransformed = false
    const transformations: TransformationRecord[] = []
    const errors: TransformError[] = []

    const sortedPlugins = this.sortPlugins(this.plugins)

    for (const plugin of sortedPlugins) {
      const transformHook = plugin.transform
      if (transformHook == null) {
        continue
      }

      try {
        // Each plugin receives output of previous (Requirement 3.2)
        const result = await transformHook(currentCode, id, this.context)
        if (result != null) {
          const previousCode = currentCode
          currentCode = result.code
          hasTransformed = true

          // Record transformation for summary (Requirement 3.4)
          transformations.push({
            pluginName: plugin.name,
            inputLength: previousCode.length,
            outputLength: result.code.length,
            changed: previousCode !== result.code,
          })
        }
      } catch (error) {
        // Preserve original input on failure (Requirement 3.3)
        const cause = error instanceof Error ? error : new Error(String(error))
        errors.push({
          pluginName: plugin.name,
          message: cause.message,
          error: cause,
        })

        this.context.log.error(
          `Transform failed in plugin "${plugin.name}": ${cause.message}`,
        )

        const onError = this.config.options?.onError ?? 'continue'
        if (onError === 'stop') {
          // Store summary before throwing
          this.lastTransformSummary = {
            originalLength: originalCode.length,
            finalLength: currentCode.length,
            transformations,
            errors,
            success: false,
          }

          throw new PluginError(
            `Transform failed: ${cause.message}`,
            plugin.name,
            'transform',
            cause,
          )
        }
        // Continue with current code (preserved from before failure)
      }
    }

    // Store summary of changes (Requirement 3.4)
    this.lastTransformSummary = {
      originalLength: originalCode.length,
      finalLength: currentCode.length,
      transformations,
      errors,
      success: errors.length === 0,
    }

    return hasTransformed ? { code: currentCode } : null
  }

  /**
   * Run transform hook for OutputPlugins
   * Chains transformations in priority order - each plugin receives output of previous
   * Preserves original input on failure and reports error
   *
   * @param code - Original code to transform
   * @param id - File identifier
   * @param params - Transform parameters
   * @returns Transform result or null if no transformations applied
   * @see Requirements 3.2, 3.3, 3.4
   */
  async runOutputTransform(
    code: string,
    id: string,
    params: TransformParams = { sourceMap: false },
  ): Promise<TransformResult | null> {
    const originalCode = code
    let currentCode = code
    let hasTransformed = false
    const transformations: TransformationRecord[] = []
    const errors: TransformError[] = []

    // Sort and resolve inheritance for output plugins
    const sortedOutputPlugins = this.sortPlugins(this.outputPlugins)
    const resolvedPlugins = sortedOutputPlugins.map((p) => this.resolveInheritance(p))

    for (const plugin of resolvedPlugins) {
      const transformHook = plugin.transform
      if (transformHook == null) {
        continue
      }

      try {
        // Each plugin receives output of previous (Requirement 3.2)
        const result = await transformHook(currentCode, id, this.context, params)
        if (result != null) {
          const previousCode = currentCode
          currentCode = result.code
          hasTransformed = true

          // Record transformation for summary (Requirement 3.4)
          transformations.push({
            pluginName: plugin.name,
            inputLength: previousCode.length,
            outputLength: result.code.length,
            changed: previousCode !== result.code,
          })
        }
      } catch (error) {
        // Preserve original input on failure (Requirement 3.3)
        const cause = error instanceof Error ? error : new Error(String(error))
        errors.push({
          pluginName: plugin.name,
          message: cause.message,
          error: cause,
        })

        this.context.log.error(
          `Transform failed in plugin "${plugin.name}": ${cause.message}`,
        )

        const onError = this.config.options?.onError ?? 'continue'
        if (onError === 'stop') {
          // Store summary before throwing
          this.lastTransformSummary = {
            originalLength: originalCode.length,
            finalLength: currentCode.length,
            transformations,
            errors,
            success: false,
          }

          throw new PluginError(
            `Transform failed: ${cause.message}`,
            plugin.name,
            'transform',
            cause,
          )
        }
        // Continue with current code (preserved from before failure)
      }
    }

    // Store summary of changes (Requirement 3.4)
    this.lastTransformSummary = {
      originalLength: originalCode.length,
      finalLength: currentCode.length,
      transformations,
      errors,
      success: errors.length === 0,
    }

    return hasTransformed ? { code: currentCode } : null
  }

  /**
   * Get the summary of the last transform chain execution
   * Provides details about transformations applied and any errors
   *
   * @returns Transform chain summary or null if no transform has been run
   * @see Requirement 3.4
   */
  getTransformSummary(): TransformChainSummary | null {
    return this.lastTransformSummary
  }

  /**
   * Get the plugin context
   */
  getContext(): PluginContext {
    return this.context
  }

  /**
   * Set the plugin context (for testing)
   */
  setContext(context: PluginContext): void {
    this.context = context
  }

  /**
   * Get collected input bundles
   */
  getCollectedInputBundles(): InputBundle[] {
    return [...this.collectedInputBundles]
  }

  /**
   * Run filename transformation for all OutputPlugins
   * Applies transformFilename hook from each plugin in priority order
   * Returns null to preserve original filename when no transformation is configured
   *
   * @param filename - Original filename to transform
   * @param tool - Optional target tool for filtering rules
   * @returns Transformed filename or null if no transformation applied
   * @see Requirements 14.1, 14.4, 14.5
   */
  runFilenameTransform(filename: string, tool?: string): string | null {
    // Sort and resolve inheritance for output plugins
    const sortedOutputPlugins = this.sortPlugins(this.outputPlugins)
    const resolvedPlugins = sortedOutputPlugins.map((p) => this.resolveInheritance(p))

    let currentFilename = filename
    let hasTransformed = false

    for (const plugin of resolvedPlugins) {
      const transformHook = plugin.transformFilename
      if (transformHook == null) {
        continue
      }

      // Check if plugin handles the specified tool
      const outputs = plugin.outputs
      if (tool != null && outputs != null) {
        const handlesTool = outputs.some((o) => o.tool === tool)
        if (!handlesTool) {
          continue
        }
      }

      try {
        // Apply transformation (Requirement 14.1)
        const result = transformHook(currentFilename, this.context)
        if (result != null) {
          currentFilename = result
          hasTransformed = true
        }
      } catch (error) {
        // Log error but continue with other plugins
        const cause = error instanceof Error ? error : new Error(String(error))
        this.context.log.error(
          `Filename transform failed in plugin "${plugin.name}": ${cause.message}`,
        )
      }
    }

    // Preserve original when no transformation configured (Requirement 14.5)
    return hasTransformed ? currentFilename : null
  }

  /**
   * Apply filename transformation rules from a specific plugin
   * Uses the plugin's filenameTransform configuration
   *
   * @param filename - Original filename
   * @param plugin - Plugin with transformation rules
   * @param tool - Optional target tool for filtering
   * @returns Transformed filename or original if no rules match
   * @see Requirements 14.1, 14.4
   */
  applyPluginFilenameRules(
    filename: string,
    plugin: OutputPlugin,
    tool?: string,
  ): string {
    const rules = plugin.filenameTransform
    if (rules == null || rules.length === 0) {
      return filename
    }

    let current = filename

    for (const rule of rules) {
      // Check tool filter
      if (rule.tools != null && rule.tools.length > 0) {
        if (tool == null || !rule.tools.includes(tool)) {
          continue
        }
      }

      const pattern = rule.pattern
      const replacement = rule.replacement

      // Apply pattern matching
      if (typeof pattern === 'string') {
        if (current.includes(pattern)) {
          if (typeof replacement === 'string') {
            current = current.replace(pattern, replacement)
          } else {
            current = current.replace(pattern, replacement(pattern))
          }
        }
      } else {
        if (pattern.test(current)) {
          if (typeof replacement === 'string') {
            current = current.replace(pattern, replacement)
          } else {
            const match = current.match(pattern)
            if (match != null && match[0] != null) {
              current = current.replace(pattern, replacement(match[0]))
            }
          }
        }
      }
    }

    return current
  }
}
