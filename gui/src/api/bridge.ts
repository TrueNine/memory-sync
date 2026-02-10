import { invoke } from '@tauri-apps/api/core'

export interface CliStatus {
  readonly available: boolean
  readonly version?: string
  readonly error?: string
}

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

export function checkCli(): Promise<CliStatus> {
  return invoke<CliStatus>('check_cli')
}

export function executePipeline(cwd: string, dryRun = false): Promise<PipelineResult> {
  return invoke<PipelineResult>('execute_pipeline', { cwd, dryRun })
}

export function cleanOutputs(cwd: string, dryRun = false): Promise<PipelineResult> {
  return invoke<PipelineResult>('clean_outputs', { cwd, dryRun })
}

export function loadConfig(cwd: string): Promise<unknown> {
  return invoke('load_config', { cwd })
}

export function listPlugins(cwd: string): Promise<PluginExecutionResult[]> {
  return invoke<PluginExecutionResult[]>('list_plugins', { cwd })
}

export function getLogs(cwd: string, command: string): Promise<LogEntry[]> {
  return invoke<LogEntry[]>('get_logs', { cwd, command })
}

export function readConfigFile(scope: 'cwd' | 'global', cwd: string): Promise<string> {
  return invoke<string>('read_config_file', { scope, cwd })
}

export function writeConfigFile(scope: 'cwd' | 'global', cwd: string, content: string): Promise<void> {
  return invoke<void>('write_config_file', { scope, cwd, content })
}

