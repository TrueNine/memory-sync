export {
  DEFAULT_USER_CONFIG,
  FileExtensions,
  FrontMatterFields,
  GlobalConfigDirs,
  IgnoreFiles,
  OutputFileNames,
  OutputPrefixes,
  OutputSubdirectories,
  PathPlaceholders,
  PLUGIN_NAMES,
  PreservedSkills,
  ToolPresets
} from './plugin-core/constants'

export type {
  PluginName
} from './plugin-core/constants'

export {
  AbstractPlugin
} from './plugin-core/AbstractPlugin'

export {
  AbstractInputPlugin
} from './plugin-core/AbstractInputPlugin'

export {
  createLocalizedPromptReader,
  LocalizedPromptReader
} from './plugin-core/LocalizedPromptReader'

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
  SubAgentNameTransformOptions,
  SubAgentsOutputConfig
} from './plugin-core/AbstractOutputPlugin'

export {
  McpConfigManager,
  transformMcpConfigForCursor,
  transformMcpConfigForOpencode
} from './plugin-core/McpConfigManager'

export type {
  McpConfigFormat,
  McpConfigTransformer,
  McpServerEntry,
  McpWriteResult,
  TransformedMcpConfig
} from './plugin-core/McpConfigManager'

export {
  RegistryWriter
} from './plugin-core/RegistryWriter'

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
  DEFAULT_SCOPE_PRIORITY,
  resolveTopicScopes
} from './plugin-core/scopePolicy'

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

export * from './plugin-core/types'

export {
  createLogger,
  getGlobalLogLevel,
  setGlobalLogLevel
} from '@truenine/logger'

export type {
  ILogger,
  LogLevel
} from '@truenine/logger'
