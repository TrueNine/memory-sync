import type { Command, CommandContext } from '@/commands'
import type { PipelineConfig } from '@/config'
import type { ILogger } from '@/log'
import type {
  CollectedInputContext,
  InputPlugin,
  InputPluginContext,
  OutputCleanContext,
  OutputPlugin,
  OutputWriteContext,
  Plugin,
  PluginKind,
  PluginOptions,
} from '@/types'
import * as fs from 'node:fs'
import * as path from 'node:path'
import glob from 'fast-glob'
import {
  CleanCommand,
  DryRunCleanCommand,
  DryRunOutputCommand,
  ExecuteCommand,
  HelpCommand,
  InitCommand,
  OutdatedCommand,
  SetCommand,
  UnknownCommand,
  VersionCommand,
} from '@/commands'
import { createLogger, setGlobalLogLevel } from '@/log'
import {
  CircularDependencyError,
  MissingDependencyError,
} from '@/types'
import { startupVersionCheck } from '@/versionCheck'

/**
 * Valid subcommands for the CLI
 */
export type Subcommand = 'help' | 'version' | 'outdated' | 'init' | 'dry-run' | 'clean' | 'set'

/**
 * Valid log levels for the CLI
 */
export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error'

/**
 * Command line argument parsing result
 */
export interface ParsedCliArgs {
  /**
   * The subcommand to execute (help, version, init, dry-run, clean, set, or undefined for default)
   */
  readonly subcommand: Subcommand | undefined
  /**
   * Whether help was requested via --help or -h flag
   */
  readonly helpFlag: boolean
  /**
   * Whether version was requested via --version or -v flag
   */
  readonly versionFlag: boolean
  /**
   * Dry run mode for clean command
   */
  readonly dryRun: boolean
  /**
   * Log level configuration (single level for backward compatibility)
   */
  readonly logLevel: LogLevel | undefined
  /**
   * All log level flags provided (for priority resolution)
   */
  readonly logLevelFlags: readonly LogLevel[]
  /**
   * Set option: key=value pair for configuration
   */
  readonly setOption: readonly [key: string, value: string][]
  /**
   * Unknown subcommand if provided
   */
  readonly unknownCommand: string | undefined
  /**
   * Remaining positional arguments
   */
  readonly positional: readonly string[]
  /**
   * Unknown flags
   */
  readonly unknown: readonly string[]
}

/**
 * 从 argv 中提取实际的用户参数
 * 兼容多种执行场景：npx、node、tsx、直接执行等
 */
function extractUserArgs(argv: readonly string[]): string[] {
  const args = [...argv]

  // 跳过 node/bun/deno 等运行时路径
  const first = args[0]
  if (first != null && isRuntimeExecutable(first)) {
    args.shift()
  }

  // 跳过脚本路径或 npx 包名
  const second = args[0]
  if (second != null && isScriptOrPackage(second)) {
    args.shift()
  }

  return args
}

/**
 * 判断是否为运行时可执行文件
 */
function isRuntimeExecutable(arg: string): boolean {
  const runtimes = ['node', 'nodejs', 'bun', 'deno', 'tsx', 'ts-node', 'npx', 'pnpx', 'yarn', 'pnpm']
  const normalized = arg.toLowerCase().replace(/\\/g, '/')
  return runtimes.some((rt) => {
    const pattern = new RegExp(`(?:^|/)${rt}(?:\\.exe|\\.cmd|\\.ps1)?$`, 'i')
    return pattern.test(normalized) || normalized === rt
  })
}

/**
 * 判断是否为脚本文件或包名
 */
function isScriptOrPackage(arg: string): boolean {
  // 脚本文件
  if (/\.(?:m?[jt]s|cjs)$/.test(arg)) {
    return true
  }
  // 包含路径分隔符的文件路径
  if (/[/\\]/.test(arg) && !arg.startsWith('-')) {
    return true
  }
  // npx 执行的包名（如 tnmsc、@truenine/memory-sync-cli）
  if (/^(?:@[\w-]+\/)?[\w-]+$/.test(arg) && !arg.startsWith('-')) {
    return true
  }
  return false
}

/**
 * Valid subcommands set for quick lookup
 */
const VALID_SUBCOMMANDS: ReadonlySet<string> = new Set(['help', 'version', 'outdated', 'init', 'dry-run', 'clean', 'set'])

