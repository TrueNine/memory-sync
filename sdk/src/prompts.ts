import type {AdaptorOptions, YAMLFrontMatter} from '@/adaptors/adaptor-core'
import {getNativeBinding} from './core/native-binding'

export type ManagedPromptKind
  = | 'global-memory'
    | 'workspace-memory'
    | 'project-memory'
    | 'project-child-memory'
    | 'skill'
    | 'skill-child-doc'
    | 'command'
    | 'subagent'
    | 'rule'

export type PromptArtifactState = 'missing' | 'stale' | 'ready'
export type PromptSourceLocale = 'zh' | 'en'

export interface PromptServiceOptions {
  readonly cwd?: string
  readonly loadUserConfig?: boolean
  readonly pluginOptions?: Partial<AdaptorOptions>
}

export interface ListPromptsOptions extends PromptServiceOptions {
  readonly kinds?: readonly ManagedPromptKind[]
  readonly query?: string
  readonly enStatus?: readonly PromptArtifactState[]
  readonly distStatus?: readonly PromptArtifactState[]
}

export interface PromptArtifactRecord {
  readonly path: string
  readonly exists: true
  readonly mtime: string
  readonly mtimeMs: number
  readonly size: number
  readonly legacySource?: true
  readonly frontMatter?: YAMLFrontMatter
  readonly content?: string
}

export interface PromptCatalogPaths {
  readonly zh: string
  readonly en: string
  readonly dist: string
}

export interface PromptCatalogPresence {
  readonly zh: boolean
  readonly en: boolean
  readonly dist: boolean
}

export interface PromptCatalogItem {
  readonly promptId: string
  readonly kind: ManagedPromptKind
  readonly logicalName: string
  readonly paths: PromptCatalogPaths
  readonly exists: PromptCatalogPresence
  readonly enStatus: PromptArtifactState
  readonly distStatus: PromptArtifactState
  readonly updatedAt?: string
  readonly legacyZhSource?: true
}

export interface PromptDetails extends PromptCatalogItem {
  readonly src: {
    readonly zh?: PromptArtifactRecord
    readonly en?: PromptArtifactRecord
  }
  readonly dist?: PromptArtifactRecord
  readonly frontMatter?: YAMLFrontMatter
}

export interface UpsertPromptSourceInput extends PromptServiceOptions {
  readonly promptId: string
  readonly locale?: PromptSourceLocale
  readonly content: string
}

export interface WritePromptArtifactsInput extends PromptServiceOptions {
  readonly promptId: string
  readonly enContent?: string
  readonly distContent?: string
}

interface NativePromptBinding {
  readonly listPrompts?: (optionsJson?: string) => string | Promise<string>
  readonly getPrompt?: (promptId: string, optionsJson?: string) => string | Promise<string>
  readonly upsertPromptSource?: (inputJson: string) => string | Promise<string>
  readonly writePromptArtifacts?: (inputJson: string) => string | Promise<string>
}

function requireNativePromptBinding(): NativePromptBinding {
  const binding = getNativeBinding<NativePromptBinding>()
  if (binding == null) {
    throw new Error('Native prompt binding is required. Build or install the Rust NAPI package before running tnmsc.')
  }
  return binding
}

export async function listPrompts(options: ListPromptsOptions = {}): Promise<PromptCatalogItem[]> {
  const binding = requireNativePromptBinding()
  if (binding.listPrompts == null) {
    throw new Error('Native listPrompts binding is unavailable')
  }
  const result = await binding.listPrompts(JSON.stringify(options))
  return JSON.parse(result) as PromptCatalogItem[]
}

export async function getPrompt(promptId: string, options: PromptServiceOptions = {}): Promise<PromptDetails | null> {
  const binding = requireNativePromptBinding()
  if (binding.getPrompt == null) {
    throw new Error('Native getPrompt binding is unavailable')
  }
  const result = await binding.getPrompt(promptId, JSON.stringify(options))
  return JSON.parse(result) as PromptDetails | null
}

export async function upsertPromptSource(input: UpsertPromptSourceInput): Promise<PromptDetails> {
  const binding = requireNativePromptBinding()
  if (binding.upsertPromptSource == null) {
    throw new Error('Native upsertPromptSource binding is unavailable')
  }
  const result = await binding.upsertPromptSource(JSON.stringify(input))
  return JSON.parse(result) as PromptDetails
}

export async function writePromptArtifacts(input: WritePromptArtifactsInput): Promise<PromptDetails> {
  const binding = requireNativePromptBinding()
  if (binding.writePromptArtifacts == null) {
    throw new Error('Native writePromptArtifacts binding is unavailable')
  }
  const result = await binding.writePromptArtifacts(JSON.stringify(input))
  return JSON.parse(result) as PromptDetails
}
