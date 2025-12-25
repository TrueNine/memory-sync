import type { CollectedInputContext, InputPlugin, InputPluginContext, OutputPlugin, PluginOptions } from '@/types'
import type { ConfigLoaderOptions, FastCommandSeriesOptions, FastCommandSeriesPluginOverride, UserConfigFile } from '@/types/ConfigTypes'
import * as fs from 'node:fs'
import * as path from 'node:path'
import process from 'node:process'
import glob from 'fast-glob'
import { loadUserConfig, validateAndEnsureGlobalConfig } from '@/ConfigLoader'
import {
  DEFAULT_GLOBAL_MEMORY_FILE,
  DEFAULT_SHADOW_FAST_COMMAND_DIR,
  DEFAULT_SHADOW_PROJECT_SUFFIX,
  DEFAULT_SHADOW_PROJECTS_DIR,
  DEFAULT_SHADOW_SKILL_SOURCE_DIR,
  DEFAULT_SHADOW_SUB_AGENT_DIR,
  DEFAULT_WORKSPACE_DIR,
} from '@/constants'
import { createLogger } from '@/log'
import { PluginPipeline } from '@/PluginPipeline'
import { PluginKind } from '@/types'

/**
 * Pipeline configuration containing collected context and output plugins
 */
export interface PipelineConfig {
  readonly context: CollectedInputContext
  readonly outputPlugins: readonly OutputPlugin[]
  readonly userConfigOptions: Required<PluginOptions>
}

const DEFAULT_OPTIONS: Required<PluginOptions> = {
  workspaceDir: DEFAULT_WORKSPACE_DIR,
  shadowSourceProjectDir: `$WORKSPACE/${DEFAULT_SHADOW_PROJECT_SUFFIX}`,
  shadowSkillSourceDir: DEFAULT_SHADOW_SKILL_SOURCE_DIR,
  shadowFastCommandDir: DEFAULT_SHADOW_FAST_COMMAND_DIR,
  shadowSubAgentDir: DEFAULT_SHADOW_SUB_AGENT_DIR,
  globalMemoryFile: DEFAULT_GLOBAL_MEMORY_FILE,
  shadowProjectsDir: DEFAULT_SHADOW_PROJECTS_DIR,
  externalProjects: [],
  excludePatterns: {},
  fastCommandSeriesOptions: {},
  plugins: [],
  logLevel: 'info',
}

/**
 * Convert UserConfigFile to PluginOptions
 * UserConfigFile is the JSON schema, PluginOptions includes plugins
 */
function userConfigToPluginOptions(userConfig: UserConfigFile): Partial<PluginOptions> {
  return {
    ...(userConfig.workspaceDir != null ? { workspaceDir: userConfig.workspaceDir } : {}),
    ...(userConfig.shadowSourceProjectDir != null ? { shadowSourceProjectDir: userConfig.shadowSourceProjectDir } : {}),
    ...(userConfig.shadowSkillSourceDir != null ? { shadowSkillSourceDir: userConfig.shadowSkillSourceDir } : {}),
    ...(userConfig.shadowFastCommandDir != null ? { shadowFastCommandDir: userConfig.shadowFastCommandDir } : {}),
    ...(userConfig.shadowSubAgentDir != null ? { shadowSubAgentDir: userConfig.shadowSubAgentDir } : {}),
    ...(userConfig.globalMemoryFile != null ? { globalMemoryFile: userConfig.globalMemoryFile } : {}),
    ...(userConfig.shadowProjectsDir != null ? { shadowProjectsDir: userConfig.shadowProjectsDir } : {}),
    ...(userConfig.externalProjects != null ? { externalProjects: userConfig.externalProjects } : {}),
    ...(userConfig.excludePatterns != null ? { excludePatterns: userConfig.excludePatterns } : {}),
    ...(userConfig.fastCommandSeriesOptions != null ? { fastCommandSeriesOptions: userConfig.fastCommandSeriesOptions } : {}),
    ...(userConfig.logLevel != null ? { logLevel: userConfig.logLevel } : {}),
  }
}

/**
 * Options for defineConfig
 */
export interface DefineConfigOptions {
  /**
   * Plugin options (programmatic configuration)
   */
  readonly pluginOptions?: PluginOptions

  /**
   * Config loader options
   */
  readonly configLoaderOptions?: ConfigLoaderOptions

  /**
   * Whether to load user config files (.tnmsc.json)
   * @default true
   */
  readonly loadUserConfig?: boolean