/**
 * Log level flags mapping
 */
const LOG_LEVEL_FLAGS: ReadonlyMap<string, LogLevel> = new Map([
  ['--trace', 'trace'],
  ['--debug', 'debug'],
  ['--info', 'info'],
  ['--warn', 'warn'],
  ['--error', 'error'],
])

/**
 * Log level priority map (lower number = more verbose)
 */
const LOG_LEVEL_PRIORITY: ReadonlyMap<LogLevel, number> = new Map([
  ['trace', 0],
  ['debug', 1],
  ['info', 2],
  ['warn', 3],
  ['error', 4],
])

/**
 * Resolve log level from parsed arguments.
 * When multiple log level flags are provided, returns the most verbose level.
 * Priority: trace > debug > info > warn > error
 *
 * @param args - Parsed CLI arguments
 * @returns The resolved log level, or undefined if no log level flag was provided
 */
export function resolveLogLevel(args: ParsedCliArgs): LogLevel | undefined {
  const { logLevelFlags } = args

  if (logLevelFlags.length === 0) {
    return void 0
  }

  // Find the most verbose level (lowest priority number)
  let mostVerbose: LogLevel = logLevelFlags[0]!
  let lowestPriority = LOG_LEVEL_PRIORITY.get(mostVerbose) ?? 4

  for (const level of logLevelFlags) {
    const priority = LOG_LEVEL_PRIORITY.get(level) ?? 4
    if (priority < lowestPriority) {
      lowestPriority = priority
      mostVerbose = level
    }
  }

  return mostVerbose
}

/**
 * Resolve command from parsed arguments.
 * Resolution rules:
 * 1. If versionFlag is true → VersionCommand
 * 2. If helpFlag is true → HelpCommand
 * 3. If unknownCommand is defined → UnknownCommand
 * 4. If subcommand is 'version' → VersionCommand
 * 5. If subcommand is 'help' → HelpCommand
 * 6. If subcommand is 'init' → InitCommand
 * 7. If subcommand is 'dry-run' → DryRunOutputCommand
 * 8. If subcommand is 'clean':
 *    - If dryRun is true → DryRunCleanCommand
 *    - Else → CleanCommand
 * 9. If subcommand is 'set' or setOption is provided → SetCommand
 * 10. Default → ExecuteCommand
 *
 * @param args - Parsed CLI arguments
 * @returns The resolved command
 */
export function resolveCommand(args: ParsedCliArgs): Command {
  const { helpFlag, versionFlag, subcommand, dryRun, unknownCommand, setOption, positional } = args

  // Version flag takes highest priority
  if (versionFlag) {
    return new VersionCommand()
  }

  // Help flag takes priority
  if (helpFlag) {
    return new HelpCommand()
  }

  // Unknown command handling
  if (unknownCommand != null) {
    return new UnknownCommand(unknownCommand)
  }

  // Version subcommand
  if (subcommand === 'version') {
    return new VersionCommand()
  }

  // Help subcommand
  if (subcommand === 'help') {
    return new HelpCommand()
  }

  // Outdated subcommand
  if (subcommand === 'outdated') {
    return new OutdatedCommand()
  }

  // Init subcommand
  if (subcommand === 'init') {
    return new InitCommand()
  }

  // Dry-run subcommand
  if (subcommand === 'dry-run') {
    return new DryRunOutputCommand()
  }

  // Clean subcommand with optional dry-run flag
  if (subcommand === 'clean') {
    if (dryRun) {
      return new DryRunCleanCommand()
    }
    return new CleanCommand()
  }

  // Set subcommand or --set option
  if (subcommand === 'set' || setOption.length > 0) {
    // Parse positional args as key=value pairs for 'set' subcommand
    const parsedPositional: [key: string, value: string][] = []
    for (const arg of positional) {
      const eqIndex = arg.indexOf('=')
      if (eqIndex > 0) {
        parsedPositional.push([arg.slice(0, eqIndex), arg.slice(eqIndex + 1)])
      }
    }
    return new SetCommand([...setOption, ...parsedPositional])
  }

  // Default: execute sync pipeline
  return new ExecuteCommand()
}

/**
 * Parse command line arguments into structured result
 */
