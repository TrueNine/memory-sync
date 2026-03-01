import type {OutputPlugin, OutputWriteContext} from '../plugins/plugin-shared'
import {checkCanWrite} from '../plugins/plugin-shared'

/**
 * Filter plugins based on write permissions.
 * Returns only plugins that are allowed to write to the specified scope.
 *
 * @param plugins - All output plugins to filter
 * @param ctx - Write context for permission checking
 * @param scope - Which scope to check ('project' or 'global')
 * @returns Filtered array of plugins with write permission
 */
export async function filterPluginsByWritePermission(
  plugins: readonly OutputPlugin[],
  ctx: OutputWriteContext,
  scope: 'project' | 'global' = 'project'
): Promise<OutputPlugin[]> {
  const permissions = await checkCanWrite([...plugins], ctx)
  return plugins.filter(p => permissions.get(p.name)?.[scope] ?? true)
}

/**
 * Result summary from aggregating plugin outputs
 */
export interface AggregatedResults {
  readonly totalFiles: number
  readonly totalDirs: number
}

/**
 * Aggregate file and directory counts from plugin results.
 *
 * @param results - Map of plugin name to their write results
 * @returns Aggregated counts of files and directories
 */
export function aggregatePluginResults(
  results: Map<string, {files: readonly unknown[], dirs: readonly unknown[]}>
): AggregatedResults {
  let totalFiles = 0
  let totalDirs = 0

  for (const result of results.values()) {
    totalFiles += result.files.length
    totalDirs += result.dirs.length
  }

  return {totalFiles, totalDirs}
}

/**
 * Create a standard CommandResult object.
 * Centralizes the result object creation pattern used across commands.
 *
 * @param success - Whether the command succeeded
 * @param filesAffected - Number of files affected
 * @param dirsAffected - Number of directories affected
 * @param message - Optional message
 */
export function createCommandResult(
  success: boolean,
  filesAffected: number,
  dirsAffected: number,
  message?: string
): {success: boolean, filesAffected: number, dirsAffected: number, message?: string} {
  return message != null
    ? {success, filesAffected, dirsAffected, message}
    : {success, filesAffected, dirsAffected}
}

/**
 * Log plugin results with a consistent format.
 *
 * @param results - Map of plugin name to their results
 * @param logger - Logger instance for output
 * @param logger.info - Logger info method
 * @param dryRun - Whether this is a dry-run execution
 */
export function logPluginResults(
  results: Map<string, {files: readonly unknown[], dirs: readonly unknown[]}>,
  logger: {info: (msg: string, meta?: object) => void},
  dryRun: boolean = false
): void {
  for (const [pluginName, result] of results) {
    logger.info('plugin result', {
      plugin: pluginName,
      files: result.files.length,
      dirs: result.dirs.length,
      ...dryRun && {dryRun: true}
    })
  }
}
