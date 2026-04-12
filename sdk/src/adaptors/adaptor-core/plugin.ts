import type {MdxGlobalScope} from '@/md-compiler/globals'
import type {
  AindexConfig,
  CodeStylesOptions,
  FrontMatterOptions,
  PluginsConfig,
  ProtectionMode,
  SupportedPluginConfigKey,
  WindowsOptions
} from './ConfigTypes.schema'
import type {AdaptorKind} from './enums'
import type {InputCollectedContext, OutputCollectedContext} from './InputTypes'
import type {NativeDeskPathsBinding} from '@/core/desk-paths-types'
import type {ExecutionPlan} from '@/execution-plan'
import type {ILogger} from '@/libraries/logger'
import type {RuntimeCommand} from '@/runtime-command'
import {Buffer} from 'node:buffer'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {getNativeBinding} from '@/core/native-binding'
import {buildUsageDiagnostic, diagnosticLines} from '@/diagnostics'
import {filterPathScopedEntriesForExecutionPlan} from '@/execution-plan'

function isDirectoryStructureMismatchError(error: unknown): boolean {
  const binding = getNativeBinding<NativeDeskPathsBinding>()
  if (binding?.isDirectoryStructureMismatchError == null) {
    throw new Error('Native desk-paths binding is required. Build or install the Rust NAPI package before running tnmsc.')
  }
  return binding.isDirectoryStructureMismatchError(error instanceof Error ? error.message : String(error))
}

function findBlockingNonDirectoryPath(expectedDirPath: string): string | undefined {
  const binding = getNativeBinding<NativeDeskPathsBinding>()
  if (binding?.findBlockingNonDirectoryPath == null) {
    throw new Error('Native desk-paths binding is required. Build or install the Rust NAPI package before running tnmsc.')
  }
  return binding.findBlockingNonDirectoryPath(expectedDirPath)
}

function removeBlockingFile(blockingPath: string): {removed: boolean, error?: unknown} {
  const binding = getNativeBinding<NativeDeskPathsBinding>()
  if (binding?.removeBlockingFile == null || binding.existsSync == null) {
    throw new Error('Native desk-paths binding is required. Build or install the Rust NAPI package before running tnmsc.')
  }
  if (!binding.existsSync(blockingPath)) return {removed: false}
  try {
    const removed = binding.removeBlockingFile(blockingPath)
    return {removed}
  } catch (error) {
    return {removed: false, error}
  }
}

export type FastGlobType = typeof import('fast-glob')

/**
 * Opaque type for ScopeRegistry.
 * Concrete implementation lives in plugin-input-shared.
 */
export interface ScopeRegistryLike {
  resolve: (expression: string) => string
}

export interface DependencyNode {
  readonly name: string
  readonly log: ILogger
  readonly dependsOn?: readonly string[]
}

export interface Plugin<T extends AdaptorKind = AdaptorKind> extends DependencyNode {
  readonly type: T
}

export interface PluginContext {
  logger: ILogger
  fs: typeof import('node:fs')
  path: typeof import('node:path')
  glob: FastGlobType
}

export interface InputCapabilityContext extends PluginContext {
  readonly userConfigOptions: Required<AdaptorOptions>
  readonly dependencyContext: Partial<InputCollectedContext>
  readonly runtimeCommand?: RuntimeCommand

  readonly globalScope?: MdxGlobalScope

  readonly scopeRegistry?: ScopeRegistryLike
}

export interface InputCapability extends DependencyNode {
  collect: (ctx: InputCapabilityContext) => Partial<InputCollectedContext> | Promise<Partial<InputCollectedContext>>
}

export interface OutputRuntimeTargets {
  readonly jetbrainsCodexDirs: readonly string[]
}

/**
 * Context for output plugin operations
 */
export interface OutputAdaptorContext {
  readonly logger: ILogger
  readonly collectedOutputContext: OutputCollectedContext
  readonly pluginOptions?: AdaptorOptions
  readonly runtimeTargets: OutputRuntimeTargets
  readonly executionPlan: ExecutionPlan
}

/**
 * Context for output cleaning operations
 */
export interface OutputCleanContext extends OutputAdaptorContext {
  readonly dryRun?: boolean
}

