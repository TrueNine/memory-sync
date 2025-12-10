/**
 * Auto sync command - Orchestrates plugin execution
 * Refactored to use PluginRunner for plugin-based architecture
 * Feature: plugin-architecture
 * Requirements: 5.1-5.5
 */

import type { Plugin, PluginConfig, PluginFactory, RunResult } from '../core/types'
import process from 'node:process'
import { intro, outro, spinner } from '@clack/prompts'
import pc from 'picocolors'
import { PluginRunner } from '../core/PluginRunner'
import defaultConfig from '../plugins.config'
import { LogAdapter, shutdownLogger } from '../utils/log'

const log = new LogAdapter('commands/auto')

/**
 * Options for auto sync command
 */
export interface AutoSyncOptions {
  /**
   * Filter plugins by name
   * Only plugins matching these names will be executed
   */
  plugins?: string[]
}

/**
 * Format duration in human-readable format
 */
function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`
  }
  const seconds = (ms / 1000).toFixed(2)
  return `${seconds}s`
}

/**
 * Log run result summary
 */
function logRunResult(result: RunResult): void {
  if (result.success) {
    log.info(
      'Completed: {} plugin(s) executed, {} file(s) emitted in {}',
      result.pluginsExecuted,
      result.filesEmitted,
      formatDuration(result.duration),
    )
  } else {
    log.warn(
      'Completed with errors: {} plugin(s) executed, {} error(s) in {}',
      result.pluginsExecuted,
      result.errors.length,
      formatDuration(result.duration),
    )
    for (const error of result.errors) {
      log.error('  {}', error)
    }
  }
}

/**
 * Resolve plugins from config, expanding plugin factories
 */
function resolvePlugins(
  plugins: (Plugin | PluginFactory)[],
): Plugin[] {
  return plugins.map((pluginOrFactory) => {
    if (typeof pluginOrFactory === 'function') {
      return pluginOrFactory({})
    }
    return pluginOrFactory
  })
}

/**
 * Filter plugins by name
 */
function filterPlugins(plugins: Plugin[], names: string[]): Plugin[] {
  const nameSet = new Set(names.map((n) => n.toLowerCase()))
  return plugins.filter((p) => nameSet.has(p.name.toLowerCase()))
}

/**
 * Create plugin runner with configuration
 */
async function createRunner(options: AutoSyncOptions): Promise<PluginRunner> {
  // Resolve plugin factories to plugin instances
  let plugins = resolvePlugins(defaultConfig.plugins)

  // Filter plugins if specified
  if (options.plugins && options.plugins.length > 0) {
    plugins = filterPlugins(plugins, options.plugins)
    log.info('Filtering to {} plugin(s): {}', plugins.length, options.plugins.join(', '))
  }

  // Create config with resolved plugins
  const resolvedConfig: PluginConfig = {
    plugins,
    options: defaultConfig.options ?? {
      parallel: false,
      onError: 'continue',
      logLevel: 'info',
    },
  }

  const runner = new PluginRunner(resolvedConfig)

  // Register all plugins
  for (const plugin of plugins) {
    runner.register(plugin)
  }

  return runner
}

/**
 * Auto sync command - Main entry point
 * Orchestrates all plugins through the PluginRunner
 */
export async function autoSyncCommand(options: AutoSyncOptions = {}): Promise<void> {
  intro(pc.bgCyan(pc.black(' Auto Sync & Map ')))

  const s = spinner()

  try {
    s.start('Loading plugin configuration...')
    const runner = await createRunner(options)
    const pluginCount = runner.getPlugins().length
    s.stop(`Loaded ${pluginCount} plugin(s)`)

    // Log registered plugins
    const plugins = runner.getPlugins()
    log.info('Registered plugins:')
    for (const plugin of plugins) {
      const priority = plugin.priority ?? 100
      log.info('  - {} (priority: {})', plugin.name, priority)
    }

    s.start('Executing plugins...')
    const result = await runner.run()
    s.stop(result.success ? 'Plugins executed successfully' : 'Plugins executed with errors')

    // Log summary
    logRunResult(result)

    if (result.success) {
      outro(pc.green('All tasks completed successfully!'))
    } else {
      outro(pc.yellow('Completed with some errors'))
      process.exitCode = 1
    }
  } catch (error) {
    s.stop('Sync failed')
    log.error('{}', error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  } finally {
    await shutdownLogger()
  }
}

/**
 * Auto sync command with plugin filter
 * Convenience function for CLI usage
 */
export async function autoSyncWithFilter(pluginNames: string[]): Promise<void> {
  return autoSyncCommand({ plugins: pluginNames })
}
