import type {CollectedInputContext, InputPlugin, InputPluginContext, OutputPlugin, PluginOptions} from '@/types'
import type {ConfigLoaderOptions, FastCommandSeriesOptions, FastCommandSeriesPluginOverride, ShadowSourceProjectConfig, UserConfigFile} from '@/types/ConfigTypes'
import * as fs from 'node:fs'
import * as path from 'node:path'
import process from 'node:process'
import glob from 'fast-glob'
import {loadUserConfig, validateAndEnsureGlobalConfig} from '@/ConfigLoader'
import {DEFAULT_USER_CONFIG} from '@/constants'
import {createLogger} from '@/log'
import {PluginPipeline} from '@/PluginPipeline'
import {checkVersionControl} from '@/ShadowSourceProject'
import {PluginKind} from '@/types'

/**
 * Pipeline configuration containing collected context and output plugins
 */
export interface PipelineConfig {
  readonly context: CollectedInputContext
  readonly outputPlugins: readonly OutputPlugin[]
  readonly userConfigOptions: Required<PluginOptions>
}

const DEFAULT_SHADOW_SOURCE_PROJECT: Required<ShadowSourceProjectConfig> = {
  name: 'tnmsc-shadow',
  skill: {src: 'src/skills', dist: 'dist/skills'},
  fastCommand: {src: 'src/commands', dist: 'dist/commands'},
  subAgent: {src: 'src/agents', dist: 'dist/agents'},
  rule: {src: 'src/rules', dist: 'dist/rules'},
  globalMemory: {src: 'app/global.cn.mdx', dist: 'dist/global.mdx'},
  workspaceMemory: {src: 'app/workspace.cn.mdx', dist: 'dist/app/workspace.mdx'},
  project: {src: 'app', dist: 'dist/app'}
}

const DEFAULT_OPTIONS: Required<PluginOptions> = {
  ...DEFAULT_USER_CONFIG,
  shadowSourceProject: DEFAULT_SHADOW_SOURCE_PROJECT,
  fastCommandSeriesOptions: {},
  plugins: []
}

/**
 * Convert UserConfigFile to PluginOptions
 * UserConfigFile is the JSON schema, PluginOptions includes plugins
 */
function userConfigToPluginOptions(userConfig: UserConfigFile): Partial<PluginOptions> {
  return {
    ...userConfig.version != null ? {version: userConfig.version} : {},
    ...userConfig.workspaceDir != null ? {workspaceDir: userConfig.workspaceDir} : {},
    ...userConfig.shadowSourceProject != null ? {shadowSourceProject: userConfig.shadowSourceProject} : {},
    ...userConfig.fastCommandSeriesOptions != null ? {fastCommandSeriesOptions: userConfig.fastCommandSeriesOptions} : {},
    ...userConfig.logLevel != null ? {logLevel: userConfig.logLevel} : {}
  }
}

/**
 * Options for defineConfig
 */
export interface DefineConfigOptions {
  readonly pluginOptions?: PluginOptions

  readonly configLoaderOptions?: ConfigLoaderOptions

  readonly loadUserConfig?: boolean

  readonly cwd?: string
}

/**
 * Merge multiple PluginOptions with default configuration.
 * Later options override earlier ones.
 * Similar to vite/vitest mergeConfig.
 */
export function mergeConfig(
  ...configs: Partial<PluginOptions>[]
): Required<PluginOptions> {
  return configs.reduce<Required<PluginOptions>>(
    (acc, config) => mergeTwoConfigs(acc, config),
    {...DEFAULT_OPTIONS}
  )
}

function mergeTwoConfigs(
  base: Required<PluginOptions>,
  override: Partial<PluginOptions>
): Required<PluginOptions> {
  const overridePlugins = override.plugins
  const overrideFastCommandSeries = override.fastCommandSeriesOptions

  return {
    ...base,
    ...override,
    shadowSourceProject: mergeShadowSourceProject(base.shadowSourceProject, override.shadowSourceProject),
    plugins: [ // Array concatenation for plugins
      ...base.plugins,
      ...overridePlugins ?? []
    ],
    fastCommandSeriesOptions: mergeFastCommandSeriesOptions(base.fastCommandSeriesOptions, overrideFastCommandSeries) // Deep merge for fastCommandSeriesOptions
  }
}

function mergeShadowSourceProject(
  base: ShadowSourceProjectConfig,
  override?: ShadowSourceProjectConfig
): ShadowSourceProjectConfig {
  if (override == null) return base
  return {
    name: override.name ?? base.name,
    skill: {...base.skill, ...override.skill},
    fastCommand: {...base.fastCommand, ...override.fastCommand},
    subAgent: {...base.subAgent, ...override.subAgent},
    rule: {...base.rule, ...override.rule},
    globalMemory: {...base.globalMemory, ...override.globalMemory},
    workspaceMemory: {...base.workspaceMemory, ...override.workspaceMemory},
    project: {...base.project, ...override.project}
  }
}

