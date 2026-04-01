import type {
  ILogger,
  LoggerDiagnosticRecord,
  OutputCleanContext,
  OutputCollectedContext,
  OutputPlugin,
  OutputWriteContext,
  PluginOptions,
  UserConfigFile
} from '@truenine/memory-sync-sdk'

export interface CommandContext {
  readonly logger: ILogger
  readonly outputPlugins: readonly OutputPlugin[]
  readonly collectedOutputContext: OutputCollectedContext
  readonly userConfigOptions: Required<PluginOptions>
  readonly createCleanContext: (dryRun: boolean) => OutputCleanContext
  readonly createWriteContext: (dryRun: boolean) => OutputWriteContext
}

export interface CommandResult {
  readonly success: boolean
  readonly filesAffected: number
  readonly dirsAffected: number
  readonly message?: string
}

export interface PluginExecutionResult {
  readonly pluginName: string
  readonly kind: 'Input' | 'Output'
  readonly status: 'success' | 'failed' | 'skipped'
  readonly filesWritten?: number
  readonly error?: string
  readonly duration?: number
}

export interface JsonCommandResult {
  readonly success: boolean
  readonly filesAffected: number
  readonly dirsAffected: number
  readonly message?: string
  readonly pluginResults: readonly PluginExecutionResult[]
  readonly warnings: readonly LoggerDiagnosticRecord[]
  readonly errors: readonly LoggerDiagnosticRecord[]
}

export interface JsonConfigInfo {
  readonly merged: UserConfigFile
  readonly sources: readonly ConfigSource[]
}

export interface ConfigSource {
  readonly path: string
  readonly layer: 'programmatic' | 'global' | 'default'
  readonly config: Partial<UserConfigFile>
}

export interface JsonPluginInfo {
  readonly name: string
  readonly kind: 'Input' | 'Output'
  readonly description: string
  readonly dependencies: readonly string[]
}

export interface Command {
  readonly name: string
  execute: (ctx: CommandContext) => Promise<CommandResult>
}
