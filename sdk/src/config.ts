import type {
  AindexConfig,
  CodeStylesOptions,
  ConfigLoaderOptions,
  PluginsConfig,
  UserConfigFile,
  WindowsOptions
} from './adaptors/adaptor-core/ConfigTypes.schema'
import type {InputCollectedContext, OutputCollectedContext} from './adaptors/adaptor-core/InputTypes'
import type {AdaptorOptions, OutputAdaptor} from './adaptors/adaptor-core/plugin'
import type {RuntimeCommand} from './runtime-command'
import * as path from 'node:path'
import process from 'node:process'
import {createLogger} from '@truenine/logger'
import {buildDefaultAindexConfig, mergeAindexConfig} from './adaptors/adaptor-core/AindexConfigDefaults'
import {
  buildDefaultCodeStylesOptions,
  mergeCodeStylesOptions
} from './adaptors/adaptor-core/ConfigTypes.schema'
import {PathPlaceholders} from './adaptors/adaptor-core/constants'
import {FilePathKind} from './adaptors/adaptor-core/enums'
import {toOutputCollectedContext} from './adaptors/adaptor-core/InputTypes'
import {checkVersionControl} from './Aindex'
import {getConfigLoader} from './ConfigLoader'
import {resolveExecutionPlan} from './execution-plan'
import {collectInputContext} from './inputs/runtime'
import {resolveUserPath} from './runtime-environment'

export interface PipelineConfig {
  readonly context: OutputCollectedContext
  readonly outputPlugins: readonly OutputAdaptor[]
  readonly userConfigOptions: Required<AdaptorOptions>
  readonly executionPlan: import('./execution-plan').ExecutionPlan
}

interface ResolvedPluginSetup {
  readonly mergedOptions: Required<AdaptorOptions>
  readonly outputPlugins: readonly OutputAdaptor[]
  readonly userConfigFile?: UserConfigFile
}

const DEFAULT_AINDEX: Required<AindexConfig> = buildDefaultAindexConfig()

type MergeableAdaptorOptions = Omit<Required<AdaptorOptions>, 'workspaceDir'> & {
  readonly workspaceDir?: string
}

const DEFAULT_OPTIONS: Omit<Required<AdaptorOptions>, 'workspaceDir'> = {
  version: '0.0.0',
  logLevel: 'info',
  aindex: DEFAULT_AINDEX,
  frontMatter: {
    blankLineAfter: true
  },
  codeStyles: buildDefaultCodeStylesOptions(),
  windows: {},
  plugins: {}
}

function resolveWorkspaceDirOption(workspaceDir: string | undefined, fallbackWorkspaceDir?: string): string {
  if (typeof workspaceDir === 'string' && workspaceDir.trim().length > 0) {
    return workspaceDir
  }

  return path.resolve(fallbackWorkspaceDir ?? process.cwd())
}

export function userConfigToAdaptorOptions(userConfig: UserConfigFile): Partial<AdaptorOptions> {
  return {
    ...userConfig.version != null ? {version: userConfig.version} : {},
    ...userConfig.workspaceDir != null ? {workspaceDir: userConfig.workspaceDir} : {},
    ...userConfig.frontMatter != null ? {frontMatter: userConfig.frontMatter} : {},
    ...userConfig.codeStyles != null ? {codeStyles: userConfig.codeStyles} : {},
    ...userConfig.windows != null ? {windows: userConfig.windows} : {},
    ...userConfig.plugins != null ? {plugins: userConfig.plugins} : {},
    ...userConfig.logLevel != null ? {logLevel: userConfig.logLevel} : {}
  }
}

export interface DefineConfigOptions {
  readonly pluginOptions?: AdaptorOptions

  readonly outputPlugins?: readonly OutputAdaptor[]

  readonly configLoaderOptions?: ConfigLoaderOptions

  readonly loadUserConfig?: boolean

  readonly cwd?: string

  readonly executionCwd?: string

  readonly runtimeCommand?: RuntimeCommand
}

export function mergeConfig(...configs: Partial<AdaptorOptions>[]): Required<AdaptorOptions> {
  return mergeConfigForRuntime(process.cwd(), ...configs)
}

export function mergeConfigForRuntime(
  fallbackWorkspaceDir: string | undefined,
  ...configs: Partial<AdaptorOptions>[]
): Required<AdaptorOptions> {
  const initialConfig: MergeableAdaptorOptions = {...DEFAULT_OPTIONS}
  const mergedConfig = configs.reduce((acc: MergeableAdaptorOptions, config) => mergeTwoConfigs(acc, config), initialConfig)

  return {
    ...mergedConfig,
    workspaceDir: resolveWorkspaceDirOption(mergedConfig.workspaceDir, fallbackWorkspaceDir)
  }
}

