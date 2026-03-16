import type {
  AindexConfig,
  CleanupProtectionOptions,
  CommandSeriesOptions,
  CommandSeriesPluginOverride,
  ConfigLoaderOptions,
  InputCollectedContext,
  InputPlugin,
  InputPluginContext,
  OutputCollectedContext,
  OutputPlugin,
  OutputScopeOptions,
  PluginOptions,
  PluginOutputScopeTopics,
  UserConfigFile
} from './plugins/plugin-core'
import * as fs from 'node:fs'
import * as path from 'node:path'
import glob from 'fast-glob'
import {checkVersionControl} from './Aindex'
import {getConfigLoader} from './ConfigLoader'
import {PluginPipeline} from './PluginPipeline'
import {
  createLogger,
  PluginKind,
  toOutputCollectedContext,
  validateOutputScopeOverridesForPlugins
} from './plugins/plugin-core'

/**
 * Pipeline configuration containing collected context and output plugins
 */
export interface PipelineConfig {
  readonly context: OutputCollectedContext
  readonly outputPlugins: readonly OutputPlugin[]
  readonly userConfigOptions: Required<PluginOptions>
}

const DEFAULT_AINDEX: Required<AindexConfig> = {
  dir: 'aindex',
  skills: {src: 'skills', dist: 'dist/skills'},
  commands: {src: 'commands', dist: 'dist/commands'},
  subAgents: {src: 'subagents', dist: 'dist/subagents'},
  rules: {src: 'rules', dist: 'dist/rules'},
  globalPrompt: {src: 'global.src.mdx', dist: 'dist/global.mdx'},
  workspacePrompt: {src: 'workspace.src.mdx', dist: 'dist/workspace.mdx'},
  app: {src: 'app', dist: 'dist/app'},
  ext: {src: 'ext', dist: 'dist/ext'},
  arch: {src: 'arch', dist: 'dist/arch'}
}

const DEFAULT_OPTIONS: Required<PluginOptions> = {
  version: '0.0.0',
  workspaceDir: '~/project',
  logLevel: 'info',
  aindex: DEFAULT_AINDEX,
  commandSeriesOptions: {},
  outputScopes: {},
  frontMatter: {
    blankLineAfter: true
  },
  cleanupProtection: {},
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
    ...userConfig.aindex != null ? {aindex: userConfig.aindex} : {},
    ...userConfig.commandSeriesOptions != null ? {commandSeriesOptions: userConfig.commandSeriesOptions} : {},
    ...userConfig.outputScopes != null ? {outputScopes: userConfig.outputScopes} : {},
    ...userConfig.frontMatter != null ? {frontMatter: userConfig.frontMatter} : {},
    ...userConfig.cleanupProtection != null ? {cleanupProtection: userConfig.cleanupProtection} : {},
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

  readonly pipelineArgs?: readonly string[]
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
  const overrideCommandSeries = override.commandSeriesOptions
  const overrideOutputScopes = override.outputScopes
  const overrideFrontMatter = override.frontMatter
  const overrideCleanupProtection = override.cleanupProtection

  return {
    ...base,
    ...override,
    aindex: mergeAindex(base.aindex, override.aindex),
    plugins: [ // Array concatenation for plugins
      ...base.plugins,
      ...overridePlugins ?? []
    ],
    commandSeriesOptions: mergeCommandSeriesOptions(base.commandSeriesOptions, overrideCommandSeries), // Deep merge for commandSeriesOptions
    outputScopes: mergeOutputScopeOptions(base.outputScopes, overrideOutputScopes),
    frontMatter: mergeFrontMatterOptions(base.frontMatter, overrideFrontMatter),
    cleanupProtection: mergeCleanupProtectionOptions(base.cleanupProtection, overrideCleanupProtection)
  }
}

function mergeAindex(
  base: AindexConfig,
  override?: AindexConfig
): AindexConfig {
  if (override == null) return base
  return {
    dir: override.dir ?? base.dir,
    skills: {...base.skills, ...override.skills},
    commands: {...base.commands, ...override.commands},
    subAgents: {...base.subAgents, ...override.subAgents},
    rules: {...base.rules, ...override.rules},
    globalPrompt: {...base.globalPrompt, ...override.globalPrompt},
    workspacePrompt: {...base.workspacePrompt, ...override.workspacePrompt},
    app: {...base.app, ...override.app},
    ext: {...base.ext, ...override.ext},
    arch: {...base.arch, ...override.arch}
  }
}

