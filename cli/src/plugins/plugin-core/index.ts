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
} from './constants'

export type {
  PluginName
} from './constants'

export {
  AbstractPlugin
} from './core/AbstractPlugin'

export {
  AbstractInputPlugin
} from './input/AbstractInputPlugin'

export {
  createLocalizedPromptReader,
  LocalizedPromptReader
} from './input/LocalizedPromptReader'

export {
  AbstractOutputPlugin
} from './output/AbstractOutputPlugin'

export type {
  AbstractOutputPluginOptions,
  CombineOptions,
  CommandNameTransformOptions,
  CommandOutputConfig,
  RuleContentOptions,
  RuleOutputConfig,
  SkillFrontMatterOptions,
  SkillsOutputConfig,
  SubAgentNameTransformOptions,
  SubAgentsOutputConfig
} from './output/AbstractOutputPlugin'

export {
  McpConfigManager,
  transformMcpConfigForCursor,
  transformMcpConfigForOpencode
} from './output/McpConfigManager'

export type {
  McpConfigFormat,
  McpConfigTransformer,
  McpServerEntry,
  McpWriteResult,
  TransformedMcpConfig
} from './output/McpConfigManager'

export {
  RegistryWriter
} from './output/registry/RegistryWriter'

export {
  applySubSeriesGlobPrefix,
  filterByProjectConfig,
  findAllGitRepos,
  findGitModuleInfoDirs,
  resolveGitInfoDir
} from './output/utils/filters'

export type {
  FilterConfigPath,
  SeriesFilterable
} from './output/utils/filters'

export {
  DEFAULT_SCOPE_PRIORITY,
  resolveTopicScopes
} from './output/utils/scopePolicy'

export {
  GlobalScopeCollector
} from './scope/GlobalScopeCollector'

export type {
  GlobalScopeCollectorOptions,
  ScopeRegistration
} from './scope/GlobalScopeCollector'

export {
  ScopePriority,
  ScopeRegistry
} from './scope/GlobalScopeCollector'

export * from './types'

export {
  createLogger,
  getGlobalLogLevel,
  setGlobalLogLevel
} from '@truenine/logger'

export type {
  ILogger,
  LogLevel
} from '@truenine/logger'
