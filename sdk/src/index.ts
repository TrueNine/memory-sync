import type {MergedConfigResult} from './ConfigLoader'
import type {MemorySyncCommandResult, MemorySyncPluginInfo, MemorySyncSdkBinding} from './internal/sdk-binding'
import process from 'node:process'
import {getNativeBinding} from './core/native-binding'
import {
  createTsFallbackMemorySyncBinding

} from './internal/sdk-binding'

type JsonResult<T> = T | Promise<T>

interface NativeJsonCommandBinding {
  readonly loadConfig?: (cwd?: string) => JsonResult<string>
  readonly install?: (optionsJson?: string) => JsonResult<string>
  readonly dryRun?: (optionsJson?: string) => JsonResult<string>
  readonly clean?: (optionsJson?: string) => JsonResult<string>
  readonly listPlugins?: () => JsonResult<string>
}

interface NativeMemorySyncSdkBinding
  extends Partial<Omit<MemorySyncSdkBinding, keyof NativeJsonCommandBinding>>, NativeJsonCommandBinding {}

let memorySyncSdkBinding: MemorySyncSdkBinding | undefined

function shouldDisableNativeCommandBinding(): boolean {
  return process.env['TNMSC_DISABLE_NATIVE_COMMAND_BINDING'] === '1'
}

function isMemorySyncSdkBinding(value: unknown): value is MemorySyncSdkBinding {
  if (value == null || typeof value !== 'object') return false
  const candidate = value as Partial<MemorySyncSdkBinding>
  return typeof candidate.loadConfig === 'function'
    && typeof candidate.install === 'function'
    && typeof candidate.dryRun === 'function'
    && typeof candidate.clean === 'function'
    && typeof candidate.listPlugins === 'function'
    && typeof candidate.listPrompts === 'function'
    && typeof candidate.getPrompt === 'function'
    && typeof candidate.upsertPromptSource === 'function'
    && typeof candidate.writePromptArtifacts === 'function'
}

function hasNativeCommandBinding(value: unknown): value is Required<NativeJsonCommandBinding> {
  if (value == null || typeof value !== 'object') return false
  const candidate = value as Partial<NativeJsonCommandBinding>
  return typeof candidate.loadConfig === 'function'
    && typeof candidate.install === 'function'
    && typeof candidate.dryRun === 'function'
    && typeof candidate.clean === 'function'
    && typeof candidate.listPlugins === 'function'
}

async function parseJsonResult<T>(value: JsonResult<string>): Promise<T> {
  const raw = await value
  return JSON.parse(raw) as T
}

function createHybridBinding(
  nativeBinding: Required<NativeJsonCommandBinding>,
  fallbackBinding: MemorySyncSdkBinding
): MemorySyncSdkBinding {
  return {
    loadConfig: async cwd => parseJsonResult<MergedConfigResult>(nativeBinding.loadConfig(cwd)),
    install: async options => parseJsonResult<MemorySyncCommandResult>(
      nativeBinding.install(options == null ? void 0 : JSON.stringify(options))
    ),
    dryRun: async options => parseJsonResult<MemorySyncCommandResult>(
      nativeBinding.dryRun(options == null ? void 0 : JSON.stringify(options))
    ),
    clean: async options => parseJsonResult<MemorySyncCommandResult>(
      nativeBinding.clean(options == null ? void 0 : JSON.stringify(options))
    ),
    listPlugins: async () => parseJsonResult<readonly MemorySyncPluginInfo[]>(
      nativeBinding.listPlugins()
    ),
    listPrompts: fallbackBinding.listPrompts,
    getPrompt: fallbackBinding.getPrompt,
    upsertPromptSource: fallbackBinding.upsertPromptSource,
    writePromptArtifacts: fallbackBinding.writePromptArtifacts
  }
}

export function getMemorySyncSdkBinding(): MemorySyncSdkBinding {
  if (memorySyncSdkBinding != null) return memorySyncSdkBinding

  const nativeBinding = getNativeBinding<NativeMemorySyncSdkBinding>()
  if (shouldDisableNativeCommandBinding()) {
    memorySyncSdkBinding = createTsFallbackMemorySyncBinding()
    return memorySyncSdkBinding
  }

  if (isMemorySyncSdkBinding(nativeBinding)) {
    memorySyncSdkBinding = nativeBinding
    return nativeBinding
  }

  const fallbackBinding = createTsFallbackMemorySyncBinding()
  if (hasNativeCommandBinding(nativeBinding)) {
    memorySyncSdkBinding = createHybridBinding(nativeBinding, fallbackBinding)
    return memorySyncSdkBinding
  }

  memorySyncSdkBinding = fallbackBinding
  return memorySyncSdkBinding
}

export type {
  MergedConfigResult
} from './ConfigLoader'
export type {
  MemorySyncCommandOptions,
  MemorySyncCommandResult,
  MemorySyncPluginInfo,
  MemorySyncPromptServiceOptions,
  MemorySyncSdkBinding,
  PublicLoggerDiagnosticRecord
} from './internal/sdk-binding'
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