/**
 * Context for output writing operations
 */
export interface OutputWriteContext extends OutputAdaptorContext {
  readonly dryRun?: boolean

  readonly registeredAdaptorNames?: readonly string[]
}

/**
 * Declarative host-home file that should be mirrored into configured WSL instances.
 */
export interface WslMirrorFileDeclaration {
  /** Source path on the Windows host, typically under ~ */
  readonly sourcePath: string
  /** Optional label for diagnostics/logging */
  readonly label?: string
}

/**
 * Result of a single write operation
 */
export interface WriteResult {
  readonly path: string
  readonly success: boolean
  readonly skipped?: boolean
  readonly error?: Error
}

/**
 * Collected results from write operations
 */
export interface WriteResults {
  readonly files: readonly WriteResult[]
  readonly dirs: readonly WriteResult[]
}

/**
 * Awaitable type for sync/async flexibility
 */
export type Awaitable<T> = T | Promise<T>

/**
 * Result of executing an input effect.
 * Used for preprocessing/cleaning input sources before collection.
 */
export interface InputEffectResult {
  /** Whether the effect executed successfully */
  readonly success: boolean
  /** Error details if the effect failed */
  readonly error?: Error
  /** Description of what the effect did (for logging) */
  readonly description?: string
  /** Files that were modified/created */
  readonly modifiedFiles?: readonly string[]
  /** Files that were deleted */
  readonly deletedFiles?: readonly string[]
}

/**
 * Context provided to input effect handlers.
 * Contains utilities and configuration for effect execution.
 */
export interface InputEffectContext {
  /** Logger instance */
  readonly logger: ILogger
  /** File system module */
  readonly fs: typeof import('node:fs')
  /** Path module */
  readonly path: typeof import('node:path')
  /** Glob module for file matching */
  readonly glob: FastGlobType
  /** Child process spawn function */
  readonly spawn: typeof import('node:child_process').spawn
  /** User configuration options */
  readonly userConfigOptions: Required<AdaptorOptions>
  /** Resolved workspace directory */
  readonly workspaceDir: string
  /** Resolved aindex directory */
  readonly aindexDir: string
  /** Whether running in dry-run mode */
  readonly dryRun?: boolean
}

/**
 * Handler function for input effects.
 * Receives the effect context and returns an effect result.
 */
export type InputEffectHandler = (ctx: InputEffectContext) => Awaitable<InputEffectResult>

/**
 * Registration entry for an input effect.
 */
export interface InputEffectRegistration {
  /** Descriptive name for logging */
  readonly name: string
  /** The effect handler function */
  readonly handler: InputEffectHandler
  /** Priority for execution order (lower = earlier, default: 0) */
  readonly priority?: number
}

/**
 * Result of resolving base paths from plugin options.
 */
export interface ResolvedBasePaths {
  /** The resolved workspace directory path */
  readonly workspaceDir: string
  /** The resolved aindex directory path */
  readonly aindexDir: string
}

/**
 * Represents a registered scope entry from a plugin.
 */
export interface AdaptorScopeRegistration {
  /** The namespace name (e.g., 'myPlugin') */
  readonly namespace: string
  /** Key-value pairs registered under this namespace */
  readonly values: Record<string, unknown>
}

/**
 * Output plugin interface.
 * Declarative write model only:
 * - Plugins declare target files
 * - Plugins convert source metadata to content
 * - Core runtime performs all file system operations
 */
export interface OutputAdaptor extends Plugin {
  readonly declarativeOutput: true
  readonly outputCapabilities: OutputAdaptorCapabilities

  declareOutputFiles: (ctx: OutputWriteContext) => Awaitable<readonly OutputFileDeclaration[]>

  convertContent: (declaration: OutputFileDeclaration, ctx: OutputWriteContext) => Awaitable<string | Buffer>

  declareCleanupPaths?: (ctx: OutputCleanContext) => Awaitable<OutputCleanupDeclarations>

  declareWslMirrorFiles?: (ctx: OutputWriteContext) => Awaitable<readonly WslMirrorFileDeclaration[]>
}

/**
 * Scope of a declared output file target.
 */