function mergeCommandSeriesOptions(
  base?: CommandSeriesOptions,
  override?: CommandSeriesOptions
): CommandSeriesOptions {
  if (override == null) return base ?? {}
  if (base == null) return override

  const mergedPluginOverrides: Record<string, CommandSeriesPluginOverride> = {} // Merge pluginOverrides deeply

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

function mergeOutputScopeTopics(
  base?: PluginOutputScopeTopics,
  override?: PluginOutputScopeTopics
): PluginOutputScopeTopics | undefined {
  if (base == null && override == null) return void 0
  if (base == null) return override
  if (override == null) return base
  return {...base, ...override}
}

function mergeOutputScopeOptions(
  base?: OutputScopeOptions,
  override?: OutputScopeOptions
): OutputScopeOptions {
  if (override == null) return base ?? {}
  if (base == null) return override

  const mergedPlugins: Record<string, PluginOutputScopeTopics> = {}
  if (base.plugins != null) {
    for (const [pluginName, topics] of Object.entries(base.plugins)) {
      if (topics != null) mergedPlugins[pluginName] = {...topics}
    }
  }
  if (override.plugins != null) {
    for (const [pluginName, topics] of Object.entries(override.plugins)) {
      const mergedTopics = mergeOutputScopeTopics(mergedPlugins[pluginName], topics)
      if (mergedTopics != null) mergedPlugins[pluginName] = mergedTopics
    }
  }

  if (Object.keys(mergedPlugins).length === 0) return {}
  return {plugins: mergedPlugins}
}

function mergeFrontMatterOptions(
  base: Required<PluginOptions>['frontMatter'],
  override?: PluginOptions['frontMatter']
): Required<PluginOptions>['frontMatter'] {
  if (override == null) return base
  return {
    ...base,
    ...override
  }
}

function mergeCleanupProtectionOptions(
  base?: CleanupProtectionOptions,
  override?: CleanupProtectionOptions
): CleanupProtectionOptions {
  if (override == null) return base ?? {}
  if (base == null) return override

  return {
    rules: [
      ...base.rules ?? [],
      ...override.rules ?? []
    ]
  }
}

/**
 * Check if options is DefineConfigOptions
 */
function isDefineConfigOptions(options: PluginOptions | DefineConfigOptions): options is DefineConfigOptions {
  return 'pluginOptions' in options
    || 'configLoaderOptions' in options
    || 'loadUserConfig' in options
    || 'cwd' in options
    || 'pipelineArgs' in options
}

/**
 * Define configuration with support for user config files.
 *
 * Configuration priority (highest to lowest):
 * 1. Programmatic options passed to defineConfig
 * 2. Global config file (~/.aindex/.tnmsc.json)
 * 3. Default values
 *
 * @param options - Plugin options or DefineConfigOptions
 */
export async function defineConfig(options: PluginOptions | DefineConfigOptions = {}): Promise<PipelineConfig> {
  let shouldLoadUserConfig: boolean, // Normalize options
    cwd: string | undefined,
    pluginOptions: PluginOptions,
    configLoaderOptions: ConfigLoaderOptions | undefined,
    pipelineArgs: readonly string[] | undefined

  if (isDefineConfigOptions(options)) {
    ({
      pluginOptions = {},
      cwd,
      configLoaderOptions,
      pipelineArgs
    } = {
      pluginOptions: options.pluginOptions,
      cwd: options.cwd,
      configLoaderOptions: options.configLoaderOptions,
      pipelineArgs: options.pipelineArgs
    })
    shouldLoadUserConfig = options.loadUserConfig ?? true
  } else {
    pluginOptions = options
    shouldLoadUserConfig = true
    configLoaderOptions = void 0
    pipelineArgs = void 0
  }

  let userConfigOptions: Partial<PluginOptions> = {} // Load user config if enabled
  let userConfigFound = false
  let userConfigSources: readonly string[] = []
  let userConfigFile: UserConfigFile | undefined

  if (shouldLoadUserConfig) {
    try {
      const userConfigResult = getConfigLoader(configLoaderOptions).load(cwd)
      userConfigFound = userConfigResult.found
      userConfigSources = userConfigResult.sources
      if (userConfigResult.found) {
        userConfigOptions = userConfigToPluginOptions(userConfigResult.config)
        userConfigFile = userConfigResult.config
      }
    }
    catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to load user config: ${errorMessage}`)
    }
  }

  const mergedOptions = mergeConfig(userConfigOptions, pluginOptions) // Merge: defaults <- user config <- programmatic options
  const {plugins = [], logLevel} = mergedOptions
  const logger = createLogger('defineConfig', logLevel)

  if (userConfigFound) logger.info('user config loaded', {sources: userConfigSources})
  else {
    logger.info('no user config found, using defaults/programmatic options', {
      workspaceDir: mergedOptions.workspaceDir,
      aindexDir: mergedOptions.aindex.dir,
      logLevel: mergedOptions.logLevel
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
  validateOutputScopeOverridesForPlugins(outputPlugins, mergedOptions)

  const pipeline = pipelineArgs != null
    ? new PluginPipeline(...pipelineArgs)
    : new PluginPipeline() // Pass userConfigFile for GlobalScopeCollector to access profile and tool // Use PluginPipeline to execute plugins in dependency order
  const merged = await pipeline.executePluginsInOrder(inputPlugins, baseCtx, false, userConfigFile)

  if (merged.workspace == null) throw new Error('Workspace not initialized by any plugin') // Validate workspace exists

  const inputContext: InputCollectedContext = {
    workspace: merged.workspace,
    ...merged.vscodeConfigFiles != null && {vscodeConfigFiles: merged.vscodeConfigFiles},
    ...merged.jetbrainsConfigFiles != null && {jetbrainsConfigFiles: merged.jetbrainsConfigFiles},
    ...merged.editorConfigFiles != null && {editorConfigFiles: merged.editorConfigFiles},
    ...merged.commands != null && {commands: merged.commands},
    ...merged.subAgents != null && {subAgents: merged.subAgents},
    ...merged.skills != null && {skills: merged.skills},
    ...merged.rules != null && {rules: merged.rules},
    ...merged.globalMemory != null && {globalMemory: merged.globalMemory},
    ...merged.aiAgentIgnoreConfigFiles != null && {aiAgentIgnoreConfigFiles: merged.aiAgentIgnoreConfigFiles},
    ...merged.aindexDir != null && {aindexDir: merged.aindexDir},
    ...merged.readmePrompts != null && {readmePrompts: merged.readmePrompts},
    ...merged.globalGitIgnore != null && {globalGitIgnore: merged.globalGitIgnore},
    ...merged.shadowGitExclude != null && {shadowGitExclude: merged.shadowGitExclude}
  }

  const context = toOutputCollectedContext(inputContext)

  if (merged.aindexDir != null) checkVersionControl(merged.aindexDir, logger) // Check version control status for aindex

  return {context, outputPlugins, userConfigOptions: mergedOptions}
}