function mergeTwoConfigs(base: MergeableAdaptorOptions, override: Partial<AdaptorOptions>): MergeableAdaptorOptions {
  const overrideCodeStyles = override.codeStyles
  const overrideFrontMatter = override.frontMatter
  const overridePlugins = override.plugins
  const overrideWindows = override.windows

  return {
    ...base,
    ...override,
    aindex: mergeAindexConfig(base.aindex, override.aindex),
    codeStyles: mergeResolvedCodeStylesOptions(base.codeStyles, overrideCodeStyles),
    frontMatter: mergeFrontMatterOptions(base.frontMatter, overrideFrontMatter),
    plugins: mergePluginsOptions(base.plugins, overridePlugins),
    windows: mergeWindowsOptions(base.windows, overrideWindows)
  }
}

function mergeResolvedCodeStylesOptions(
  base: Required<AdaptorOptions>['codeStyles'],
  override?: CodeStylesOptions
): Required<AdaptorOptions>['codeStyles'] {
  return mergeCodeStylesOptions(base, override)
}

function mergeFrontMatterOptions(
  base: Required<AdaptorOptions>['frontMatter'],
  override?: AdaptorOptions['frontMatter']
): Required<AdaptorOptions>['frontMatter'] {
  if (override == null) return base
  return {
    ...base,
    ...override
  }
}

function mergePluginsOptions(base?: PluginsConfig, override?: PluginsConfig): PluginsConfig {
  if (override == null) return base ?? {}
  if (base == null) return override
  return {
    ...base,
    ...override
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

function isDefineConfigOptions(options: AdaptorOptions | DefineConfigOptions): options is DefineConfigOptions {
  return 'pluginOptions' in options
    || 'configLoaderOptions' in options
    || 'loadUserConfig' in options
    || 'cwd' in options
    || 'executionCwd' in options
    || 'runtimeCommand' in options
}

function resolvePathForMinimalContext(rawPath: string, workspaceDir: string): string {
  let resolvedPath = rawPath

  if (resolvedPath.includes(PathPlaceholders.WORKSPACE)) {
    resolvedPath = resolvedPath.replace(PathPlaceholders.WORKSPACE, workspaceDir)
  }

  return path.normalize(resolveUserPath(resolvedPath))
}

function createMinimalOutputCollectedContext(options: Required<AdaptorOptions>): OutputCollectedContext {
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

async function resolvePluginSetup(options: AdaptorOptions | DefineConfigOptions = {}): Promise<
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
    pluginOptions: AdaptorOptions,
    outputPlugins: readonly OutputAdaptor[],
    configLoaderOptions: ConfigLoaderOptions | undefined,
    runtimeCommand: RuntimeCommand | undefined

  if (isDefineConfigOptions(options)) {
    ({
      pluginOptions = {},
      outputPlugins = [],
      cwd,
      executionCwd,
      configLoaderOptions,
      runtimeCommand
    } = {
      pluginOptions: options.pluginOptions,
      outputPlugins: options.outputPlugins,
      cwd: options.cwd,
      executionCwd: options.executionCwd,
      configLoaderOptions: options.configLoaderOptions,
      runtimeCommand: options.runtimeCommand
    })
    shouldLoadUserConfig = options.loadUserConfig ?? true
  } else {
    pluginOptions = options
    outputPlugins = []
    shouldLoadUserConfig = true
    configLoaderOptions = void 0
    runtimeCommand = void 0
  }

  let userConfigOptions: Partial<AdaptorOptions> = {}
  let userConfigFound = false
  let userConfigSources: readonly string[] = []
  let userConfigFile: UserConfigFile | undefined

  if (shouldLoadUserConfig) {
    try {
      const userConfigResult = getConfigLoader(configLoaderOptions).load(cwd)
      userConfigFound = userConfigResult.found
      userConfigSources = userConfigResult.sources
      if (userConfigResult.found) {
        userConfigOptions = userConfigToAdaptorOptions(userConfigResult.config)
        userConfigFile = userConfigResult.config
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to load user config: ${errorMessage}`)
    }
  }

  const resolvedExecutionCwd = path.resolve(executionCwd ?? cwd ?? process.cwd())
  const mergedOptions = mergeConfigForRuntime(resolvedExecutionCwd, userConfigOptions, pluginOptions)
  const {logLevel} = mergedOptions
  const logger = createLogger('defineConfig', logLevel)

  if (userConfigFound) {
    logger.debug('User config loaded', {sources: userConfigSources})
  } else {
    logger.debug('Using defaults and programmatic config', {
      workspace: mergedOptions.workspaceDir,
      aindex: mergedOptions.aindex.dir,
      logLevel: mergedOptions.logLevel
    })
  }

  return {
    mergedOptions,
    outputPlugins,
    executionCwd: resolvedExecutionCwd,
    ...userConfigFile != null && {userConfigFile},
    ...runtimeCommand != null && {runtimeCommand},
    userConfigFound,
    userConfigSources
  }
}

export async function defineConfig(options: AdaptorOptions | DefineConfigOptions = {}): Promise<PipelineConfig> {
  const {mergedOptions, outputPlugins, userConfigFile, runtimeCommand, executionCwd} = await resolvePluginSetup(options)
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
    includeBuiltinEffects: true,
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
