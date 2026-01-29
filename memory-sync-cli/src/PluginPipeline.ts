import type {Command, CommandContext} from '@/commands'
import type {PipelineConfig} from '@/config'
import type {MdxGlobalScope} from '@/globals'
import type {ILogger} from '@/log'
import type {
  CollectedInputContext,
  InputPlugin,
  InputPluginContext,
  OutputCleanContext,
  OutputPlugin,
  OutputWriteContext,
  Plugin,
  PluginKind,
  PluginOptions
} from '@/types'
import type {UserConfigFile} from '@/types/ConfigTypes'
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
  VersionCommand
} from '@/commands'
import {createLogger, setGlobalLogLevel} from '@/log'
import {GlobalScopeCollector, ScopePriority, ScopeRegistry} from '@/scope'
import {
  CircularDependencyError,
  MissingDependencyError
} from '@/types'
import {startupVersionCheck} from '@/versionCheck'

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
  readonly subcommand: Subcommand | undefined
  readonly helpFlag: boolean
  readonly versionFlag: boolean
  readonly dryRun: boolean
  readonly logLevel: LogLevel | undefined
  readonly logLevelFlags: readonly LogLevel[]
  readonly setOption: readonly [key: string, value: string][]
  readonly unknownCommand: string | undefined
  readonly positional: readonly string[]
  readonly unknown: readonly string[]
}

/**
 * Extract actual user arguments from argv
 * Compatible with various execution scenarios: npx, node, tsx, direct execution, etc.
 */
function extractUserArgs(argv: readonly string[]): string[] {
  const args = [...argv]

  const first = args[0] // Skip runtime path (node, bun, deno, etc.)
  if (first != null && isRuntimeExecutable(first)) args.shift()

  const second = args[0] // Skip script path or npx package name
  if (second != null && isScriptOrPackage(second)) args.shift()

  return args
}

/**
 * Determine if it is a runtime executable
 */
function isRuntimeExecutable(arg: string): boolean {
  const runtimes = ['node', 'nodejs', 'bun', 'deno', 'tsx', 'ts-node', 'npx', 'pnpx', 'yarn', 'pnpm']
  const normalized = arg.toLowerCase().replaceAll('\\', '/')
  return runtimes.some(rt => {
    const pattern = new RegExp(`(?:^|/)${rt}(?:\\.exe|\\.cmd|\\.ps1)?$`, 'i')
    return pattern.test(normalized) || normalized === rt
  })
}

/**
 * Determine if it is a script file or package name
 */
function isScriptOrPackage(arg: string): boolean {
  if (/\.(?:m?[jt]s|cjs)$/.test(arg)) return true // Script file
  if (/[/\\]/.test(arg) && !arg.startsWith('-')) return true // File path containing separators
  return /^(?:@[\w-]+\/)?[\w-]+$/.test(arg) && !arg.startsWith('-') // npx executed package name (e.g. tnmsc, @truenine/memory-sync-cli)
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
  ['--error', 'error']
])

/**
 * Log level priority map (lower number = more verbose)
 */