export type OutputDeclarationScope = 'project' | 'global'

/**
 * Supported output scope override topics.
 */
export const OUTPUT_SCOPE_TOPICS = ['prompt', 'rules', 'commands', 'subagents', 'skills', 'mcp'] as const

/**
 * Topic key for output scope override and capability declarations.
 */
export type OutputScopeTopic = (typeof OUTPUT_SCOPE_TOPICS)[number]

/**
 * Capability declaration for one output topic.
 * - scopes: allowed source scopes for selection/override
 * - singleScope: whether the topic resolves to a single scope by priority
 */
export interface OutputTopicCapability {
  readonly scopes: readonly OutputDeclarationScope[]
  readonly singleScope: boolean
}

/**
 * Per-plugin capability matrix for output topics.
 */
export type OutputAdaptorCapabilities = Partial<Record<OutputScopeTopic, OutputTopicCapability>>

/**
 * Declarative output file declaration.
 * Output plugins only declare target paths and source metadata.
 * Core runtime performs all file system write operations.
 */
export interface OutputFileDeclaration {
  /** Absolute target file path */
  readonly path: string
  /** Target scope classification for cleanup/routing */
  readonly scope?: OutputDeclarationScope
  /** Plugin-defined source descriptor for content conversion */
  readonly source: unknown
  /** Optional existing-file policy */
  readonly ifExists?: 'overwrite' | 'skip' | 'error'
  /** Optional label for logging */
  readonly label?: string
}

/**
 * Scope of declarative cleanup targets.
 */
export type OutputCleanupScope = OutputDeclarationScope | 'xdgConfig'

/**
 * Kind of cleanup target.
 */
export type OutputCleanupTargetKind = 'file' | 'directory' | 'glob'

/**
 * Declarative cleanup target.
 */
export interface OutputCleanupPathDeclaration {
  /** Absolute path or glob pattern */
  readonly path: string
  /** Target kind */
  readonly kind: OutputCleanupTargetKind
  /** Optional basename exclusions when expanding delete globs */
  readonly excludeBasenames?: readonly string[]
  /** Protection mode to apply when used in protect declarations */
  readonly protectionMode?: ProtectionMode
  /** Optional scope label for logging/trace */
  readonly scope?: OutputCleanupScope
  /** Optional label for diagnostics */
  readonly label?: string
}

/**
 * Optional cleanup declaration set for one output plugin.
 */
export interface OutputCleanupDeclarations {
  /** Paths/patterns that should be cleaned */
  readonly delete?: readonly OutputCleanupPathDeclaration[]
  /** Paths/patterns that must be protected from cleanup */
  readonly protect?: readonly OutputCleanupPathDeclaration[]
  /** Glob ignore patterns when expanding delete/protect globs */
  readonly excludeScanGlobs?: readonly string[]
}

function isNodeBufferLike(value: unknown): value is Buffer {
  return Buffer.isBuffer(value)
}

function normalizeWriteOperationError(targetPath: string, error: unknown): Error {
  if (!isDirectoryStructureMismatchError(error)) {
    return error instanceof Error ? error : new Error(String(error))
  }

  const blockingPath = findBlockingNonDirectoryPath(path.dirname(targetPath))
  if (blockingPath == null) {
    return error instanceof Error ? error : new Error(String(error))
  }

  return new Error(
    `Cannot write "${targetPath}" because a file is blocking a required directory path at "${blockingPath}". `
    + 'Delete that file and rerun tnmsc; you do not need to keep it.'
  )
}

function tryRecoverBlockingFileForWrite(targetPath: string, error: unknown, logger: Pick<ILogger, 'warn'>): boolean {
  if (!isDirectoryStructureMismatchError(error)) return false

  const blockingPath = findBlockingNonDirectoryPath(path.dirname(targetPath))
  if (blockingPath == null) return false

  const removal = removeBlockingFile(blockingPath)
  if (!removal.removed) return false

  logger.warn(
    buildUsageDiagnostic({
      code: 'BLOCKING_FILE_REMOVED_FOR_WRITE',
      title: 'Removed blocking file and continued output write',
      rootCause: diagnosticLines(`tnmsc deleted the blocking file at "${blockingPath}" so it could continue writing "${targetPath}".`),
      details: {
        targetPath,
        blockingPath
      }
    })
  )
  return true
}

