import type {
  AindexConfig,
  CleanupProtectionOptions,
  CommandSeriesOptions,
  CommandSeriesPluginOverride,
  ConfigLoaderOptions,
  InputCapability,
  InputCollectedContext,
  OutputCollectedContext,
  OutputPlugin,
  OutputScopeOptions,
  PluginOptions,
  PluginOutputScopeTopics,
  UserConfigFile,
  WindowsOptions
} from './plugins/plugin-core'
import type {RuntimeCommand} from './runtime-command'
import * as path from 'node:path'
import process from 'node:process'
import {createLogger} from '@truenine/logger'
import {checkVersionControl} from './Aindex'
import {getConfigLoader} from './ConfigLoader'
import {resolveExecutionPlan} from './execution-plan'
import {collectInputContext} from './inputs/runtime'
import {
  buildDefaultAindexConfig,
  FilePathKind,
  mergeAindexConfig,
  PathPlaceholders,
  toOutputCollectedContext,
  validateOutputScopeOverridesForPlugins
} from './plugins/plugin-core'
import {resolveUserPath} from './runtime-environment'

/**
 * Pipeline configuration containing collected context and output plugins
 */
export interface PipelineConfig {
  readonly context: OutputCollectedContext
  readonly outputPlugins: readonly OutputPlugin[]
  readonly userConfigOptions: Required<PluginOptions>
  readonly executionPlan: import('./execution-plan').ExecutionPlan
}

interface ResolvedPluginSetup {
  readonly mergedOptions: Required<PluginOptions>
  readonly outputPlugins: readonly OutputPlugin[]
  readonly inputCapabilities: readonly InputCapability[]
  readonly userConfigFile?: UserConfigFile
}

function isOutputPlugin(plugin: InputCapability | OutputPlugin): plugin is OutputPlugin {
  return 'declarativeOutput' in plugin
}

function isInputCapability(plugin: InputCapability | OutputPlugin): plugin is InputCapability {
  return 'collect' in plugin && !isOutputPlugin(plugin)
}

const DEFAULT_AINDEX: Required<AindexConfig> = buildDefaultAindexConfig()

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
  windows: {},
  plugins: []
}

/**
 * Convert UserConfigFile to PluginOptions
 * UserConfigFile is the JSON schema, PluginOptions includes plugins
 */
