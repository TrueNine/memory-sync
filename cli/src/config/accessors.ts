/**
 * Configuration accessor functions for the TNMSC configuration system.
 *
 * This module provides convenient accessor functions for retrieving
 * specific configuration values and resolved paths.
 */

import type {
  LogLevel,
  ModulePaths,
  Profile,
  ResolvedModulePaths,
  TnmscConfig
} from './types'
import {ConfigService} from './ConfigService'
import {
  getAbsoluteWorkspaceDir,
  getAindexModulePaths as resolveAindexModulePaths,
  resolveAllAindexPaths
} from './pathResolver'

/**
 * Get the configuration from the default ConfigService instance.
 *
 * @returns The current configuration
 * @throws {ConfigError} If configuration hasn't been loaded
 */
export function getConfig(): TnmscConfig {
  return ConfigService.getInstance().getConfig()
}

export function getVersion(config?: TnmscConfig): string {
  const cfg = config ?? getConfig()
  return cfg.version
}

/**
 * Get the workspace directory from the configuration.
 *
 * @param config - Optional configuration object (uses loaded config if not provided)
 * @returns The workspace directory path (with ~ expanded)
 */
export function getWorkspaceDir(config?: TnmscConfig): string {
  const cfg = config ?? getConfig()
  return cfg.workspaceDir
}

/**
 * Get the absolute workspace directory path.
 *
 * @param config - Optional configuration object (uses loaded config if not provided)
 * @returns The absolute workspace directory path
 */
export function getAbsoluteWorkspaceDirPath(config?: TnmscConfig): string {
  const cfg = config ?? getConfig()
  return getAbsoluteWorkspaceDir(cfg.workspaceDir)
}

/**
 * Get the log level from the configuration.
 *
 * @param config - Optional configuration object (uses loaded config if not provided)
 * @returns The log level setting
 */
export function getLogLevel(config?: TnmscConfig): LogLevel {
  const cfg = config ?? getConfig()
  return cfg.logLevel
}

/**
 * Get the profile information from the configuration.
 *
 * @param config - Optional configuration object (uses loaded config if not provided)
 * @returns The user profile
 */
export function getProfile(config?: TnmscConfig): Profile {
  const cfg = config ?? getConfig()
  return cfg.profile
}

/**
 * Get the aindex configuration.
 *
 * @param config - Optional configuration object (uses loaded config if not provided)
 * @returns The aindex configuration
 */
export function getAindexConfig(config?: TnmscConfig): TnmscConfig['aindex'] {
  const cfg = config ?? getConfig()
  return cfg.aindex
}

/**
 * Get a specific aindex module's paths.
 *
 * @param moduleName - The name of the module (e.g., 'skills', 'commands')
 * @param config - Optional configuration object (uses loaded config if not provided)
 * @returns The module's src/dist paths
 */
export function getAindexModulePaths(
  moduleName: keyof TnmscConfig['aindex'] & string,
  config?: TnmscConfig
): ModulePaths {
  const cfg = config ?? getConfig()
  const modulePaths = cfg.aindex[moduleName]

  if (modulePaths === void 0 || modulePaths === null || typeof modulePaths !== 'object' || !('src' in modulePaths)) {
    throw new Error(`Invalid aindex module: ${moduleName}`)
  }

  return modulePaths
}

/**
 * Get a specific aindex module's resolved paths (absolute and relative).
 *
 * @param moduleName - The name of the module (e.g., 'skills', 'commands')
 * @param config - Optional configuration object (uses loaded config if not provided)
 * @returns The resolved module paths
 */
export function getResolvedAindexModulePaths(
  moduleName: keyof TnmscConfig['aindex'] & string,
  config?: TnmscConfig
): ResolvedModulePaths {
  const cfg = config ?? getConfig()
  return resolveAindexModulePaths(cfg, moduleName)
}

/**
 * Get all resolved aindex module paths.
 *
 * @param config - Optional configuration object (uses loaded config if not provided)
 * @returns Object with all module paths resolved
 */
export function getAllResolvedAindexPaths(config?: TnmscConfig): ReturnType<typeof resolveAllAindexPaths> {
  const cfg = config ?? getConfig()
  return resolveAllAindexPaths(cfg)
}

/**
 * Get the skills module paths.
 *
 * @param config - Optional configuration object (uses loaded config if not provided)
 * @returns The skills module paths
 */
export function getSkillsPaths(config?: TnmscConfig): ModulePaths {
  return getAindexModulePaths('skills', config)
}

/**
 * Get the commands module paths.
 *
 * @param config - Optional configuration object (uses loaded config if not provided)
 * @returns The commands module paths
 */
export function getCommandsPaths(config?: TnmscConfig): ModulePaths {
  return getAindexModulePaths('commands', config)
}

/**
 * Get the sub-agents module paths.
 *
 * @param config - Optional configuration object (uses loaded config if not provided)
 * @returns The sub-agents module paths
 */
export function getSubAgentsPaths(config?: TnmscConfig): ModulePaths {
  return getAindexModulePaths('subAgents', config)
}

/**
 * Get the rules module paths.
 *
 * @param config - Optional configuration object (uses loaded config if not provided)
 * @returns The rules module paths
 */
export function getRulesPaths(config?: TnmscConfig): ModulePaths {
  return getAindexModulePaths('rules', config)
}

/**
 * Get the global prompt file paths.
 *
 * @param config - Optional configuration object (uses loaded config if not provided)
 * @returns The global prompt file paths
 */
export function getGlobalPromptPaths(config?: TnmscConfig): ModulePaths {
  return getAindexModulePaths('globalPrompt', config)
}

/**
 * Get the workspace prompt file paths.
 *
 * @param config - Optional configuration object (uses loaded config if not provided)
 * @returns The workspace prompt file paths
 */
export function getWorkspacePromptPaths(config?: TnmscConfig): ModulePaths {
  return getAindexModulePaths('workspacePrompt', config)
}

/**
 * Get the app module paths.
 *
 * @param config - Optional configuration object (uses loaded config if not provided)
 * @returns The app module paths
 */
export function getAppPaths(config?: TnmscConfig): ModulePaths {
  return getAindexModulePaths('app', config)
}

/**
 * Get the ext module paths.
 *
 * @param config - Optional configuration object (uses loaded config if not provided)
 * @returns The ext module paths
 */
export function getExtPaths(config?: TnmscConfig): ModulePaths {
  return getAindexModulePaths('ext', config)
}

/**
 * Get the arch module paths.
 *
 * @param config - Optional configuration object (uses loaded config if not provided)
 * @returns The arch module paths
 */
export function getArchPaths(config?: TnmscConfig): ModulePaths {
  return getAindexModulePaths('arch', config)
}

/**
 * Check if the configuration has been loaded.
 *
 * @returns True if configuration is loaded
 */
export function isConfigLoaded(): boolean {
  return ConfigService.getInstance().isLoaded()
}

/**
 * Reload the configuration from disk.
 *
 * @returns The reloaded configuration
 */
export function reloadConfig(): TnmscConfig {
  return ConfigService.getInstance().reload()
}