interface OutputAdaptorEnablementRule {
  readonly configKey: SupportedPluginConfigKey
  readonly defaultEnabled: boolean
}

const OUTPUT_PLUGIN_ENABLEMENT_RULES: Readonly<Record<string, OutputAdaptorEnablementRule>> = {
  AgentsOutputAdaptor: {
    configKey: 'agentsMd',
    defaultEnabled: false
  },
  ClaudeCodeCLIOutputAdaptor: {
    configKey: 'claudeCode',
    defaultEnabled: false
  },
  CodexCLIOutputAdaptor: {
    configKey: 'codex',
    defaultEnabled: false
  },
  CursorOutputAdaptor: {
    configKey: 'cursor',
    defaultEnabled: false
  },
  DroidCLIOutputAdaptor: {
    configKey: 'droid',
    defaultEnabled: false
  },
  GeminiCLIOutputAdaptor: {
    configKey: 'gemini',
    defaultEnabled: false
  },
  GitExcludeOutputAdaptor: {
    configKey: 'git',
    defaultEnabled: true
  },
  JetBrainsAIAssistantCodexOutputAdaptor: {
    configKey: 'jetbrains',
    defaultEnabled: false
  },
  JetBrainsIDECodeStyleConfigOutputAdaptor: {
    configKey: 'jetbrainsCodeStyle',
    defaultEnabled: false
  },
  KiroCLIOutputAdaptor: {
    configKey: 'kiro',
    defaultEnabled: false
  },
  OpencodeCLIOutputAdaptor: {
    configKey: 'opencode',
    defaultEnabled: false
  },
  QoderIDEPluginOutputAdaptor: {
    configKey: 'qoder',
    defaultEnabled: false
  },
  ReadmeMdConfigFileOutputAdaptor: {
    configKey: 'readme',
    defaultEnabled: true
  },
  TraeIDEOutputAdaptor: {
    configKey: 'trae',
    defaultEnabled: false
  },
  TraeCNIDEOutputAdaptor: {
    configKey: 'traeCn',
    defaultEnabled: false
  },
  VisualStudioCodeIDEConfigOutputAdaptor: {
    configKey: 'vscode',
    defaultEnabled: false
  },
  WarpIDEOutputAdaptor: {
    configKey: 'warp',
    defaultEnabled: false
  },
  WindsurfOutputAdaptor: {
    configKey: 'windsurf',
    defaultEnabled: false
  },
  ZedIDEConfigOutputAdaptor: {
    configKey: 'zed',
    defaultEnabled: false
  }
}

function resolveConfiguredPluginEnabled(plugins: PluginsConfig | undefined, configKey: string): boolean | undefined {
  return plugins?.[configKey]
}

export function isOutputAdaptorEnabled(plugin: OutputAdaptor, pluginOptions?: AdaptorOptions): boolean {
  const enablementRule = OUTPUT_PLUGIN_ENABLEMENT_RULES[plugin.name]
  if (enablementRule == null) return true

  const configuredEnabled = resolveConfiguredPluginEnabled(pluginOptions?.plugins, enablementRule.configKey)
  if (configuredEnabled != null) return configuredEnabled

  return enablementRule.defaultEnabled
}

export async function collectOutputDeclarations(
  plugins: readonly OutputAdaptor[],
  ctx: OutputWriteContext
): Promise<Map<OutputAdaptor, readonly OutputFileDeclaration[]>> {
  const declarationEntries = await Promise.all(
    plugins.map(async plugin => {
      if (!isOutputAdaptorEnabled(plugin, ctx.pluginOptions)) {
        return [plugin, [] as OutputFileDeclaration[]] as const
      }

      const declarations = await plugin.declareOutputFiles(ctx)
      return [plugin, filterPathScopedEntriesForExecutionPlan(declarations, ctx.executionPlan, ctx.collectedOutputContext)] as const
    })
  )

  return new Map(declarationEntries)
}

/**
 * Execute declarative write operations for output plugins.
 * Core runtime owns file system writes; plugins only declare and convert content.
 */
