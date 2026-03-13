import type {ILogger, OutputCleanContext, OutputCollectedContext, OutputPlugin, OutputWriteContext, PluginOptions, UserConfigFile} from '../plugins/plugin-core'

/**
 * Command execution context
 */
export interface CommandContext {
  readonly logger: ILogger
  readonly outputPlugins: readonly OutputPlugin[]
  readonly collectedOutputContext: OutputCollectedContext
  readonly userConfigOptions: Required<PluginOptions>
  readonly createCleanContext: (dryRun: boolean) => OutputCleanContext
  readonly createWriteContext: (dryRun: boolean) => OutputWriteContext
}

/**
 * Command execution result
 */
export interface CommandResult {
  readonly success: boolean
  readonly filesAffected: number
  readonly dirsAffected: number
  readonly message?: string
}

/**
 * Per-plugin execution result for JSON output mode.
 * Captures individual plugin execution status, timing, and error details.
 */
export interface PluginExecutionResult {
  readonly pluginName: string
  readonly kind: 'Input' | 'Output'
  readonly status: 'success' | 'failed' | 'skipped'
  readonly filesWritten?: number
  readonly error?: string
  readonly duration?: number
}

/**
 * Structured JSON output for command execution results.
 * Extends CommandResult with per-plugin details and error aggregation
 * for consumption by Tauri sidecar / external tooling.
 */
export interface JsonCommandResult {
  readonly success: boolean
  readonly filesAffected: number
  readonly dirsAffected: number
  readonly message?: string
  readonly pluginResults?: readonly PluginExecutionResult[]
  readonly errors?: readonly string[]
}

/**
 * JSON output for configuration information.
 * Contains the merged config and the source layers that contributed to it.
 */
export interface JsonConfigInfo {
  readonly merged: UserConfigFile
  readonly sources: readonly ConfigSource[]
}

/**
 * Describes a single configuration source layer.
 */
export interface ConfigSource {
  readonly path: string
  readonly layer: 'programmatic' | 'cwd' | 'global' | 'default'
  readonly config: Partial<UserConfigFile>
}

/**
 * JSON output for plugin information listing.
 */
export interface JsonPluginInfo {
  readonly name: string
  readonly kind: 'Input' | 'Output'
  readonly description: string
  readonly dependencies: readonly string[]
}

/**
 * Base command interface
 */
export interface Command {
  readonly name: string
  execute: (ctx: CommandContext) => Promise<CommandResult>
}
