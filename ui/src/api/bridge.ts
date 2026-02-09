import { invoke } from '@tauri-apps/api/core'

export interface LogEntry {
  readonly timestamp: string
  readonly level: string
  readonly logger: string
  readonly payload: unknown
}

export interface PluginExecutionResult {
  readonly plugin: string
  readonly files: number
  readonly dirs: number
  readonly dryRun: boolean
}

export interface PipelineResult {
  readonly success: boolean
  readonly totalFiles: number
  readonly totalDirs: number
  readonly dryRun: boolean
  readonly command?: string
  readonly pluginResults: readonly PluginExecutionResult[]
  readonly logs: readonly LogEntry[]
  readonly errors: readonly string[]
}

export async function executePipeline(cwd: string, dryRun = false): Promise<PipelineResult> {
  return invoke<PipelineResult>('execute_pipeline', { cwd, dryRun })
}

export async function cleanOutputs(cwd: string, dryRun = false): Promise<PipelineResult> {
  return invoke<PipelineResult>('clean_outputs', { cwd, dryRun })
}

export async function loadConfig(cwd: string): Promise<unknown> {
  return invoke('load_config', { cwd })
}

export async function listPlugins(cwd: string): Promise<PluginExecutionResult[]> {
  return invoke<PluginExecutionResult[]>('list_plugins', { cwd })
}

export async function getLogs(cwd: string, command: string): Promise<LogEntry[]> {
  return invoke<LogEntry[]>('get_logs', { cwd, command })
}
