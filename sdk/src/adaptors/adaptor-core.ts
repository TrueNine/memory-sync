import type {
  ILogger,
  LoggerDiagnosticRecord,
  LogLevel
} from '@/libraries/logger'
import {
  clearBufferedDiagnostics as clearBufferedDiagnosticsNative,
  createLogger as createLoggerNative,
  drainBufferedDiagnostics as drainBufferedDiagnosticsNative,
  flushOutput as flushOutputNative,
  getGlobalLogLevel as getGlobalLogLevelNative,
  setGlobalLogLevel as setGlobalLogLevelNative
} from '@/libraries/logger'

export {
  AbstractInputCapability
} from '../inputs/AbstractInputCapability'

export {
  AbstractAdaptor
} from './adaptor-core/AbstractAdaptor'

export {
  AbstractOutputAdaptor
} from './adaptor-core/AbstractOutputAdaptor'

export type {
  AbstractOutputAdaptorOptions,
  CleanupScopePathsConfig,
  CombineOptions,
  CommandNameTransformOptions,
  CommandOutputConfig,
  OutputCleanupConfig,
  RuleContentOptions,
  RuleOutputConfig,
  SkillFrontMatterOptions,
  SkillsOutputConfig,
  SubAgentArtifactFormat,
  SubAgentFileNameSource,
  SubAgentNameTransformOptions,
  SubAgentsOutputConfig
} from './adaptor-core/AbstractOutputAdaptor'

export {
  ADAPTOR_NAMES,
  DEFAULT_USER_CONFIG,
  FileExtensions,
  FrontMatterFields,
  GlobalConfigDirs,
  hasSourcePromptExtension,
  IgnoreFiles,
  OutputFileNames,
  OutputPrefixes,
  OutputSubdirectories,
  PathPlaceholders,
  PreservedSkills,
  SourceLocaleExtensions,
  SourcePromptExtensions,
  SourcePromptFileExtensions,
  ToolPresets,
  WORKSPACE_ROOT_PROJECT_NAME
} from './adaptor-core/constants'

export type {
  AdaptorName
} from './adaptor-core/constants'

export {
  validateCommandMetadata,
  validateRuleMetadata,
  validateSkillMetadata,
  validateSubAgentMetadata
} from './adaptor-core/ExportMetadataTypes'

export {
  applySubSeriesGlobPrefix,
  filterByProjectConfig
} from './adaptor-core/filters'

export type {
  FilterConfigPath,
  SeriesFilterable
} from './adaptor-core/filters'

export {
  findAllGitRepos,
  findGitModuleInfoDirs,
  resolveGitInfoDir
} from './adaptor-core/git-discovery'

export {
  GlobalScopeCollector
} from './adaptor-core/GlobalScopeCollector'

export type {
  GlobalScopeCollectorOptions,
  ScopeRegistration
} from './adaptor-core/GlobalScopeCollector'

export {
  ScopePriority,
  ScopeRegistry
} from './adaptor-core/GlobalScopeCollector'

export {
  createLocalizedPromptReader,
  LocalizedPromptReader
} from './adaptor-core/LocalizedPromptReader'

export {
  collectMcpServersFromSkills,
  McpConfigManager,
  transformMcpConfigForCursor,
  transformMcpConfigForOpencode,
  transformMcpServerMap
} from './adaptor-core/McpConfigManager'

export type {
  McpConfigFormat,
  McpConfigTransformer,
  McpServerEntry,
  McpWriteResult,
  TransformedMcpConfig
} from './adaptor-core/McpConfigManager'

export {
  clearPromptArtifactCache,
  compileRawPromptArtifact,
  readPromptArtifact
} from './adaptor-core/PromptArtifactCache'

export {
  deriveSubAgentIdentity,
  flattenPromptPath,
  resolveSkillName,
  resolveSubAgentCanonicalName
} from './adaptor-core/PromptIdentity'

export {
  RegistryWriter
} from './adaptor-core/RegistryWriter'

export {
  DEFAULT_SCOPE_PRIORITY,
  resolveTopicScopes
} from './adaptor-core/scopePolicy'

export * from './adaptor-core/types'

export type {
  DiagnosticLines,
  ILogger,
  LoggerDiagnosticInput,
  LoggerDiagnosticRecord,
  LogLevel
} from '@/libraries/logger'

export function clearBufferedDiagnostics(): void {
  clearBufferedDiagnosticsNative()
}

export function createLogger(namespace: string, logLevel?: LogLevel): ILogger {
  return createLoggerNative(namespace, logLevel)
}

export function drainBufferedDiagnostics(): LoggerDiagnosticRecord[] {
  return drainBufferedDiagnosticsNative()
}

export function flushOutput(): void {
  flushOutputNative()
}

export function getGlobalLogLevel(): LogLevel | undefined {
  return getGlobalLogLevelNative()
}

export function setGlobalLogLevel(level: LogLevel): void {
  setGlobalLogLevelNative(level)
}