export function parseArgs(args: readonly string[]): ParsedCliArgs {
  const result: {
    subcommand: Subcommand | undefined
    helpFlag: boolean
    versionFlag: boolean
    dryRun: boolean
    logLevel: LogLevel | undefined
    logLevelFlags: LogLevel[]
    setOption: [key: string, value: string][]
    unknownCommand: string | undefined
    positional: string[]
    unknown: string[]
  } = {
    subcommand: void 0,
    helpFlag: false,
    versionFlag: false,
    dryRun: false,
    logLevel: void 0,
    logLevelFlags: [],
    setOption: [],
    unknownCommand: void 0,
    positional: [],
    unknown: [],
  }

  let firstPositionalProcessed = false

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg == null) {
      continue
    }

    // Handle -- separator: all following args are positional
    if (arg === '--') {
      result.positional.push(...args.slice(i + 1).filter((a): a is string => a != null))
      break
    }

    // Long options
    if (arg.startsWith('--')) {
      const parts = arg.split('=')
      const key = parts[0] ?? ''

      // Check log level flags
      const logLevel = LOG_LEVEL_FLAGS.get(key)
      if (logLevel != null) {
        result.logLevelFlags.push(logLevel)
        result.logLevel = logLevel
        continue
      }

      switch (key) {
        case '--help':
          result.helpFlag = true
          break
        case '--version':
          result.versionFlag = true
          break
        case '--dry-run':
          result.dryRun = true
          break
        case '--set':
          // Parse --set key=value from next arg or from = syntax
          if (parts.length > 1) {
            const keyValue = parts.slice(1).join('=')
            const eqIndex = keyValue.indexOf('=')
            if (eqIndex > 0) {
              result.setOption.push([keyValue.slice(0, eqIndex), keyValue.slice(eqIndex + 1)])
            }
          } else {
            // Next arg is the value
            const nextArg = args[i + 1]
            if (nextArg != null) {
              const eqIndex = nextArg.indexOf('=')
              if (eqIndex > 0) {
                result.setOption.push([nextArg.slice(0, eqIndex), nextArg.slice(eqIndex + 1)])
                // Skip next arg
                i++
              }
            }
          }
          break
        default:
          result.unknown.push(arg)
      }
      continue
    }

    // Short options
    if (arg.startsWith('-') && arg.length > 1) {
      const flags = arg.slice(1)
      for (const flag of flags) {
        switch (flag) {
          case 'h':
            result.helpFlag = true
            break
          case 'v':
            result.versionFlag = true
            break
          case 'n':
            result.dryRun = true
            break
          default:
            result.unknown.push(`-${flag}`)
        }
      }
      continue
    }

    // First positional argument: check if it's a subcommand
    if (!firstPositionalProcessed) {
      firstPositionalProcessed = true
      if (VALID_SUBCOMMANDS.has(arg)) {
        result.subcommand = arg as Subcommand
      } else {
        // Unknown first positional is captured as unknownCommand
        result.unknownCommand = arg
      }
      continue
    }

    // Remaining positional arguments
    result.positional.push(arg)
  }

  return result
}

export class PluginPipeline {
  private readonly logger: ILogger
  readonly args: ParsedCliArgs
  private outputPlugins: OutputPlugin[] = []

  constructor(...cmdArgs: (string | undefined)[]) {
    const filtered = cmdArgs.filter((arg): arg is string => arg != null)
    const userArgs = extractUserArgs(filtered)
    this.args = parseArgs(userArgs)

    // Resolve log level from parsed args and set globally
    const resolvedLogLevel = resolveLogLevel(this.args)
    if (resolvedLogLevel != null) {
      setGlobalLogLevel(resolvedLogLevel)
    }
    this.logger = createLogger('PluginPipeline', resolvedLogLevel)
    this.logger.debug('initialized', { args: this.args })
  }

  registerOutputPlugins(plugins: OutputPlugin[]): this {
    this.outputPlugins.push(...plugins)
    return this
  }

