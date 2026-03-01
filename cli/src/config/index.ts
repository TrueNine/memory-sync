export { // Export accessor functions
  getAbsoluteWorkspaceDirPath,
  getAindexConfig,
  getAllResolvedAindexPaths,
  getAppPaths,
  getArchPaths,
  getCommandsPaths,
  getConfig,
  getExtPaths,
  getGlobalPromptPaths,
  getLogLevel,
  getAindexModulePaths as getModulePaths,
  getProfile,
  getResolvedAindexModulePaths,
  getRulesPaths,
  getSkillsPaths,
  getSubAgentsPaths,
  getVersion,
  getWorkspaceDir,
  getWorkspacePromptPaths,
  isConfigLoaded,
  reloadConfig
} from './accessors'

export { // Export configuration service
  ConfigService,
  DEFAULT_CONFIG_FILE_NAME,
  DEFAULT_GLOBAL_CONFIG_DIR,
  getConfigService,
  getDefaultConfigPath,
  loadConfig,
  safeLoadConfig
} from './ConfigService'

export { // Export error classes
  ConfigError,
  ConfigFileNotFoundError,
  ConfigParseError,
  ConfigPathError,
  ConfigPermissionError,
  ConfigValidationError,
  formatConfigError,
  isConfigError,
  isConfigFileNotFoundError,
  isConfigParseError,
  isConfigValidationError
} from './errors'

export { // Export path resolution utilities
  clearPathCache,
  expandHomeDir,
  getAbsoluteDistPath,
  getAbsoluteSrcPath,
  getAbsoluteWorkspaceDir,
  getAindexModulePaths,
  getRelativePath,
  isAbsolutePath,
  joinPath,
  normalizePath,
  resolveAllAindexPaths,
  resolveModulePaths,
  resolveWorkspacePath
} from './pathResolver'

export { // Export schema and validation
  formatValidationErrors,
  getDefaultConfig,
  isValidLogLevel,
  safeValidateConfig,
  validateConfig,
  ZAindexConfig,
  ZModulePaths,
  ZProfile,
  ZTnmscConfig
} from './schema'

export type { // Export types
  AindexConfig,
  ConfigLoadResult,
  ConfigServiceOptions,
  LogLevel,
  ModulePaths,
  Profile,
  ResolvedModulePaths,
  TnmscConfig
} from './types'
