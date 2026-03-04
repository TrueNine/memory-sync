// Core exports
export {AbstractPlugin} from './core/AbstractPlugin'

// Log exports
export {
  createLogger,
  getGlobalLogLevel,
  setGlobalLogLevel
} from './log'
export type {
  ILogger,
  LogLevel
} from './log'

// Constants exports
export {
  PathPlaceholders,
  DEFAULT_USER_CONFIG,
  PLUGIN_NAMES,
  OutputFileNames,
  OutputPrefixes,
  OutputSubdirectories,
  FrontMatterFields,
  FileExtensions,
  GlobalConfigDirs,
  IgnoreFiles,
  PreservedSkills,
  ToolPresets
} from './constants'
export type {
  PluginName
} from './constants'

// Types exports
export * from './types'

// Input exports
export {
  AbstractInputPlugin,
} from './input/AbstractInputPlugin'
export {
  BaseDirectoryInputPlugin
} from './input/BaseDirectoryInputPlugin'
export {
  BaseFileInputPlugin
} from './input/BaseFileInputPlugin'
export {
  LocalizedPromptReader,
  createLocalizedPromptReader
} from './input/LocalizedPromptReader'
export type {
  DirectoryInputPluginOptions
} from './input/BaseDirectoryInputPlugin'
export type {
  FileInputPluginOptions
} from './input/BaseFileInputPlugin'

// Output exports
export {
  AbstractOutputPlugin
} from './output/AbstractOutputPlugin'
export type {
  AbstractOutputPluginOptions,
  CombineOptions,
  CommandNameTransformOptions,
  ErrorContext,
  RuleContentOptions,
  RuleOutputConfig,
  SkillFrontMatterOptions,
  WriteOperationOptions
} from './output/AbstractOutputPlugin'
export {
  McpConfigManager,
  transformMcpConfigForCursor,
  transformMcpConfigForOpencode
} from './output/McpConfigManager'
export {
  RegistryWriter
} from './output/registry/RegistryWriter'
export type {
  McpConfigFormat
} from './output/McpConfigManager'
export type {
  McpServerEntry,
  McpWriteResult,
  McpConfigTransformer,
  TransformedMcpConfig
} from './output/McpConfigManager'

// Output utils exports
export {
  filterByProjectConfig,
  filterCommandsByProjectConfig,
  filterRulesByProjectConfig,
  filterSkillsByProjectConfig,
  filterSubAgentsByProjectConfig,
  findAllGitRepos,
  findGitModuleInfoDirs,
  resolveGitInfoDir,
  applySubSeriesGlobPrefix,
  getGlobalRules,
  getProjectRules,
  matchesSeries,
  resolveEffectiveIncludeSeries,
  resolveSubSeries,
  buildSubAgentContent,
  buildSubAgentFileName,
  buildSubAgentFrontMatter,
  getDefaultSubAgentConfig,
  mergeSubAgentConfig
} from './output/utils'
export type {
  SeriesFilterable,
  FilterConfigPath,
  SubAgentFileNameTemplate
} from './output/utils'

// Scope exports
export {
  GlobalScopeCollector
} from './scope/GlobalScopeCollector'
export {
  ScopePriority,
  ScopeRegistry
} from './scope/ScopeRegistry'
export type {
  GlobalScopeCollectorOptions
} from './scope/GlobalScopeCollector'
export type {
  ScopeRegistration
} from './scope/ScopeRegistry'

// Testing exports
export {
  createMockProject,
  createMockRulePrompt,
  collectFileNames
} from './testing'
