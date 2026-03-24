export {
  AbstractInputCapability
} from '../inputs/AbstractInputCapability'

export {
  AbstractOutputPlugin
} from './plugin-core/AbstractOutputPlugin'

export type {
  AbstractOutputPluginOptions,
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
} from './plugin-core/AbstractOutputPlugin'

export {
  AbstractPlugin
} from './plugin-core/AbstractPlugin'

export {
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
  PLUGIN_NAMES,
  PreservedSkills,
  SourceLocaleExtensions,
  SourcePromptExtensions,
  SourcePromptFileExtensions,
  ToolPresets,
  WORKSPACE_ROOT_PROJECT_NAME
} from './plugin-core/constants'

export type {
  PluginName
} from './plugin-core/constants'

export {
  validateCommandMetadata,
  validateRuleMetadata,
  validateSkillMetadata,
  validateSubAgentMetadata
} from './plugin-core/ExportMetadataTypes'

export {
  applySubSeriesGlobPrefix,
  filterByProjectConfig,
  findAllGitRepos,
  findGitModuleInfoDirs,
  resolveGitInfoDir
} from './plugin-core/filters'

export type {
  FilterConfigPath,
  SeriesFilterable
} from './plugin-core/filters'

export {
  GlobalScopeCollector
} from './plugin-core/GlobalScopeCollector'

export type {
  GlobalScopeCollectorOptions,
  ScopeRegistration
} from './plugin-core/GlobalScopeCollector'

export {
  ScopePriority,
  ScopeRegistry
} from './plugin-core/GlobalScopeCollector'

export {
  createLocalizedPromptReader,
  LocalizedPromptReader
} from './plugin-core/LocalizedPromptReader'

export {
  collectMcpServersFromSkills,
  McpConfigManager,
  transformMcpConfigForCursor,
  transformMcpConfigForOpencode,
  transformMcpServerMap
} from './plugin-core/McpConfigManager'

export type {
  McpConfigFormat,
  McpConfigTransformer,
  McpServerEntry,
  McpWriteResult,
  TransformedMcpConfig
} from './plugin-core/McpConfigManager'

export {
  clearPromptArtifactCache,
  compileRawPromptArtifact,
  readPromptArtifact
} from './plugin-core/PromptArtifactCache'

export {
  deriveSubAgentIdentity,
  flattenPromptPath,
  resolveSkillName,
  resolveSubAgentCanonicalName
} from './plugin-core/PromptIdentity'

export {
  RegistryWriter
} from './plugin-core/RegistryWriter'

export {
  DEFAULT_SCOPE_PRIORITY,
  resolveTopicScopes
} from './plugin-core/scopePolicy'

export * from './plugin-core/types'

export {
  clearBufferedDiagnostics,
  createLogger,
  drainBufferedDiagnostics,
  getGlobalLogLevel,
  setGlobalLogLevel
} from '@truenine/logger'

export type {
  DiagnosticLines,
  ILogger,
  LoggerDiagnosticInput,
  LoggerDiagnosticRecord,
  LogLevel
} from '@truenine/logger'
