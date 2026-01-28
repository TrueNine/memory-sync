import type {ILogger} from 'memory-sync-cli/src/log'
import type {CollectedInputContext, OutputCleanContext, OutputPlugin, OutputWriteContext, PluginOptions} from 'memory-sync-cli/src/types'

/**
 * Command execution context
 */
export interface CommandContext {
  readonly logger: ILogger
  readonly outputPlugins: readonly OutputPlugin[]
  readonly collectedInputContext: CollectedInputContext
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
 * Base command interface
 */
export interface Command {
  readonly name: string
  execute: (ctx: CommandContext) => Promise<CommandResult>
}
