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
  BaseDirectoryInputPlugin,
  BaseFileInputPlugin,
  LocalizedPromptReader,
  createLocalizedPromptReader
} from './input'
export type {
  DirectoryInputPluginOptions,
  FileInputPluginOptions
} from './input'

// Output exports
export {
  AbstractOutputPlugin,
  McpConfigManager,
  transformMcpConfigForCursor,
  transformMcpConfigForOpencode,
  RegistryWriter
} from './output'
export type {
  McpConfigFormat,
  McpServerEntry,
  McpWriteResult,
  McpConfigTransformer,
  TransformedMcpConfig
} from './output'

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
  GlobalScopeCollector,
  ScopePriority,
  ScopeRegistry
} from './scope'
export type {
  GlobalScopeCollectorOptions,
  ScopeRegistration
} from './scope'

// Testing exports
export {
  createMockProject,
  createMockRulePrompt,
  collectFileNames
} from './testing'