export function userConfigToPluginOptions(userConfig: UserConfigFile): Partial<PluginOptions> {
  return {
    ...userConfig.version != null ? {version: userConfig.version} : {},
    ...userConfig.workspaceDir != null ? {workspaceDir: userConfig.workspaceDir} : {},
    ...userConfig.commandSeriesOptions != null ? {commandSeriesOptions: userConfig.commandSeriesOptions} : {},
    ...userConfig.outputScopes != null ? {outputScopes: userConfig.outputScopes} : {},
    ...userConfig.frontMatter != null ? {frontMatter: userConfig.frontMatter} : {},
    ...userConfig.cleanupProtection != null ? {cleanupProtection: userConfig.cleanupProtection} : {},
    ...userConfig.windows != null ? {windows: userConfig.windows} : {},
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

  readonly executionCwd?: string

  readonly runtimeCommand?: RuntimeCommand
}

/**
 * Merge multiple PluginOptions with default configuration.
 * Later options override earlier ones.
 * Similar to vite/vitest mergeConfig.
 */
export function mergeConfig(...configs: Partial<PluginOptions>[]): Required<PluginOptions> {
  const initialConfig: Required<PluginOptions> = {...DEFAULT_OPTIONS}
  return configs.reduce((acc: Required<PluginOptions>, config) => mergeTwoConfigs(acc, config), initialConfig)
}

function mergeTwoConfigs(base: Required<PluginOptions>, override: Partial<PluginOptions>): Required<PluginOptions> {
  const overridePlugins = override.plugins
  const overrideCommandSeries = override.commandSeriesOptions
  const overrideOutputScopes = override.outputScopes
  const overrideFrontMatter = override.frontMatter
  const overrideCleanupProtection = override.cleanupProtection
  const overrideWindows = override.windows

  return {
    ...base,
    ...override,
    aindex: mergeAindexConfig(base.aindex, override.aindex),
    plugins: [
      // Array concatenation for plugins
      ...base.plugins,
      ...overridePlugins ?? []
    ],
    commandSeriesOptions: mergeCommandSeriesOptions(base.commandSeriesOptions, overrideCommandSeries), // Deep merge for commandSeriesOptions
    outputScopes: mergeOutputScopeOptions(base.outputScopes, overrideOutputScopes),
    frontMatter: mergeFrontMatterOptions(base.frontMatter, overrideFrontMatter),
    cleanupProtection: mergeCleanupProtectionOptions(base.cleanupProtection, overrideCleanupProtection),
    windows: mergeWindowsOptions(base.windows, overrideWindows)
  }
}

function mergeCommandSeriesOptions(base?: CommandSeriesOptions, override?: CommandSeriesOptions): CommandSeriesOptions {
  if (override == null) return base ?? {}
  if (base == null) return override

  const mergedPluginOverrides: Record<string, CommandSeriesPluginOverride> = {} // Merge pluginOverrides deeply

  if (base.pluginOverrides != null) {
    // Copy base plugin overrides
    for (const [key, value] of Object.entries(base.pluginOverrides)) mergedPluginOverrides[key] = {...value}
  }

  if (override.pluginOverrides != null) {
    // Merge override plugin overrides
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

function mergeOutputScopeTopics(base?: PluginOutputScopeTopics, override?: PluginOutputScopeTopics): PluginOutputScopeTopics | undefined {
  if (base == null && override == null) return void 0
  if (base == null) return override
  if (override == null) return base
  return {...base, ...override}
}

function mergeOutputScopeOptions(base?: OutputScopeOptions, override?: OutputScopeOptions): OutputScopeOptions {
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

function mergeCleanupProtectionOptions(base?: CleanupProtectionOptions, override?: CleanupProtectionOptions): CleanupProtectionOptions {
  if (override == null) return base ?? {}
  if (base == null) return override

  return {
    rules: [...base.rules ?? [], ...override.rules ?? []]
  }
}

function mergeWindowsOptions(base?: WindowsOptions, override?: WindowsOptions): WindowsOptions {
  if (override == null) return base ?? {}
  if (base == null) return override

  const baseWsl2 = base.wsl2
  const overrideWsl2 = override.wsl2

  return {
    ...base,
    ...override,
    ...baseWsl2 != null || overrideWsl2 != null
      ? {
          wsl2: {
            ...baseWsl2,
            ...overrideWsl2
          }
        }
      : {}
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
    || 'executionCwd' in options
    || 'runtimeCommand' in options
}

function getProgrammaticPluginDeclaration(options: PluginOptions | DefineConfigOptions): {
  readonly hasExplicitProgrammaticPlugins: boolean
  readonly explicitProgrammaticPlugins?: PluginOptions['plugins']
} {
  if (isDefineConfigOptions(options)) {
    return {
      hasExplicitProgrammaticPlugins: Object.hasOwn(options.pluginOptions ?? {}, 'plugins'),
      explicitProgrammaticPlugins: options.pluginOptions?.plugins
    }
  }

  return {
    hasExplicitProgrammaticPlugins: Object.hasOwn(options, 'plugins'),
    explicitProgrammaticPlugins: options.plugins
  }
}

function resolvePathForMinimalContext(rawPath: string, workspaceDir: string): string {
  let resolvedPath = rawPath

  if (resolvedPath.includes(PathPlaceholders.WORKSPACE)) {
    resolvedPath = resolvedPath.replace(PathPlaceholders.WORKSPACE, workspaceDir)
  }

  return path.normalize(resolveUserPath(resolvedPath))
}

function createMinimalOutputCollectedContext(options: Required<PluginOptions>): OutputCollectedContext {
  const workspaceDir = resolvePathForMinimalContext(options.workspaceDir, '')
  const aindexDir = path.join(workspaceDir, options.aindex.dir)

  return toOutputCollectedContext({
    workspace: {
      directory: {
        pathKind: FilePathKind.Absolute,
        path: workspaceDir,
        getDirectoryName: () => path.basename(workspaceDir)
      },
      projects: []
    },
    aindexDir
  })
}

function shouldUsePluginsFastPath(runtimeCommand?: RuntimeCommand): boolean {
  return runtimeCommand === 'plugins'
}

async function resolvePluginSetup(options: PluginOptions | DefineConfigOptions = {}): Promise<
  ResolvedPluginSetup & {
    readonly executionCwd: string
    readonly runtimeCommand?: RuntimeCommand
    readonly userConfigFound: boolean
    readonly userConfigSources: readonly string[]
  }
> {
  let shouldLoadUserConfig: boolean,
    cwd: string | undefined,
    executionCwd: string | undefined,
    pluginOptions: PluginOptions,
    configLoaderOptions: ConfigLoaderOptions | undefined,
    runtimeCommand: RuntimeCommand | undefined

  if (isDefineConfigOptions(options)) {
    ({
      pluginOptions = {},
      cwd,
      executionCwd,
      configLoaderOptions,
      runtimeCommand
    } = {
      pluginOptions: options.pluginOptions,
      cwd: options.cwd,
      executionCwd: options.executionCwd,
      configLoaderOptions: options.configLoaderOptions,
      runtimeCommand: options.runtimeCommand
    })
    shouldLoadUserConfig = options.loadUserConfig ?? true
  } else {
    pluginOptions = options
    shouldLoadUserConfig = true
    configLoaderOptions = void 0
    runtimeCommand = void 0
  }

  let userConfigOptions: Partial<PluginOptions> = {}
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
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to load user config: ${errorMessage}`)
    }
  }

  const mergedOptions = mergeConfig(userConfigOptions, pluginOptions)
  const {plugins = [], logLevel} = mergedOptions
  const logger = createLogger('defineConfig', logLevel)
  const resolvedExecutionCwd = path.resolve(executionCwd ?? cwd ?? process.cwd())

  if (userConfigFound) {
    logger.info('user config loaded', {sources: userConfigSources})
  } else {
    logger.info('no user config found, using defaults/programmatic options', {
      workspaceDir: mergedOptions.workspaceDir,
      aindexDir: mergedOptions.aindex.dir,
      logLevel: mergedOptions.logLevel
    })
  }

  const outputPlugins = plugins.filter(isOutputPlugin)
  const inputCapabilities = plugins.filter(isInputCapability)
  validateOutputScopeOverridesForPlugins(outputPlugins, mergedOptions)

  return {
    mergedOptions,
    outputPlugins,
    inputCapabilities,
    executionCwd: resolvedExecutionCwd,
    ...userConfigFile != null && {userConfigFile},
    ...runtimeCommand != null && {runtimeCommand},
    userConfigFound,
    userConfigSources
  }
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
  const {hasExplicitProgrammaticPlugins, explicitProgrammaticPlugins} = getProgrammaticPluginDeclaration(options)
  const {mergedOptions, outputPlugins, inputCapabilities, userConfigFile, runtimeCommand, executionCwd} = await resolvePluginSetup(options)
  const logger = createLogger('defineConfig', mergedOptions.logLevel)

  if (shouldUsePluginsFastPath(runtimeCommand)) {
    const context = createMinimalOutputCollectedContext(mergedOptions)
    return {
      context,
      outputPlugins,
      userConfigOptions: mergedOptions,
      executionPlan: resolveExecutionPlan(context, executionCwd)
    }
  }

  const merged = await collectInputContext({
    userConfigOptions: mergedOptions,
    ...inputCapabilities.length > 0 ? {capabilities: inputCapabilities} : {},
    includeBuiltinEffects: !(inputCapabilities.length > 0 || (hasExplicitProgrammaticPlugins && (explicitProgrammaticPlugins?.length ?? 0) === 0)),
    ...runtimeCommand != null ? {runtimeCommand} : {},
    ...userConfigFile != null ? {userConfig: userConfigFile} : {}
  })

  if (merged.workspace == null) throw new Error('Workspace not initialized by any plugin')

  const inputContext: InputCollectedContext = {
    workspace: merged.workspace,
    ...merged.vscodeConfigFiles != null && {vscodeConfigFiles: merged.vscodeConfigFiles},
    ...merged.zedConfigFiles != null && {zedConfigFiles: merged.zedConfigFiles},
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

  if (merged.aindexDir != null) {
    checkVersionControl(merged.aindexDir, logger)
  }

  return {
    context,
    outputPlugins,
    userConfigOptions: mergedOptions,
    executionPlan: resolveExecutionPlan(context, executionCwd)
  }
}