  async run(config: PipelineConfig): Promise<void> {
    // Startup version check (runs on even minutes, non-blocking)
    // Don't await - let it run in background without blocking process exit
    void startupVersionCheck(this.logger)

    const { context, outputPlugins, userConfigOptions } = config
    this.registerOutputPlugins([...outputPlugins])

    const command = this.resolveCommand()
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
      createWriteContext: (dryRun: boolean) => this.createWriteContext(ctx, dryRun),
    }
  }

  private createCleanContext(ctx: CollectedInputContext, dryRun: boolean): OutputCleanContext {
    return {
      logger: this.logger,
      fs,
      path,
      glob,
      collectedInputContext: ctx,
      dryRun,
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
      registeredPluginNames: this.outputPlugins.map((p) => p.name),
    }
  }

  /**
   * Build dependency graph from plugins.
   * Returns a Map where key is plugin name and value is array of dependency names.
   */
  buildDependencyGraph<T extends PluginKind>(plugins: readonly Plugin<T>[]): Map<string, string[]> {
    const graph = new Map<string, string[]>()
    for (const plugin of plugins) {
      const deps = plugin.dependsOn ?? []
      graph.set(plugin.name, [...deps])
    }
    return graph
  }

  /**
   * Validate that all dependencies reference existing plugins.
   * Throws MissingDependencyError if a plugin depends on a non-existent plugin.
   */
  validateDependencies<T extends PluginKind>(plugins: readonly Plugin<T>[]): void {
    const pluginNames = new Set(plugins.map((p) => p.name))
    for (const plugin of plugins) {
      const deps = plugin.dependsOn ?? []
      for (const dep of deps) {
        if (!pluginNames.has(dep)) {
          throw new MissingDependencyError(plugin.name, dep)
        }
      }
    }
  }

  /**
   * Topological sort using Kahn's algorithm with cycle detection.
   * Returns plugins in execution order where dependencies come before dependents.
   * Preserves registration order for plugins with no dependency relationship.
   * Throws CircularDependencyError if a cycle is detected.
   */
  topologicalSort<T extends PluginKind>(plugins: readonly Plugin<T>[]): Plugin<T>[] {
    // Validate dependencies first
    this.validateDependencies(plugins)

    // Build plugin map for quick lookup
    const pluginMap = new Map<string, Plugin<T>>()
    for (const plugin of plugins) {
      pluginMap.set(plugin.name, plugin)
    }

    // Build in-degree map (count of incoming edges)
    const inDegree = new Map<string, number>()
    for (const plugin of plugins) {
      inDegree.set(plugin.name, 0)
    }

    // Build adjacency list (dependents for each plugin)
    const dependents = new Map<string, string[]>()
    for (const plugin of plugins) {
      dependents.set(plugin.name, [])
    }

    // Populate in-degree and dependents
    for (const plugin of plugins) {
      const deps = plugin.dependsOn ?? []
      for (const dep of deps) {
        // Increment in-degree for current plugin
        inDegree.set(plugin.name, (inDegree.get(plugin.name) ?? 0) + 1)
        // Add current plugin as dependent of dep
        const depList = dependents.get(dep) ?? []
        depList.push(plugin.name)
        dependents.set(dep, depList)
      }
    }

    // Initialize queue with plugins that have no dependencies (in-degree = 0)
    // Use registration order for initial queue
    const queue: string[] = []
    for (const plugin of plugins) {
      if (inDegree.get(plugin.name) === 0) {
        queue.push(plugin.name)
      }
    }

    // Process queue
    const result: Plugin<T>[] = []
    while (queue.length > 0) {
      // Take first element to preserve registration order
      const current = queue.shift()!
      const plugin = pluginMap.get(current)!
      result.push(plugin)

      // Process dependents in registration order
      const currentDependents = dependents.get(current) ?? []
      // Sort dependents by their original registration order
      const sortedDependents = currentDependents.sort((a, b) => {
        const indexA = plugins.findIndex((p) => p.name === a)
        const indexB = plugins.findIndex((p) => p.name === b)
        return indexA - indexB
      })

      for (const dependent of sortedDependents) {
        const newDegree = (inDegree.get(dependent) ?? 0) - 1
        inDegree.set(dependent, newDegree)
        if (newDegree === 0) {
          queue.push(dependent)
        }
      }
    }

    // Check for cycle: if not all plugins are in result, there's a cycle
    if (result.length !== plugins.length) {
      // Find cycle path for error message
      const cyclePath = this.findCyclePath(plugins, inDegree)
      throw new CircularDependencyError(cyclePath)
    }

    return result
  }

  /**
   * Find a cycle path in the dependency graph for error reporting.
   * Called when topological sort detects remaining nodes with non-zero in-degree.
   */
  private findCyclePath<T extends PluginKind>(
    plugins: readonly Plugin<T>[],
    inDegree: Map<string, number>,
  ): string[] {
    // Find nodes that are part of a cycle (in-degree > 0)
    const cycleNodes = new Set<string>()
    for (const [name, degree] of inDegree) {
      if (degree > 0) {
        cycleNodes.add(name)
      }
    }

    // Build dependency map for cycle nodes
    const deps = new Map<string, string[]>()
    for (const plugin of plugins) {
      if (cycleNodes.has(plugin.name)) {
        const pluginDeps = (plugin.dependsOn ?? []).filter((d) => cycleNodes.has(d))
        deps.set(plugin.name, pluginDeps)
      }
    }

    // DFS to find cycle path
    const visited = new Set<string>()
    const path: string[] = []

    const dfs = (node: string): boolean => {
      if (path.includes(node)) {
        // Found cycle, add closing node to complete the cycle
        path.push(node)
        return true
      }
      if (visited.has(node)) {
        return false
      }

      visited.add(node)
      path.push(node)

      for (const dep of deps.get(node) ?? []) {
        if (dfs(dep)) {
          return true
        }
      }

      path.pop()
      return false
    }

    // Start DFS from any cycle node
    for (const node of cycleNodes) {
      if (dfs(node)) {
        // Extract just the cycle portion
        const cycleStart = path.indexOf(path[path.length - 1]!)
        return path.slice(cycleStart)
      }
      visited.clear()
      path.length = 0
    }

    // Fallback: return all cycle nodes
    return Array.from(cycleNodes)
  }

  /**
   * Execute plugins in topological order, merging outputs incrementally.
   * Each plugin receives accumulated context from all its dependencies.
   *
   * @param plugins - Input plugins to execute (will be sorted by dependencies)
   * @param baseCtx - Base context without dependencyContext (will be extended for each plugin)
   * @returns Merged CollectedInputContext from all plugins
   */
  executePluginsInOrder(
    plugins: readonly InputPlugin[],
    baseCtx: Omit<InputPluginContext, 'dependencyContext'>,
  ): Partial<CollectedInputContext> {
    if (plugins.length === 0) {
      return {}
    }

    // Sort plugins by dependencies (cast is safe since InputPlugin extends Plugin)
    const sortedPlugins = this.topologicalSort(plugins) as InputPlugin[]

    // Track outputs by plugin name for dependency resolution
    const outputsByPlugin = new Map<string, Partial<CollectedInputContext>>()

    // Accumulated context from all executed plugins
    let accumulatedContext: Partial<CollectedInputContext> = {}

    for (const plugin of sortedPlugins) {
      // Build dependency context from direct dependencies only
      const dependencyContext = this.buildDependencyContext(plugin, outputsByPlugin)

      // Create context with dependency outputs
      const ctx: InputPluginContext = {
        ...baseCtx,
        dependencyContext,
      }

      // Execute plugin
      const output = plugin.collect(ctx)

      // Store output for this plugin
      outputsByPlugin.set(plugin.name, output)

      // Merge into accumulated context
      accumulatedContext = this.mergeContexts(accumulatedContext, output)
    }

    return accumulatedContext
  }

  /**
   * Build dependency context for a plugin from its direct and transitive dependencies.
   */
  private buildDependencyContext(
    plugin: InputPlugin,
    outputsByPlugin: Map<string, Partial<CollectedInputContext>>,
  ): Partial<CollectedInputContext> {
    const deps = plugin.dependsOn ?? []
    if (deps.length === 0) {
      return {}
    }

    // Collect all transitive dependencies
    const allDeps = this.collectTransitiveDependencies(plugin, outputsByPlugin)

    // Merge all dependency outputs
    let merged: Partial<CollectedInputContext> = {}
    for (const depName of allDeps) {
      const depOutput = outputsByPlugin.get(depName)
      if (depOutput != null) {
        merged = this.mergeContexts(merged, depOutput)
      }
    }

    return merged
  }

  /**
   * Collect all transitive dependencies for a plugin.
   * Returns dependency names in execution order (dependencies before dependents).
   */
  private collectTransitiveDependencies(
    plugin: InputPlugin,
    outputsByPlugin: Map<string, Partial<CollectedInputContext>>,
  ): string[] {
    const visited = new Set<string>()
    const result: string[] = []

    const visit = (deps: readonly string[]): void => {
      for (const dep of deps) {
        if (visited.has(dep)) {
          continue
        }
        visited.add(dep)

        // Get the plugin's dependencies recursively
        // We need to find the plugin to get its dependencies
        // Since we've already executed it, we can look it up
        const depOutput = outputsByPlugin.get(dep)
        if (depOutput != null) {
          result.push(dep)
        }
      }
    }

    visit(plugin.dependsOn ?? [])
    return result
  }

  /**
   * Merge two CollectedInputContext objects.
   * Arrays are concatenated, objects are merged shallowly.
   * For workspace.projects: later projects with same name replace earlier ones
   * (this supports enhancer plugins that modify existing projects).
   * Returns a new object without mutating inputs.
   */
  private mergeContexts(
    base: Partial<CollectedInputContext>,
    addition: Partial<CollectedInputContext>,
  ): Partial<CollectedInputContext> {
    // Build merged workspace
    let workspace: CollectedInputContext['workspace'] | undefined = base.workspace
    if (addition.workspace != null) {
      if (workspace != null) {
        // Merge projects: later projects with same name replace earlier ones
        const projectMap = new Map<string | undefined, typeof workspace.projects[0]>()
        for (const project of workspace.projects) {
          projectMap.set(project.name, project)
        }
        for (const project of addition.workspace.projects) {
          projectMap.set(project.name, project)
        }
        workspace = {
          directory: addition.workspace.directory ?? workspace.directory,
          projects: Array.from(projectMap.values()),
        }
      } else {
        workspace = addition.workspace
      }
    }

    // Build merged arrays
    const externalProjects: CollectedInputContext['externalProjects'] | undefined
      = addition.externalProjects != null
        ? [...(base.externalProjects ?? []), ...addition.externalProjects]
        : base.externalProjects

    const ideConfigFiles: CollectedInputContext['ideConfigFiles'] | undefined
      = addition.ideConfigFiles != null
        ? [...(base.ideConfigFiles ?? []), ...addition.ideConfigFiles]
        : base.ideConfigFiles

    const fastCommands: CollectedInputContext['fastCommands'] | undefined
      = addition.fastCommands != null
        ? [...(base.fastCommands ?? []), ...addition.fastCommands]
        : base.fastCommands

    const subAgents: CollectedInputContext['subAgents'] | undefined
      = addition.subAgents != null
        ? [...(base.subAgents ?? []), ...addition.subAgents]
        : base.subAgents

    const skills: CollectedInputContext['skills'] | undefined
      = addition.skills != null
        ? [...(base.skills ?? []), ...addition.skills]
        : base.skills

    const aiAgentIgnoreConfigFiles: CollectedInputContext['aiAgentIgnoreConfigFiles'] | undefined
      = addition.aiAgentIgnoreConfigFiles != null
        ? [...(base.aiAgentIgnoreConfigFiles ?? []), ...addition.aiAgentIgnoreConfigFiles]
        : base.aiAgentIgnoreConfigFiles

    // globalMemory: last one wins
    const globalMemory: CollectedInputContext['globalMemory'] | undefined
      = addition.globalMemory ?? base.globalMemory

    // shadowSourceProjectDir: last one wins
    const shadowSourceProjectDir: CollectedInputContext['shadowSourceProjectDir'] | undefined
      = addition.shadowSourceProjectDir ?? base.shadowSourceProjectDir

    // readmePrompts: concatenate arrays
    const readmePrompts: CollectedInputContext['readmePrompts'] | undefined
      = addition.readmePrompts != null
        ? [...(base.readmePrompts ?? []), ...addition.readmePrompts]
        : base.readmePrompts

    // Build result object using object literal
    return {
      ...(workspace != null ? { workspace } : {}),
      ...(externalProjects != null ? { externalProjects } : {}),
      ...(ideConfigFiles != null ? { ideConfigFiles } : {}),
      ...(fastCommands != null ? { fastCommands } : {}),
      ...(subAgents != null ? { subAgents } : {}),
      ...(skills != null ? { skills } : {}),
      ...(aiAgentIgnoreConfigFiles != null ? { aiAgentIgnoreConfigFiles } : {}),
      ...(globalMemory != null ? { globalMemory } : {}),
      ...(shadowSourceProjectDir != null ? { shadowSourceProjectDir } : {}),
      ...(readmePrompts != null ? { readmePrompts } : {}),
    }
  }
}
