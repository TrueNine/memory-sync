/**
 * Path resolution utilities for the TNMSC configuration system.
 *
 * This module provides functions for resolving paths relative to the
 * workspace directory, expanding home directory shortcuts, and caching
 * resolved paths for performance.
 */

import type {ModulePaths, ResolvedModulePaths, TnmscConfig} from './types'
import * as os from 'node:os'
import * as path from 'node:path'
import {ConfigPathError} from './errors'

/**
 * Cache for resolved paths to avoid redundant computations.
 */
const pathCache = new Map<string, string>()

/**
 * Clear the path cache.
 * This should be called when the configuration is reloaded.
 */
export function clearPathCache(): void {
  pathCache.clear()
}

/**
 * Get the cache key for a path resolution.
 */
function getCacheKey(workspaceDir: string, relativePath: string): string {
  return `${workspaceDir}::${relativePath}`
}

/**
 * Expand the tilde (~) in a path to the user's home directory.
 *
 * @param inputPath - The path that may contain a tilde
 * @returns The path with tilde expanded to the home directory
 */
export function expandHomeDir(inputPath: string): string {
  if (!inputPath.startsWith('~')) return inputPath

  const homeDir = os.homedir()

  if (inputPath === '~') return homeDir

  if (inputPath.startsWith('~/') || inputPath.startsWith('~\\')) return path.join(homeDir, inputPath.slice(2))

  return inputPath // Handle ~username syntax (not supported, return as-is)
}

/**
 * Resolve a path relative to the workspace directory.
 *
 * @param workspaceDir - The workspace directory (may contain ~)
 * @param relativePath - The path relative to the workspace
 * @param useCache - Whether to use the path cache
 * @returns The absolute resolved path
 * @throws {ConfigPathError} If path resolution fails
 */
export function resolveWorkspacePath(
  workspaceDir: string,
  relativePath: string,
  useCache = true
): string {
  const cacheKey = getCacheKey(workspaceDir, relativePath)

  if (useCache && pathCache.has(cacheKey)) return pathCache.get(cacheKey)!

  try {
    const expandedWorkspace = expandHomeDir(workspaceDir)
    const resolvedPath = path.resolve(expandedWorkspace, relativePath)

    if (useCache) pathCache.set(cacheKey, resolvedPath)

    return resolvedPath
  }
  catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new ConfigPathError(workspaceDir, relativePath, reason)
  }
}

/**
 * Get the absolute path for a module's source directory.
 *
 * @param config - The TNMSC configuration
 * @param modulePath - The module paths (src/dist pair)
 * @returns The absolute source path
 */
export function getAbsoluteSrcPath(config: TnmscConfig, modulePath: ModulePaths): string {
  return resolveWorkspacePath(config.workspaceDir, modulePath.src)
}

/**
 * Get the absolute path for a module's distribution directory.
 *
 * @param config - The TNMSC configuration
 * @param modulePath - The module paths (src/dist pair)
 * @returns The absolute distribution path
 */
export function getAbsoluteDistPath(config: TnmscConfig, modulePath: ModulePaths): string {
  return resolveWorkspacePath(config.workspaceDir, modulePath.dist)
}

/**
 * Get both absolute and relative paths for a module.
 *
 * @param config - The TNMSC configuration
 * @param modulePath - The module paths (src/dist pair)
 * @returns Resolved paths with both absolute and relative variants
 */
export function resolveModulePaths(
  config: TnmscConfig,
  modulePath: ModulePaths
): ResolvedModulePaths {
  return {
    absoluteSrc: getAbsoluteSrcPath(config, modulePath),
    absoluteDist: getAbsoluteDistPath(config, modulePath),
    relativeSrc: modulePath.src,
    relativeDist: modulePath.dist
  }
}

/**
 * Get the absolute workspace directory path.
 *
 * @param workspaceDir - The workspace directory (may contain ~)
 * @returns The absolute workspace directory path
 */
export function getAbsoluteWorkspaceDir(workspaceDir: string): string {
  return expandHomeDir(workspaceDir)
}

/**
 * Get the relative path from the workspace directory.
 *
 * @param workspaceDir - The workspace directory (may contain ~)
 * @param absolutePath - The absolute path to make relative
 * @returns The relative path from workspace
 */
export function getRelativePath(workspaceDir: string, absolutePath: string): string {
  const expandedWorkspace = expandHomeDir(workspaceDir)
  return path.relative(expandedWorkspace, absolutePath)
}

/**
 * Check if a path is absolute.
 *
 * @param inputPath - The path to check
 * @returns True if the path is absolute
 */
export function isAbsolutePath(inputPath: string): boolean {
  return path.isAbsolute(inputPath)
}

/**
 * Normalize a path for the current platform.
 *
 * @param inputPath - The path to normalize
 * @returns The normalized path
 */
export function normalizePath(inputPath: string): string {
  return path.normalize(inputPath)
}

/**
 * Join multiple path segments.
 *
 * @param segments - The path segments to join
 * @returns The joined path
 */
export function joinPath(...segments: string[]): string {
  return path.join(...segments)
}

/**
 * Get all resolved paths for the aindex configuration.
 *
 * @param config - The TNMSC configuration
 * @returns Object with all module paths resolved
 */
export function resolveAllAindexPaths(config: TnmscConfig): {
  skills: ResolvedModulePaths
  commands: ResolvedModulePaths
  subAgents: ResolvedModulePaths
  rules: ResolvedModulePaths
  globalPrompt: ResolvedModulePaths
  workspacePrompt: ResolvedModulePaths
  app: ResolvedModulePaths
  ext: ResolvedModulePaths
  arch: ResolvedModulePaths
} {
  const {aindex} = config

  return {
    skills: resolveModulePaths(config, aindex.skills),
    commands: resolveModulePaths(config, aindex.commands),
    subAgents: resolveModulePaths(config, aindex.subAgents),
    rules: resolveModulePaths(config, aindex.rules),
    globalPrompt: resolveModulePaths(config, aindex.globalPrompt),
    workspacePrompt: resolveModulePaths(config, aindex.workspacePrompt),
    app: resolveModulePaths(config, aindex.app),
    ext: resolveModulePaths(config, aindex.ext),
    arch: resolveModulePaths(config, aindex.arch)
  }
}

/**
 * Get a specific aindex module's resolved paths.
 *
 * @param config - The TNMSC configuration
 * @param moduleName - The name of the module
 * @returns The resolved module paths
 * @throws {ConfigPathError} If the module name is invalid
 */
export function getAindexModulePaths(
  config: TnmscConfig,
  moduleName: keyof TnmscConfig['aindex'] & string
): ResolvedModulePaths {
  const modulePaths = config.aindex[moduleName]

  if (modulePaths === void 0 || modulePaths === null || typeof modulePaths !== 'object' || !('src' in modulePaths)) {
    throw new ConfigPathError(
      config.workspaceDir,
      moduleName,
      `Invalid aindex module: ${moduleName}`
    )
  }

  return resolveModulePaths(config, modulePaths)
}