const LOG_LEVEL_PRIORITY: ReadonlyMap<LogLevel, number> = new Map([
  ['trace', 0],
  ['debug', 1],
  ['info', 2],
  ['warn', 3],
  ['error', 4]
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
  const {logLevelFlags} = args

  if (logLevelFlags.length === 0) return void 0

  let mostVerbose: LogLevel = logLevelFlags[0]! // Find the most verbose level (lowest priority number)
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

export function resolveCommand(args: ParsedCliArgs): Command {
  const {helpFlag, versionFlag, subcommand, dryRun, unknownCommand, setOption, positional} = args

  if (versionFlag) return new VersionCommand() // Version flag takes highest priority

  if (helpFlag) return new HelpCommand() // Help flag takes priority

  if (unknownCommand != null) return new UnknownCommand(unknownCommand) // Unknown command handling

  if (subcommand === 'version') return new VersionCommand() // Version subcommand

  if (subcommand === 'help') return new HelpCommand() // Help subcommand

  if (subcommand === 'outdated') return new OutdatedCommand() // Outdated subcommand

  if (subcommand === 'init') return new InitCommand() // Init subcommand

  if (subcommand === 'dry-run') return new DryRunOutputCommand() // Dry-run subcommand

  if (subcommand === 'clean') { // Clean subcommand with optional dry-run flag
    if (dryRun) return new DryRunCleanCommand()
    return new CleanCommand()
  }

  if (subcommand !== 'set' || setOption.length > 0) return new ExecuteCommand() // Set subcommand or --set option

  const parsedPositional: [key: string, value: string][] = []
  for (const arg of positional) {
    const eqIndex = arg.indexOf('=')
    if (eqIndex > 0) parsedPositional.push([arg.slice(0, eqIndex), arg.slice(eqIndex + 1)])
  }
  return new SetCommand([...setOption, ...parsedPositional])
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
    unknown: []
  }

  let firstPositionalProcessed = false

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg == null) continue

    if (arg === '--') { // Handle -- separator: all following args are positional
      result.positional.push(...args.slice(i + 1).filter((a): a is string => a != null))
      break
    }

    if (arg.startsWith('--')) { // Long options
      const parts = arg.split('=')
      const key = parts[0] ?? ''

      const logLevel = LOG_LEVEL_FLAGS.get(key) // Check log level flags
      if (logLevel != null) {
        result.logLevelFlags.push(logLevel)
        result.logLevel = logLevel
        continue
      }

      switch (key) {
        case '--help': result.helpFlag = true; break
        case '--version': result.versionFlag = true; break
        case '--dry-run': result.dryRun = true; break
        case '--set':
          if (parts.length > 1) { // Parse --set key=value from next arg or from = syntax
            const keyValue = parts.slice(1).join('=')
            const eqIndex = keyValue.indexOf('=')
            if (eqIndex > 0) result.setOption.push([keyValue.slice(0, eqIndex), keyValue.slice(eqIndex + 1)])
          } else {
            const nextArg = args[i + 1] // Next arg is the value
            if (nextArg != null) {
              const eqIndex = nextArg.indexOf('=')
              if (eqIndex > 0) {
                result.setOption.push([nextArg.slice(0, eqIndex), nextArg.slice(eqIndex + 1)])
                i++ // Skip next arg
              }
            }
          }
          break
        default: result.unknown.push(arg)
      }
      continue
    }

    if (arg.startsWith('-') && arg.length > 1) { // Short options
      const flags = arg.slice(1)
      for (const flag of flags) {
        switch (flag) {
          case 'h': result.helpFlag = true; break
          case 'v': result.versionFlag = true; break
          case 'n': result.dryRun = true; break
          default: result.unknown.push(`-${flag}`)
        }
      }
      continue
    }

    if (!firstPositionalProcessed) { // First positional argument: check if it's a subcommand
      firstPositionalProcessed = true
      if (VALID_SUBCOMMANDS.has(arg)) result.subcommand = arg as Subcommand
      else {
        result.unknownCommand = arg // Unknown first positional is captured as unknownCommand
      }
      continue
    }

    result.positional.push(arg) // Remaining positional arguments
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

  buildDependencyGraph<T extends PluginKind>(plugins: readonly Plugin<T>[]): Map<string, string[]> {
    const graph = new Map<string, string[]>()
    for (const plugin of plugins) {
      const deps = plugin.dependsOn ?? []
      graph.set(plugin.name, [...deps])
    }
    return graph
  }

  validateDependencies<T extends PluginKind>(plugins: readonly Plugin<T>[]): void {
    const pluginNames = new Set(plugins.map(p => p.name))
    for (const plugin of plugins) {
      const deps = plugin.dependsOn ?? []
      for (const dep of deps) {
        if (!pluginNames.has(dep)) throw new MissingDependencyError(plugin.name, dep)
      }
    }
  }

  topologicalSort<T extends PluginKind>(plugins: readonly Plugin<T>[]): Plugin<T>[] {
    this.validateDependencies(plugins) // Validate dependencies first

    const pluginMap = new Map<string, Plugin<T>>() // Build plugin map for quick lookup
    for (const plugin of plugins) pluginMap.set(plugin.name, plugin)

    const inDegree = new Map<string, number>() // Build in-degree map (count of incoming edges)
    for (const plugin of plugins) inDegree.set(plugin.name, 0)

    const dependents = new Map<string, string[]>() // Build adjacency list (dependents for each plugin)
    for (const plugin of plugins) dependents.set(plugin.name, [])

    for (const plugin of plugins) { // Populate in-degree and dependents
      const deps = plugin.dependsOn ?? []
      for (const dep of deps) {
        inDegree.set(plugin.name, (inDegree.get(plugin.name) ?? 0) + 1) // Increment in-degree for current plugin
        const depList = dependents.get(dep) ?? [] // Add current plugin as dependent of dep
        depList.push(plugin.name)
        dependents.set(dep, depList)
      }
    }

    const queue: string[] = [] // Use registration order for initial queue // Initialize queue with plugins that have no dependencies (in-degree = 0)
    for (const plugin of plugins) {
      if (inDegree.get(plugin.name) === 0) queue.push(plugin.name)
    }

    const result: Plugin<T>[] = [] // Process queue
    while (queue.length > 0) {
      const current = queue.shift()! // Take first element to preserve registration order
      const plugin = pluginMap.get(current)!
      result.push(plugin)

      const currentDependents = dependents.get(current) ?? [] // Process dependents in registration order
      const sortedDependents = currentDependents.sort((a, b) => { // Sort dependents by their original registration order
        const indexA = plugins.findIndex(p => p.name === a)
        const indexB = plugins.findIndex(p => p.name === b)
        return indexA - indexB
      })

      for (const dependent of sortedDependents) {
        const newDegree = (inDegree.get(dependent) ?? 0) - 1
        inDegree.set(dependent, newDegree)
        if (newDegree === 0) queue.push(dependent)
      }
    }

    if (result.length === plugins.length) return result // Check for cycle: if not all plugins are in result, there's a cycle

    const cyclePath = this.findCyclePath(plugins, inDegree)
    throw new CircularDependencyError(cyclePath)
  }

  private findCyclePath<T extends PluginKind>(
    plugins: readonly Plugin<T>[],
    inDegree: Map<string, number>
  ): string[] {
    const cycleNodes = new Set<string>() // Find nodes that are part of a cycle (in-degree > 0)
    for (const [name, degree] of inDegree) {
      if (degree > 0) cycleNodes.add(name)
    }

    const deps = new Map<string, string[]>() // Build dependency map for cycle nodes
    for (const plugin of plugins) {
      if (cycleNodes.has(plugin.name)) {
        const pluginDeps = (plugin.dependsOn ?? []).filter(d => cycleNodes.has(d))
        deps.set(plugin.name, pluginDeps)
      }
    }

    const visited = new Set<string>() // DFS to find cycle path
    const path: string[] = []

    const dfs = (node: string): boolean => {
      if (path.includes(node)) {
        path.push(node) // Found cycle, add closing node to complete the cycle
        return true
      }
      if (visited.has(node)) return false

      visited.add(node)
      path.push(node)

      for (const dep of deps.get(node) ?? []) {
        if (dfs(dep)) return true
      }

      path.pop()
      return false
    }

    for (const node of cycleNodes) { // Start DFS from any cycle node
      if (dfs(node)) {
        const cycleStart = path.indexOf(path.at(-1)!) // Extract just the cycle portion
        return path.slice(cycleStart)
      }
      visited.clear()
      path.length = 0
    }

    return [...cycleNodes] // Fallback: return all cycle nodes
  }

  async executePluginsInOrder(
    plugins: readonly InputPlugin[],
    baseCtx: Omit<InputPluginContext, 'dependencyContext' | 'globalScope' | 'scopeRegistry'>,
    dryRun: boolean = false,
    userConfig?: UserConfigFile
  ): Promise<Partial<CollectedInputContext>> {
    if (plugins.length === 0) return {}

    const sortedPlugins = this.topologicalSort(plugins) as InputPlugin[] // Sort plugins by dependencies (cast is safe since InputPlugin extends Plugin)

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

      accumulatedContext = this.mergeContexts(accumulatedContext, output) // Merge into accumulated context

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
      if (depOutput != null) merged = this.mergeContexts(merged, depOutput)
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

        const depOutput = outputsByPlugin.get(dep) // Since we've already executed it, we can look it up // We need to find the plugin to get its dependencies // Get the plugin's dependencies recursively
        if (depOutput != null) result.push(dep)
      }
    }

    visit(plugin.dependsOn ?? [])
    return result
  }

  private mergeContexts(
    base: Partial<CollectedInputContext>,
    addition: Partial<CollectedInputContext>
  ): Partial<CollectedInputContext> {
    let {workspace} = base // Build merged workspace
    if (addition.workspace != null) {
      if (workspace != null) {
        const projectMap = new Map<string | undefined, typeof workspace.projects[0]>() // Merge projects: later projects with same name replace earlier ones
        for (const project of workspace.projects) projectMap.set(project.name, project)
        for (const project of addition.workspace.projects) projectMap.set(project.name, project)
        workspace = {
          directory: addition.workspace.directory ?? workspace.directory,
          projects: [...projectMap.values()]
        }
      } else {
        ; ({workspace} = addition)
      }
    }

    const externalProjects: CollectedInputContext['externalProjects'] | undefined // Build merged arrays
      = addition.externalProjects != null
        ? [...base.externalProjects ?? [], ...addition.externalProjects]
        : base.externalProjects

    const ideConfigFiles: CollectedInputContext['ideConfigFiles'] | undefined
      = addition.ideConfigFiles != null
        ? [...base.ideConfigFiles ?? [], ...addition.ideConfigFiles]
        : base.ideConfigFiles

    const fastCommands: CollectedInputContext['fastCommands'] | undefined
      = addition.fastCommands != null
        ? [...base.fastCommands ?? [], ...addition.fastCommands]
        : base.fastCommands

    const subAgents: CollectedInputContext['subAgents'] | undefined
      = addition.subAgents != null
        ? [...base.subAgents ?? [], ...addition.subAgents]
        : base.subAgents

    const skills: CollectedInputContext['skills'] | undefined
      = addition.skills != null
        ? [...base.skills ?? [], ...addition.skills]
        : base.skills

    const aiAgentIgnoreConfigFiles: CollectedInputContext['aiAgentIgnoreConfigFiles'] | undefined
      = addition.aiAgentIgnoreConfigFiles != null
        ? [...base.aiAgentIgnoreConfigFiles ?? [], ...addition.aiAgentIgnoreConfigFiles]
        : base.aiAgentIgnoreConfigFiles

    const globalMemory: CollectedInputContext['globalMemory'] | undefined // globalMemory: last one wins
      = addition.globalMemory ?? base.globalMemory

    const shadowSourceProjectDir: CollectedInputContext['shadowSourceProjectDir'] | undefined // shadowSourceProjectDir: last one wins
      = addition.shadowSourceProjectDir ?? base.shadowSourceProjectDir

    const readmePrompts: CollectedInputContext['readmePrompts'] | undefined // readmePrompts: concatenate arrays
      = addition.readmePrompts != null
        ? [...base.readmePrompts ?? [], ...addition.readmePrompts]
        : base.readmePrompts

    const globalGitIgnore: CollectedInputContext['globalGitIgnore'] | undefined // globalGitIgnore: last one wins
      = addition.globalGitIgnore ?? base.globalGitIgnore

    return { // Build result object using object literal
      ...workspace != null ? {workspace} : {},
      ...externalProjects != null ? {externalProjects} : {},
      ...ideConfigFiles != null ? {ideConfigFiles} : {},
      ...fastCommands != null ? {fastCommands} : {},
      ...subAgents != null ? {subAgents} : {},
      ...skills != null ? {skills} : {},
      ...aiAgentIgnoreConfigFiles != null ? {aiAgentIgnoreConfigFiles} : {},
      ...globalMemory != null ? {globalMemory} : {},
      ...shadowSourceProjectDir != null ? {shadowSourceProjectDir} : {},
      ...readmePrompts != null ? {readmePrompts} : {},
      ...globalGitIgnore != null ? {globalGitIgnore} : {}
    }
  }
}
