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

export function readConfigFile(): Promise<string> {
  return invoke<string>('read_config_file')
}

export function writeConfigFile(content: string): Promise<void> {
  return invoke<void>('write_config_file', { content })
}

export function openConfigDir(): Promise<string> {
  return invoke<string>('open_config_dir')
}

export interface AindexFileEntry {
  readonly sourcePath: string
  readonly translatedPath: string
  readonly translatedExists: boolean
  readonly fileType: 'sourceMdx' | 'resource'
}

export function listAindexFiles(cwd: string): Promise<AindexFileEntry[]> {
  return invoke<AindexFileEntry[]>('list_aindex_files', { cwd })
}

export function readAindexFile(cwd: string, relPath: string): Promise<string> {
  return invoke<string>('read_aindex_file', { cwd, relPath })
}

export function writeAindexFile(cwd: string, relPath: string, content: string): Promise<void> {
  return invoke<void>('write_aindex_file', { cwd, relPath, content })
}

export function listCategoryFiles(cwd: string, category: string): Promise<AindexFileEntry[]> {
  return invoke<AindexFileEntry[]>('list_category_files', { cwd, category })
}


export interface ExtensionCount {
  readonly ext: string
  readonly count: number
}

export interface CategoryStats {
  readonly name: string
  readonly fileCount: number
  readonly totalChars: number
  readonly totalLines: number
  readonly sourceMdxCount: number
  readonly resourceCount: number
  readonly translatedCount: number
}

export interface ProjectStats {
  readonly name: string
  readonly fileCount: number
  readonly totalChars: number
  readonly totalLines: number
}

export interface AindexStats {
  readonly totalFiles: number
  readonly totalChars: number
  readonly totalLines: number
  readonly totalSourceMdx: number
  readonly totalResources: number
  readonly totalTranslated: number
  readonly categories: readonly CategoryStats[]
  readonly projects: readonly ProjectStats[]
  readonly extensions: readonly ExtensionCount[]
}

export function getAindexStats(cwd: string): Promise<AindexStats> {
  return invoke<AindexStats>('get_aindex_stats', { cwd })
}
