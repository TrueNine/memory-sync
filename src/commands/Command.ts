import type { Logger } from '@/log'
import type { CollectedInputContext, OutputCleanContext, OutputPlugin, OutputWriteContext } from '@/types'

/**
 * Command execution context
 */
export interface CommandContext {
  readonly logger: Logger
  readonly outputPlugins: readonly OutputPlugin[]
  readonly collectedInputContext: CollectedInputContext
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