  /**
   * Current working directory for config file search
   * @default process.cwd()
   */
  readonly cwd?: string
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
  const overrideFastCommandSeries = override.fastCommandSeriesOptions

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
    // Deep merge for fastCommandSeriesOptions
    fastCommandSeriesOptions: mergeFastCommandSeriesOptions(base.fastCommandSeriesOptions, overrideFastCommandSeries),
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

function mergeFastCommandSeriesOptions(
  base?: FastCommandSeriesOptions,
  override?: FastCommandSeriesOptions,
): FastCommandSeriesOptions {
  if (override == null) {
    return base ?? {}
  }
  if (base == null) {
    return override
  }

  // Merge pluginOverrides deeply
  const mergedPluginOverrides: Record<string, FastCommandSeriesPluginOverride> = {}

  // Copy base plugin overrides
  if (base.pluginOverrides != null) {
    for (const [key, value] of Object.entries(base.pluginOverrides)) {
      mergedPluginOverrides[key] = { ...value }
    }
  }

  // Merge override plugin overrides
  if (override.pluginOverrides != null) {
    for (const [key, value] of Object.entries(override.pluginOverrides)) {
      mergedPluginOverrides[key] = {
        ...mergedPluginOverrides[key],
        ...value,
      }
    }
  }

  // Build result with conditional properties to satisfy exactOptionalPropertyTypes
  const includeSeriesPrefix = override.includeSeriesPrefix ?? base.includeSeriesPrefix
  const hasPluginOverrides = Object.keys(mergedPluginOverrides).length > 0

  if (includeSeriesPrefix != null && hasPluginOverrides) {
    return { includeSeriesPrefix, pluginOverrides: mergedPluginOverrides }
  }
  if (includeSeriesPrefix != null) {
    return { includeSeriesPrefix }
  }
  if (hasPluginOverrides) {
    return { pluginOverrides: mergedPluginOverrides }
  }
  return {}
}

/**
 * Check if options is DefineConfigOptions
 */
function isDefineConfigOptions(options: PluginOptions | DefineConfigOptions): options is DefineConfigOptions {
  return 'pluginOptions' in options || 'configLoaderOptions' in options || 'loadUserConfig' in options
}

/**
 * Define configuration with support for user config files.
 *
 * Configuration priority (highest to lowest):
 * 1. Programmatic options passed to defineConfig
 * 2. CWD config file (.tnmsc.json)
 * 3. Global config file (~/.aindex/.tnmsc.json)
 * 4. Default values
 *
 * @param options - Plugin options or DefineConfigOptions
 */
export function defineConfig(options: PluginOptions | DefineConfigOptions = {}): PipelineConfig {
  // Validate and ensure global config exists
  const validationResult = validateAndEnsureGlobalConfig()
  if (validationResult.shouldExit) {
    process.exit(1)
  }

  // Normalize options
  let pluginOptions: PluginOptions
  let shouldLoadUserConfig: boolean
  let cwd: string | undefined

  if (isDefineConfigOptions(options)) {
    pluginOptions = options.pluginOptions ?? {}
    shouldLoadUserConfig = options.loadUserConfig ?? true
    cwd = options.cwd
  } else {
    pluginOptions = options
    shouldLoadUserConfig = true
  }

  // Load user config if enabled
  let userConfigOptions: Partial<PluginOptions> = {}
  let userConfigFound = false
  let userConfigSources: readonly string[] = []

  if (shouldLoadUserConfig) {
    const userConfigResult = loadUserConfig(cwd)
    userConfigFound = userConfigResult.found
    userConfigSources = userConfigResult.sources
    if (userConfigResult.found) {
      userConfigOptions = userConfigToPluginOptions(userConfigResult.config)
    }
  }

  // Merge: defaults <- user config <- programmatic options
  const mergedOptions = mergeConfig(userConfigOptions, pluginOptions)
  const { plugins = [], logLevel } = mergedOptions
  const logger = createLogger('defineConfig', logLevel)

  // Log configuration loading info
  if (userConfigFound) {
    logger.info('user config loaded', { sources: userConfigSources })
  } else {
    logger.info('no user config found, using defaults', {
      workspaceDir: DEFAULT_OPTIONS.workspaceDir,
      shadowSourceProjectDir: DEFAULT_OPTIONS.shadowSourceProjectDir,
      shadowSkillSourceDir: DEFAULT_OPTIONS.shadowSkillSourceDir,
      shadowFastCommandDir: DEFAULT_OPTIONS.shadowFastCommandDir,
      shadowSubAgentDir: DEFAULT_OPTIONS.shadowSubAgentDir,
      globalMemoryFile: DEFAULT_OPTIONS.globalMemoryFile,
      shadowProjectsDir: DEFAULT_OPTIONS.shadowProjectsDir,
      logLevel: DEFAULT_OPTIONS.logLevel,
    })
  }

  // Base context without dependencyContext (will be provided by pipeline)
  const baseCtx: Omit<InputPluginContext, 'dependencyContext'> = {
    logger,
    userConfigOptions: mergedOptions,
    fs,
    path,
    glob,
  }

  // Filter plugins by type
  const inputPlugins = plugins.filter((p): p is InputPlugin => p.type === PluginKind.Input)
  const outputPlugins = plugins.filter((p): p is OutputPlugin => p.type === PluginKind.Output)

  // Use PluginPipeline to execute plugins in dependency order
  const pipeline = new PluginPipeline()
  const merged = pipeline.executePluginsInOrder(inputPlugins, baseCtx)

  // Validate workspace exists
  if (merged.workspace == null) {
    throw new Error('Workspace not initialized by any plugin')
  }

  const context: CollectedInputContext = {
    workspace: merged.workspace,
    ideConfigFiles: merged.ideConfigFiles ?? [],
    ...(merged.externalProjects != null && { externalProjects: merged.externalProjects }),
    ...(merged.fastCommands != null && { fastCommands: merged.fastCommands }),
    ...(merged.subAgents != null && { subAgents: merged.subAgents }),
    ...(merged.skills != null && { skills: merged.skills }),
    ...(merged.globalMemory != null && { globalMemory: merged.globalMemory }),
    ...(merged.aiAgentIgnoreConfigFiles != null && { aiAgentIgnoreConfigFiles: merged.aiAgentIgnoreConfigFiles }),
    ...(merged.shadowSourceProjectDir != null && { shadowSourceProjectDir: merged.shadowSourceProjectDir }),
    ...(merged.readmePrompts != null && { readmePrompts: merged.readmePrompts }),
  }

  return { context, outputPlugins, userConfigOptions: mergedOptions }
}
