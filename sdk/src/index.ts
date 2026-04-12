import type {MergedConfigResult} from './ConfigLoader'
import type {MemorySyncAdaptorInfo, MemorySyncCommandResult, MemorySyncSdkBinding} from './internal/sdk-binding'
import {existsSync} from 'node:fs'
import process from 'node:process'
import {fileURLToPath} from 'node:url'
import {getNativeBinding} from './core/native-binding'

type JsonResult<T> = T | Promise<T>
const INTERNAL_COMMAND_BRIDGE_ENV = 'TNMSC_INTERNAL_COMMAND_BRIDGE'

interface NativeJsonCommandBinding {
  readonly loadConfig?: (cwd?: string) => JsonResult<string>
  readonly install?: (optionsJson?: string) => JsonResult<string>
  readonly dryRun?: (optionsJson?: string) => JsonResult<string>
  readonly clean?: (optionsJson?: string) => JsonResult<string>
  readonly listPlugins?: () => JsonResult<string>
  readonly listAdaptors?: () => JsonResult<string>
  readonly listPrompts?: (optionsJson?: string) => JsonResult<string>
  readonly getPrompt?: (promptId: string, optionsJson?: string) => JsonResult<string>
  readonly upsertPromptSource?: (inputJson: string) => JsonResult<string>
  readonly writePromptArtifacts?: (inputJson: string) => JsonResult<string>
}

interface NativeMemorySyncSdkBinding extends Partial<Omit<MemorySyncSdkBinding, keyof NativeJsonCommandBinding>>, NativeJsonCommandBinding {}

let memorySyncSdkBinding: MemorySyncSdkBinding | undefined

function hasListAdaptorsMethod(value: Partial<NativeJsonCommandBinding>): boolean {
  return typeof value.listAdaptors === 'function' || typeof value.listPlugins === 'function'
}

function getNativeListAdaptors(
  nativeBinding: Required<Omit<NativeJsonCommandBinding, 'listPlugins' | 'listAdaptors'>> & NativeJsonCommandBinding
): () => JsonResult<string> {
  if (typeof nativeBinding.listAdaptors === 'function') return nativeBinding.listAdaptors
  if (typeof nativeBinding.listPlugins === 'function') return nativeBinding.listPlugins
  throw new Error('Native memory-sync SDK binding is missing listPlugins/listAdaptors')
}

function requireNativeCommandBinding(): NativeMemorySyncSdkBinding {
  const nativeBinding = getNativeBinding<NativeMemorySyncSdkBinding>()
  if (nativeBinding == null) {
    throw new Error('Native memory-sync SDK binding is required. Build or install the Rust NAPI package before running tnmsc.')
  }
  return nativeBinding
}

function isMemorySyncSdkBinding(value: unknown): value is MemorySyncSdkBinding {
  if (value == null || typeof value !== 'object') return false
  const candidate = value as Partial<MemorySyncSdkBinding>
  return (
    typeof candidate.loadConfig === 'function'
    && typeof candidate.install === 'function'
    && typeof candidate.dryRun === 'function'
    && typeof candidate.clean === 'function'
    && hasListAdaptorsMethod(candidate as unknown as Partial<NativeJsonCommandBinding>)
    && typeof candidate.listPrompts === 'function'
    && typeof candidate.getPrompt === 'function'
    && typeof candidate.upsertPromptSource === 'function'
    && typeof candidate.writePromptArtifacts === 'function'
  )
}

function hasNativeCommandBinding(value: unknown): value is Required<NativeJsonCommandBinding> {
  if (value == null || typeof value !== 'object') return false
  const candidate = value as Partial<NativeJsonCommandBinding>
  return (
    typeof candidate.loadConfig === 'function'
    && typeof candidate.install === 'function'
    && typeof candidate.dryRun === 'function'
    && typeof candidate.clean === 'function'
    && hasListAdaptorsMethod(candidate)
    && typeof candidate.listPrompts === 'function'
    && typeof candidate.getPrompt === 'function'
    && typeof candidate.upsertPromptSource === 'function'
    && typeof candidate.writePromptArtifacts === 'function'
  )
}

async function parseJsonResult<T>(value: JsonResult<string>): Promise<T> {
  const raw = await value
  return JSON.parse(raw) as T
}

function ensureInternalCommandBridgeEnv(): void {
  if ((process.env[INTERNAL_COMMAND_BRIDGE_ENV] ?? '').length > 0) return

  const bridgeCandidates = [
    fileURLToPath(new URL('./internal/native-command-bridge.mjs', import.meta.url)),
    fileURLToPath(new URL('./native-command-bridge.mjs', import.meta.url))
  ]

  const bridgePath = bridgeCandidates.find(candidate => existsSync(candidate))
  if (bridgePath == null) return

  process.env[INTERNAL_COMMAND_BRIDGE_ENV] = bridgePath
}

