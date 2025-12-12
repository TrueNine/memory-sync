/**
 * Cleanup collector implementation
 * Collects output targets from all plugins for cleanup operations
 *
 * @see Requirements 24.1, 24.2, 24.3, 24.5, 24.7
 */

import type {
  CleanResult,
  CleanupTarget,
  OutputPlugin,
  PluginFileSystem,
  PluginLog,
  PluginTargets,
} from './types'
import { resolvePathVariables } from './PathResolver'

/**
 * CleanupCollector - collects and executes cleanup of plugin output targets
 *
 * Responsible for:
 * - Collecting cleanup targets from all registered plugins (Requirement 24.2)
 * - Aggregating target directories from output configurations (Requirement 24.7)
 * - Removing files and directories recursively (Requirement 24.3)
 *
 * @example
 * ```typescript
 * const collector = new CleanupCollector(fs, targets, log)
 * const cleanupTargets = collector.collectTargets(plugins)
 * const result = await collector.clean(cleanupTargets, false)
 * ```
 *
 * @see Requirements 24.1, 24.2, 24.3, 24.5, 24.7
 */
export class CleanupCollector {
  private fs: PluginFileSystem
  private targets: PluginTargets
  private log: PluginLog

  /**
   * Create a new CleanupCollector instance
   *
   * @param fs - File system utilities for file operations
   * @param targets - Target resolution utilities for path resolution
   * @param log - Logging interface for operation logging
   */
  constructor(fs: PluginFileSystem, targets: PluginTargets, log: PluginLog) {
    this.fs = fs
    this.targets = targets
    this.log = log
  }

  /**
   * Collect cleanup targets from all plugins
   * Aggregates target directories from output configurations
   *
   * @param plugins - Array of OutputPlugins to collect targets from
   * @returns Array of CleanupTargets for cleanup
   * @see Requirements 24.2, 24.7
   */
  collectTargets(plugins: OutputPlugin[]): CleanupTarget[] {
    const targets: CleanupTarget[] = []

    for (const plugin of plugins) {
      const outputs = plugin.outputs
      if (outputs == null || outputs.length === 0) {
        continue
      }

      for (const output of outputs) {
        // Skip disabled outputs
        if (output.enabled === false) {
          continue
        }

        // Determine if path is a file or directory
        // Paths ending with / or without extension are directories
        const isDirectory = output.path.endsWith('/') || !output.path.includes('.')

        targets.push({
          pluginName: plugin.name,
          path: output.path,
          type: isDirectory ? 'directory' : 'file',
          targetType: output.targetType,
        })
      }
    }

    this.log.debug(`Collected ${targets.length} cleanup targets from ${plugins.length} plugins`)
    return targets
  }

  /**
   * Resolve a cleanup target path to an absolute path
   *
   * @param target - CleanupTarget to resolve
   * @returns Resolved absolute path
   */
  private resolvePath(target: CleanupTarget): string {
    // First resolve any variables in the path
    const resolvedPath = resolvePathVariables(target.path)

    switch (target.targetType) {
      case 'workspaceGroup':
        return this.targets.workspaceGroup(resolvedPath)
      case 'workspace':
        // For workspace targets, path is relative to workspace root
        // Use workspaceGroup with empty name to get base path
        return this.targets.workspaceGroup(resolvedPath)
      case 'globalConfig': {
        // Extract tool name from path (e.g., ~/.claude/ -> claude)
        const toolMatch = resolvedPath.match(/^~?\.?([^/]+)/)
        const tool = toolMatch?.[1] ?? resolvedPath
        return this.targets.globalConfig(tool)
      }
      default:
        return resolvedPath
    }
  }

  /**
   * Execute cleanup on collected targets
   * Removes files and directories recursively
   *
   * @param targets - Array of CleanupTargets to clean
   * @param dryRun - If true, simulate operations without writing
   * @returns CleanResult with summary of operations
   * @see Requirements 24.3, 24.5
   */
  async clean(targets: CleanupTarget[], dryRun: boolean): Promise<CleanResult> {
    const startTime = Date.now()
    const errors: string[] = []
    let filesRemoved = 0
    let directoriesRemoved = 0
    const targetsByPlugin: Record<string, string[]> = {}

    for (const target of targets) {
      const resolvedPath = this.resolvePath(target)

      // Group targets by plugin for reporting
      if (targetsByPlugin[target.pluginName] == null) {
        targetsByPlugin[target.pluginName] = []
      }
      const pluginTargets = targetsByPlugin[target.pluginName]
      if (pluginTargets != null) {
        pluginTargets.push(resolvedPath)
      }

      try {
        const exists = await this.fs.exists(resolvedPath)
        if (!exists) {
          this.log.debug(`Skipping non-existent path: ${resolvedPath}`)
          continue
        }

        if (dryRun) {
          this.log.info(`[dry-run] Would remove: ${resolvedPath}`)
          if (target.type === 'directory') {
            directoriesRemoved++
          } else {
            filesRemoved++
          }
          continue
        }

        // Remove the target
        await this.fs.remove(resolvedPath)

        if (target.type === 'directory') {
          directoriesRemoved++
          this.log.info(`Removed directory: ${resolvedPath}`)
        } else {
          filesRemoved++
          this.log.info(`Removed file: ${resolvedPath}`)
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        errors.push(`[${target.pluginName}] Failed to remove ${resolvedPath}: ${message}`)
        this.log.error(`Failed to remove ${resolvedPath}: ${message}`)
      }
    }

    const duration = Date.now() - startTime

    // Report cleanup results per plugin (Requirement 24.5)
    for (const [pluginName, paths] of Object.entries(targetsByPlugin)) {
      this.log.info(`Plugin "${pluginName}": ${paths.length} targets processed`)
    }

    return {
      success: errors.length === 0,
      filesRemoved,
      directoriesRemoved,
      targetsByPlugin,
      errors,
      duration,
    }
  }
}
