import type { CollectedInputContext, InputPlugin, InputPluginContext, PluginOptions } from '@/types'
import * as fs from 'node:fs'
import * as path from 'node:path'
import glob from 'fast-glob'
import {
  DEFAULT_GLOBAL_MEMORY_FILE,
  DEFAULT_SHADOW_FAST_COMMAND_DIR,
  DEFAULT_SHADOW_PROJECT_SUFFIX,
  DEFAULT_SHADOW_SKILL_SOURCE_DIR,
  DEFAULT_SHADOW_SOURCE_PROJECT_DIR,
  DEFAULT_SHADOW_SUB_AGENT_DIR,
  DEFAULT_WORKSPACE_DIR,
} from '@/constants'
import { createLogger } from '@/log'
import { PluginPipeline } from '@/PluginPipeline'
import { PluginKind } from '@/types'

const DEFAULT_OPTIONS: Required<PluginOptions> = {
  workspaceDir: DEFAULT_WORKSPACE_DIR,
  shadowProjectDir: `$WORKSPACE/${DEFAULT_SHADOW_PROJECT_SUFFIX}`,
  shadowSkillSourceDir: DEFAULT_SHADOW_SKILL_SOURCE_DIR,
  shadowFastCommandDir: DEFAULT_SHADOW_FAST_COMMAND_DIR,
  shadowSubAgentDir: DEFAULT_SHADOW_SUB_AGENT_DIR,
  globalMemoryFile: DEFAULT_GLOBAL_MEMORY_FILE,
  shadowSourceProjectDir: DEFAULT_SHADOW_SOURCE_PROJECT_DIR,
  externalProjects: [],
  excludePatterns: {},
  plugins: [],
  logLevel: 'info',
}

/**
 * Merge multiple PluginOptions with default configuration.
 * Later options override earlier ones, arrays are concatenated.
 * Similar to vite/vitest mergeConfig.
 */
export function mergeConfig(
  ...configs: Partial<PluginOptions>[]
): Required<PluginOptions> {
  return configs.reduce<Required<PluginOptions>>(
    (acc, config) => mergeTwoConfigs(acc, config),
    { ...DEFAULT_OPTIONS },
  )
}

function mergeTwoConfigs(
  base: Required<PluginOptions>,
  override: Partial<PluginOptions>,
): Required<PluginOptions> {
  const overrideExternal = override.externalProjects
  const overridePlugins = override.plugins
  const overrideExclude = override.excludePatterns

  return {
    ...base,
    ...override,
    // Array concatenation for externalProjects
    externalProjects: [
      ...base.externalProjects,
      ...(overrideExternal ?? []),
    ],
    // Array concatenation for plugins
    plugins: [
      ...base.plugins,
      ...(overridePlugins ?? []),
    ],
    // Deep merge for excludePatterns
    excludePatterns: mergeExcludePatterns(base.excludePatterns, overrideExclude),
  }
}

function mergeExcludePatterns(
  a?: Record<string, string[]>,
  b?: Record<string, string[]>,
): Record<string, string[]> {
  const result: Record<string, string[]> = { ...a }
  if (b) {
    for (const [key, patterns] of Object.entries(b)) {
      result[key] = [...(result[key] ?? []), ...patterns]
    }
  }
  return result
}

export function defineConfig(options: PluginOptions = {}): CollectedInputContext {
  const { plugins = [], logLevel } = mergeConfig(options)
  const logger = createLogger('defineConfig', logLevel)

  // Base context without dependencyContext (will be provided by pipeline)
  const baseCtx: Omit<InputPluginContext, 'dependencyContext'> = {
    logger,
    userConfigOptions: options,
    fs,
    path,
    glob,
  }

  // Filter input plugins
  const inputPlugins = plugins.filter((p): p is InputPlugin => p.type === PluginKind.Input)

  // Use PluginPipeline to execute plugins in dependency order
  const pipeline = new PluginPipeline()
  const merged = pipeline.executePluginsInOrder(inputPlugins, baseCtx)

  // Validate workspace exists
  if (merged.workspace == null) {
    throw new Error('Workspace not initialized by any plugin')
  }

  return {
    workspace: merged.workspace,
    ideConfigFiles: merged.ideConfigFiles ?? [],
    ...(merged.externalProjects != null && { externalProjects: merged.externalProjects }),
    ...(merged.fastCommands != null && { fastCommands: merged.fastCommands }),
    ...(merged.subAgents != null && { subAgents: merged.subAgents }),
    ...(merged.skills != null && { skills: merged.skills }),
    ...(merged.globalMemory != null && { globalMemory: merged.globalMemory }),
  }
}