function createHybridBinding(nativeBinding: Required<NativeJsonCommandBinding>): MemorySyncSdkBinding {
  const listAdaptors = getNativeListAdaptors(nativeBinding)
  return {
    loadConfig: async cwd => parseJsonResult<MergedConfigResult>(nativeBinding.loadConfig(cwd)),
    install: async options => {
      ensureInternalCommandBridgeEnv()
      return parseJsonResult<MemorySyncCommandResult>(
        nativeBinding.install(options == null ? void 0 : JSON.stringify(options))
      )
    },
    dryRun: async options => {
      ensureInternalCommandBridgeEnv()
      return parseJsonResult<MemorySyncCommandResult>(
        nativeBinding.dryRun(options == null ? void 0 : JSON.stringify(options))
      )
    },
    clean: async options => {
      ensureInternalCommandBridgeEnv()
      return parseJsonResult<MemorySyncCommandResult>(
        nativeBinding.clean(options == null ? void 0 : JSON.stringify(options))
      )
    },
    listAdaptors: async () => parseJsonResult<readonly MemorySyncAdaptorInfo[]>(listAdaptors()),
    listPrompts: async options => parseJsonResult<readonly unknown[]>(nativeBinding.listPrompts(options == null ? void 0 : JSON.stringify(options))),
    getPrompt: async (promptId, options) => parseJsonResult<unknown>(nativeBinding.getPrompt(promptId, options == null ? void 0 : JSON.stringify(options))),
    upsertPromptSource: async input => parseJsonResult<unknown>(nativeBinding.upsertPromptSource(JSON.stringify(input))),
    writePromptArtifacts: async input => parseJsonResult<unknown>(nativeBinding.writePromptArtifacts(JSON.stringify(input)))
  } as MemorySyncSdkBinding
}

export function getMemorySyncSdkBinding(): MemorySyncSdkBinding {
  if (memorySyncSdkBinding != null) return memorySyncSdkBinding

  const nativeBinding = requireNativeCommandBinding()

  if (hasNativeCommandBinding(nativeBinding)) {
    memorySyncSdkBinding = createHybridBinding(nativeBinding)
    return memorySyncSdkBinding
  }

  if (isMemorySyncSdkBinding(nativeBinding)) {
    memorySyncSdkBinding = nativeBinding
    return memorySyncSdkBinding
  }

  throw new Error('Native memory-sync SDK binding is missing required command methods.')
}

export type {
  MergedConfigResult
} from './ConfigLoader'
export {
  createNativeBindingLoader
} from './core/native-binding-loader'
export type {
  NativeBindingLoaderOptions,
  PlatformBinding
} from './core/native-binding-loader'
export type {
  MemorySyncAdaptorInfo,
  MemorySyncCommandOptions,
  MemorySyncCommandResult,
  MemorySyncPromptServiceOptions,
  MemorySyncSdkBinding,
  PublicLoggerDiagnosticRecord
} from './internal/sdk-binding'
export {
  createTsFallbackMemorySyncBinding
} from './internal/sdk-binding'
export {
  clearBufferedDiagnostics,
  createLogger,
  drainBufferedDiagnostics,
  flushOutput,
  getGlobalLogLevel,
  setGlobalLogLevel
} from './libraries/logger'
export type {
  DiagnosticLines,
  ILogger,
  LoggerDiagnosticInput,
  LoggerDiagnosticLevel,
  LoggerDiagnosticRecord,
  LogLevel
} from './libraries/logger'
export {
  defineProxy,
  getProxyModuleConfig,
  loadProxyModule,
  resolvePublicPath,
  resolvePublicPathUnchecked,
  validatePublicPath
} from './libraries/script-runtime'
export type {
  ProxyCommand,
  ProxyContext,
  ProxyDefinition,
  ProxyMatcherConfig,
  ProxyModule,
  ProxyModuleConfig,
  ProxyRouteHandler,
  ValidatePublicPathOptions
} from './libraries/script-runtime'
export {
  buildPromptTomlArtifact,
  buildTomlDocument,
  mdxToMd
} from './md-compiler'
export type {
  BuildPromptTomlArtifactOptions,
  BuildTomlDocumentOptions,
  EvaluationScope,
  ExportMetadata,
  MdxFlowExpression,
  MdxGlobalScope,
  MdxjsEsm,
  MdxJsxFlowElement,
  MdxJsxTextElement,
  MdxTextExpression,
  MdxToMdOptions,
  MdxToMdResult,
  Root,
  RootContent
} from './md-compiler'
export {
  CompilerDiagnosticError,
  createCompilerDiagnostic,
  ExportParseError,
  formatCompilerDiagnostic,
  ScopeError,
  UndefinedNamespaceError,
  UndefinedVariableError
} from './md-compiler/errors'
export type {
  CompilerDiagnostic,
  CompilerDiagnosticContext,
  CompilerDiagnosticPoint,
  CompilerDiagnosticPosition,
  FormatCompilerDiagnosticOptions
} from './md-compiler/errors'
export {
  OsKind,
  ShellKind,
  ToolPresets
} from './md-compiler/globals'
export type {
  CodeStylePreferences,
  EnvironmentContext,
  MdComponent,
  OsInfo,
  ToolReferences,
  UserProfile
} from './md-compiler/globals'
export {
  buildFrontMatter,
  buildMarkdownWithFrontMatter,
  buildMarkdownWithRawFrontMatter,
  buildRawFrontMatter,
  doubleQuoted,
  parseMarkdown,
  transformMdxReferencesToMd,
  wrapRawFrontMatter
} from './md-compiler/markdown'
export type {
  BuildMarkdownOptions,
  ParsedMarkdown
} from './md-compiler/markdown'
export type {
  ListPromptsOptions,
  ManagedPromptKind,
  PromptArtifactState,
  PromptCatalogItem,
  PromptDetails,
  PromptServiceOptions,
  PromptSourceLocale,
  UpsertPromptSourceInput,
  WritePromptArtifactsInput
} from './prompts'
