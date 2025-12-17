import type { Command, CommandContext } from '@/commands'
import type { PipelineConfig } from '@/config'
import type { Logger } from '@/log'
import type {
  CollectedInputContext,
  InputPlugin,
  InputPluginContext,
  OutputCleanContext,
  OutputPlugin,
  OutputWriteContext,
  Plugin,
  PluginKind,
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
} from '@/commands'
import { createLogger } from '@/log'
import {
  CircularDependencyError,
  MissingDependencyError,
} from '@/types'

/**
 * 命令行参数解析结果
 */
export interface ParsedCliArgs {
  /**
   * 显示帮助信息
   */
  readonly help: boolean
  /**
   * 清理模式
   */
  readonly clean: boolean
  /**
   * 试运行模式
   */
  readonly dryRun: boolean
  /**
   * 未识别的位置参数
   */
  readonly positional: readonly string[]
  /**
   * 未识别的选项
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
 * 解析命令行参数
 */
function parseArgs(args: readonly string[]): ParsedCliArgs {
  const result: {
    help: boolean
    clean: boolean
    dryRun: boolean
    positional: string[]
    unknown: string[]
  } = {
    help: false,
    clean: false,
    dryRun: false,
    positional: [],
    unknown: [],
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg == null) {
      continue
    }

    // 处理 -- 后的所有参数作为位置参数
    if (arg === '--') {
      result.positional.push(...args.slice(i + 1).filter((a): a is string => a != null))
      break
    }

    // 长选项
    if (arg.startsWith('--')) {
      const parts = arg.slice(2).split('=')
      const key = parts[0] ?? ''
      switch (key) {
        case 'help':
          result.help = true
          break
        case 'clean':
          result.clean = true
          break
        case 'dry-run':
          result.dryRun = true
          break
        default:
          result.unknown.push(arg)
      }
      continue
    }

    // 短选项
    if (arg.startsWith('-') && arg.length > 1) {
      const flags = arg.slice(1)
      for (const flag of flags) {
        switch (flag) {
          case 'h':
            result.help = true
            break
          case 'c':
            result.clean = true
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

    // 位置参数
    result.positional.push(arg)
  }

  return result
}

export class PluginPipeline {
  private readonly logger: Logger
  readonly args: ParsedCliArgs
  private outputPlugins: OutputPlugin[] = []

  constructor(...cmdArgs: (string | undefined)[]) {
    this.logger = createLogger('PluginPipeline')
    const filtered = cmdArgs.filter((arg): arg is string => arg != null)
    const userArgs = extractUserArgs(filtered)
    this.args = parseArgs(userArgs)
    this.logger.info('PluginPipeline initialized', { args: this.args })
  }

  registerOutputPlugins(plugins: OutputPlugin[]): this {
    this.outputPlugins.push(...plugins)
    return this
  }

  async run(config: PipelineConfig): Promise<void> {
    const { context, outputPlugins } = config
    this.registerOutputPlugins([...outputPlugins])

    const command = this.resolveCommand()
    const commandCtx = this.createCommandContext(context)
    await command.execute(commandCtx)
  }

  private resolveCommand(): Command {
    const { help, clean, dryRun } = this.args

    if (help) {
      return new HelpCommand()
    }
    if (clean && dryRun) {
      return new DryRunCleanCommand()
    }
    if (clean) {
      return new CleanCommand()
    }
    if (dryRun) {
      return new DryRunOutputCommand()
    }

    return new ExecuteCommand()
  }

  private createCommandContext(ctx: CollectedInputContext): CommandContext {
    return {
      logger: this.logger,
      outputPlugins: this.outputPlugins,
      collectedInputContext: ctx,
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

    // globalMemory: last one wins
    const globalMemory: CollectedInputContext['globalMemory'] | undefined
      = addition.globalMemory ?? base.globalMemory

    // Build result object using object literal
    return {
      ...(workspace != null ? { workspace } : {}),
      ...(externalProjects != null ? { externalProjects } : {}),
      ...(ideConfigFiles != null ? { ideConfigFiles } : {}),
      ...(fastCommands != null ? { fastCommands } : {}),
      ...(subAgents != null ? { subAgents } : {}),
      ...(skills != null ? { skills } : {}),
      ...(globalMemory != null ? { globalMemory } : {}),
    }
  }
}