export async function executeDeclarativeWriteOutputs(
  plugins: readonly OutputAdaptor[],
  ctx: OutputWriteContext,
  predeclaredOutputs?: ReadonlyMap<OutputAdaptor, readonly OutputFileDeclaration[]>
): Promise<Map<string, WriteResults>> {
  const results = new Map<string, WriteResults>()
  const outputDeclarations = predeclaredOutputs ?? await collectOutputDeclarations(plugins, ctx)

  for (const plugin of plugins) {
    const declarations = outputDeclarations.get(plugin) ?? []
    const fileResults: WriteResult[] = []

    for (const declaration of declarations) {
      if (ctx.dryRun === true) {
        fileResults.push({path: declaration.path, success: true, skipped: false})
        continue
      }

      let recoveredBlockingFile = false
      for (;;) {
        try {
          const parentDir = path.dirname(declaration.path)
          fs.mkdirSync(parentDir, {recursive: true})

          if (declaration.ifExists === 'skip' && fs.existsSync(declaration.path)) {
            fileResults.push({path: declaration.path, success: true, skipped: true})
            break
          }

          if (declaration.ifExists === 'error' && fs.existsSync(declaration.path)) {
            throw new Error(`Refusing to overwrite existing file: ${declaration.path}`)
          }

          const content = await plugin.convertContent(declaration, ctx)
          if (isNodeBufferLike(content)) fs.writeFileSync(declaration.path, content)
          else fs.writeFileSync(declaration.path, content, 'utf8')
          fileResults.push({path: declaration.path, success: true})
          break
        } catch (error) {
          if (!recoveredBlockingFile && tryRecoverBlockingFileForWrite(declaration.path, error, ctx.logger)) {
            recoveredBlockingFile = true
            continue
          }

          fileResults.push({
            path: declaration.path,
            success: false,
            error: normalizeWriteOperationError(declaration.path, error)
          })
          break
        }
      }
    }

    results.set(plugin.name, {files: fileResults, dirs: []})
  }

  return results
}

/**
 * Collected outputs from all plugins.
 * Used by the clean command to gather all artifacts for cleanup.
 */
export interface CollectedOutputs {
  readonly projectDirs: readonly string[]
  readonly projectFiles: readonly string[]
  readonly globalDirs: readonly string[]
  readonly globalFiles: readonly string[]
}

/**
 * Collect all outputs from all registered output plugins.
 * This is the main entry point for the clean command.
 */
export async function collectAllPluginOutputs(
  plugins: readonly OutputAdaptor[],
  ctx: OutputAdaptorContext,
  predeclaredOutputs?: ReadonlyMap<OutputAdaptor, readonly OutputFileDeclaration[]>
): Promise<CollectedOutputs> {
  const projectDirs: string[] = []
  const projectFiles: string[] = []
  const globalDirs: string[] = []
  const globalFiles: string[] = []

  const declarationGroups
    = predeclaredOutputs != null
      ? [...predeclaredOutputs.values()]
      : Array.from(await collectOutputDeclarations(plugins, {...ctx, dryRun: true}), ([, declarations]) => declarations)

  for (const declarations of declarationGroups) {
    for (const declaration of declarations) {
      if (declaration.scope === 'global') globalFiles.push(declaration.path)
      else projectFiles.push(declaration.path)
    }
  }

  return {
    projectDirs,
    projectFiles,
    globalDirs,
    globalFiles
  }
}

/**
 * Configuration to be processed by plugin.config.ts
 * Interpreted by plugin system as collection context
 * Path placeholder `~` resolves to the user home directory.
 *
 * @see InputCollectedContext - Input-side collected context
 * @see OutputCollectedContext - Output-side collected context
 */
export interface AdaptorOptions {
  readonly version?: string

  readonly workspaceDir?: string

  readonly aindex?: AindexConfig

  readonly frontMatter?: FrontMatterOptions

  readonly codeStyles?: CodeStylesOptions

  readonly windows?: WindowsOptions

  readonly plugins?: PluginsConfig

  logLevel?: 'trace' | 'debug' | 'info' | 'warn' | 'error'
}
