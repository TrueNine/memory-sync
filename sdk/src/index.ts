import type {MergedConfigResult} from './ConfigLoader'
import type {MemorySyncAdaptorInfo, MemorySyncCommandResult, MemorySyncSdkBinding} from './internal/sdk-binding'
import {getNativeBinding} from './core/native-binding'
import {createTsFallbackMemorySyncBinding} from './internal/sdk-binding'

type JsonResult<T> = T | Promise<T>

interface NativeJsonCommandBinding {
  readonly loadConfig?: (cwd?: string) => JsonResult<string>
  readonly install?: (optionsJson?: string) => JsonResult<string>
  readonly dryRun?: (optionsJson?: string) => JsonResult<string>
  readonly clean?: (optionsJson?: string) => JsonResult<string>
  readonly listAdaptors?: () => JsonResult<string>
  readonly listPrompts?: (optionsJson?: string) => JsonResult<string>
  readonly getPrompt?: (promptId: string, optionsJson?: string) => JsonResult<string>
  readonly upsertPromptSource?: (inputJson: string) => JsonResult<string>
  readonly writePromptArtifacts?: (inputJson: string) => JsonResult<string>
}

interface NativeMemorySyncSdkBinding extends Partial<Omit<MemorySyncSdkBinding, keyof NativeJsonCommandBinding>>, NativeJsonCommandBinding {}

let memorySyncSdkBinding: MemorySyncSdkBinding | undefined

function isMemorySyncSdkBinding(value: unknown): value is MemorySyncSdkBinding {
  if (value == null || typeof value !== 'object') return false
  const candidate = value as Partial<MemorySyncSdkBinding>
  return (
    typeof candidate.loadConfig === 'function'
    && typeof candidate.install === 'function'
    && typeof candidate.dryRun === 'function'
    && typeof candidate.clean === 'function'
    && typeof candidate.listAdaptors === 'function'
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
    && typeof candidate.listAdaptors === 'function'
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

function createHybridBinding(nativeBinding: Required<NativeJsonCommandBinding>): MemorySyncSdkBinding {
  return {
    loadConfig: async cwd => parseJsonResult<MergedConfigResult>(nativeBinding.loadConfig(cwd)),
    install: async options => parseJsonResult<MemorySyncCommandResult>(nativeBinding.install(options == null ? void 0 : JSON.stringify(options))),
    dryRun: async options => parseJsonResult<MemorySyncCommandResult>(nativeBinding.dryRun(options == null ? void 0 : JSON.stringify(options))),
    clean: async options => parseJsonResult<MemorySyncCommandResult>(nativeBinding.clean(options == null ? void 0 : JSON.stringify(options))),
    listAdaptors: async () => parseJsonResult<readonly MemorySyncAdaptorInfo[]>(nativeBinding.listAdaptors()),
    listPrompts: async options => parseJsonResult<readonly unknown[]>(nativeBinding.listPrompts(options == null ? void 0 : JSON.stringify(options))),
    getPrompt: async (promptId, options) => parseJsonResult<unknown>(nativeBinding.getPrompt(promptId, options == null ? void 0 : JSON.stringify(options))),
    upsertPromptSource: async input => parseJsonResult<unknown>(nativeBinding.upsertPromptSource(JSON.stringify(input))),
    writePromptArtifacts: async input => parseJsonResult<unknown>(nativeBinding.writePromptArtifacts(JSON.stringify(input)))
  } as MemorySyncSdkBinding
}

export function getMemorySyncSdkBinding(): MemorySyncSdkBinding {
  if (memorySyncSdkBinding != null) return memorySyncSdkBinding

  const nativeBinding = getNativeBinding<NativeMemorySyncSdkBinding>()
  const fallbackBinding = createTsFallbackMemorySyncBinding()

  if (hasNativeCommandBinding(nativeBinding)) {
    memorySyncSdkBinding = createHybridBinding(nativeBinding)
    return memorySyncSdkBinding
  }

  if (isMemorySyncSdkBinding(nativeBinding)) {
    memorySyncSdkBinding = nativeBinding
    return memorySyncSdkBinding
  }

  memorySyncSdkBinding = fallbackBinding
  return memorySyncSdkBinding
}

export type {
  MergedConfigResult
} from './ConfigLoader'
export {
  createTsFallbackMemorySyncBinding
} from './internal/sdk-binding'
export type {
  MemorySyncAdaptorInfo,
  MemorySyncCommandOptions,
  MemorySyncCommandResult,
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