function mergeFastCommandSeriesOptions(
  base?: FastCommandSeriesOptions,
  override?: FastCommandSeriesOptions
): FastCommandSeriesOptions {
  if (override == null) return base ?? {}
  if (base == null) return override

  const mergedPluginOverrides: Record<string, FastCommandSeriesPluginOverride> = {} // Merge pluginOverrides deeply

  if (base.pluginOverrides != null) { // Copy base plugin overrides
    for (const [key, value] of Object.entries(base.pluginOverrides)) mergedPluginOverrides[key] = {...value}
  }

  if (override.pluginOverrides != null) { // Merge override plugin overrides
    for (const [key, value] of Object.entries(override.pluginOverrides)) {
      mergedPluginOverrides[key] = {
        ...mergedPluginOverrides[key],
        ...value
      }
    }
  }

  const includeSeriesPrefix = override.includeSeriesPrefix ?? base.includeSeriesPrefix // Build result with conditional properties to satisfy exactOptionalPropertyTypes
  const hasPluginOverrides = Object.keys(mergedPluginOverrides).length > 0

  if (includeSeriesPrefix != null && hasPluginOverrides) return {includeSeriesPrefix, pluginOverrides: mergedPluginOverrides}
  if (includeSeriesPrefix != null) return {includeSeriesPrefix}
  if (hasPluginOverrides) return {pluginOverrides: mergedPluginOverrides}
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
export async function defineConfig(options: PluginOptions | DefineConfigOptions = {}): Promise<PipelineConfig> {
  const validationResult = validateAndEnsureGlobalConfig() // Validate and ensure global config exists
  if (validationResult.shouldExit) process.exit(1)

  let shouldLoadUserConfig: boolean, // Normalize options
    cwd: string | undefined,
    pluginOptions: PluginOptions

  if (isDefineConfigOptions(options)) {
    ({pluginOptions = {}, cwd} = {pluginOptions: options.pluginOptions, cwd: options.cwd})
    shouldLoadUserConfig = options.loadUserConfig ?? true
  } else {
    pluginOptions = options
    shouldLoadUserConfig = true
  }

  let userConfigOptions: Partial<PluginOptions> = {} // Load user config if enabled
  let userConfigFound = false
  let userConfigSources: readonly string[] = []
  let userConfigFile: UserConfigFile | undefined

  if (shouldLoadUserConfig) {
    const userConfigResult = loadUserConfig(cwd)
    userConfigFound = userConfigResult.found
    userConfigSources = userConfigResult.sources
    if (userConfigResult.found) {
      userConfigOptions = userConfigToPluginOptions(userConfigResult.config)
      userConfigFile = userConfigResult.config
    }
  }

  const mergedOptions = mergeConfig(userConfigOptions, pluginOptions) // Merge: defaults <- user config <- programmatic options
  const {plugins = [], logLevel} = mergedOptions
  const logger = createLogger('defineConfig', logLevel)

  if (userConfigFound) logger.info('user config loaded', {sources: userConfigSources}) // Log configuration loading info
  else {
    logger.info('no user config found, using defaults', {
      workspaceDir: DEFAULT_OPTIONS.workspaceDir,
      shadowSourceProjectName: DEFAULT_OPTIONS.shadowSourceProject.name,
      logLevel: DEFAULT_OPTIONS.logLevel
    })
  }

  const baseCtx: Omit<InputPluginContext, 'dependencyContext' | 'globalScope' | 'scopeRegistry'> = { // Base context without dependencyContext, globalScope, scopeRegistry (will be provided by pipeline)
    logger,
    userConfigOptions: mergedOptions,
    fs,
    path,
    glob
  }

  const inputPlugins = plugins.filter((p): p is InputPlugin => p.type === PluginKind.Input) // Filter plugins by type
  const outputPlugins = plugins.filter((p): p is OutputPlugin => p.type === PluginKind.Output)

  const pipeline = new PluginPipeline() // Pass userConfigFile for GlobalScopeCollector to access profile and tool // Use PluginPipeline to execute plugins in dependency order
  const merged = await pipeline.executePluginsInOrder(inputPlugins, baseCtx, false, userConfigFile)

  if (merged.workspace == null) throw new Error('Workspace not initialized by any plugin') // Validate workspace exists

  const context: CollectedInputContext = {
    workspace: merged.workspace,
    ideConfigFiles: merged.ideConfigFiles ?? [],
    ...merged.fastCommands != null && {fastCommands: merged.fastCommands},
    ...merged.subAgents != null && {subAgents: merged.subAgents},
    ...merged.skills != null && {skills: merged.skills},
    ...merged.rules != null && {rules: merged.rules},
    ...merged.globalMemory != null && {globalMemory: merged.globalMemory},
    ...merged.aiAgentIgnoreConfigFiles != null && {aiAgentIgnoreConfigFiles: merged.aiAgentIgnoreConfigFiles},
    ...merged.shadowSourceProjectDir != null && {shadowSourceProjectDir: merged.shadowSourceProjectDir},
    ...merged.readmePrompts != null && {readmePrompts: merged.readmePrompts},
    ...merged.globalGitIgnore != null && {globalGitIgnore: merged.globalGitIgnore},
    ...merged.shadowGitExclude != null && {shadowGitExclude: merged.shadowGitExclude}
  }

  if (merged.shadowSourceProjectDir != null) checkVersionControl(merged.shadowSourceProjectDir, logger) // Check version control status for shadow source project

  return {context, outputPlugins, userConfigOptions: mergedOptions}
}
