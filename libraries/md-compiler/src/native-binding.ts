import {readdirSync} from 'node:fs'
import {createRequire} from 'node:module'
import {dirname, join} from 'node:path'
import process from 'node:process'

export interface NativeParseMarkdownResult {
  readonly yamlFrontMatterJson?: string
  readonly rawFrontMatter?: string
  readonly contentWithoutFrontMatter: string
}

export interface NapiMdCompilerModule {
  compileMdxToMd: (content: string, optionsJson?: string | null) => string
  buildFrontMatter: (frontMatterJson: string) => string
  parseMarkdown: (rawContent: string) => NativeParseMarkdownResult
  transformMdxReferencesToMd: (content: string) => string
  buildTomlDocument: (documentJson: string, optionsJson?: string | null) => string
  buildPromptTomlArtifact: (optionsJson: string) => string
}

interface PlatformBinding {
  readonly local: string
  readonly suffix: string
}

const PLATFORM_BINDINGS: Record<string, PlatformBinding> = {
  'win32-x64': {local: 'napi-md-compiler.win32-x64-msvc', suffix: 'win32-x64-msvc'},
  'linux-x64': {local: 'napi-md-compiler.linux-x64-gnu', suffix: 'linux-x64-gnu'},
  'linux-arm64': {local: 'napi-md-compiler.linux-arm64-gnu', suffix: 'linux-arm64-gnu'},
  'darwin-arm64': {local: 'napi-md-compiler.darwin-arm64', suffix: 'darwin-arm64'},
  'darwin-x64': {local: 'napi-md-compiler.darwin-x64', suffix: 'darwin-x64'}
}

let cachedBinding: NapiMdCompilerModule | undefined,
  cachedBindingError: Error | undefined

export function shouldSkipNativeBinding(): boolean {
  if (process.env['TNMSC_FORCE_NATIVE_BINDING'] === '1') return false
  return process.env['TNMSC_DISABLE_NATIVE_BINDING'] === '1'
}

function isNapiMdCompilerModule(value: unknown): value is NapiMdCompilerModule {
  if (value == null || typeof value !== 'object') return false

  const candidate = value as Partial<NapiMdCompilerModule>
  return typeof candidate.compileMdxToMd === 'function'
    && typeof candidate.buildFrontMatter === 'function'
    && typeof candidate.parseMarkdown === 'function'
    && typeof candidate.transformMdxReferencesToMd === 'function'
    && typeof candidate.buildTomlDocument === 'function'
    && typeof candidate.buildPromptTomlArtifact === 'function'
}

function getPlatformBinding(): PlatformBinding {
  const binding = PLATFORM_BINDINGS[`${process.platform}-${process.arch}`]
  if (binding != null) return binding

  throw new Error(
    `Unsupported platform for @truenine/md-compiler native binding: ${process.platform}-${process.arch}`
  )
}

function loadBindingFromCliBinaryPackage(
  runtimeRequire: ReturnType<typeof createRequire>,
  suffix: string
): NapiMdCompilerModule {
  const packageName = `@truenine/memory-sync-cli-${suffix}`

  try {
    const pkg = runtimeRequire(packageName) as Record<string, unknown>
    const binding = pkg['mdCompiler']

    if (isNapiMdCompilerModule(binding)) return binding
  }
  catch {
  }

  const packageJsonPath = runtimeRequire.resolve(`${packageName}/package.json`)
  const packageDir = dirname(packageJsonPath)
  const bindingCandidates = readdirSync(packageDir)
    .filter(fileName => fileName.startsWith('napi-md-compiler.') && fileName.endsWith('.node'))
    .sort()

  for (const candidateFile of bindingCandidates) {
    const binding = runtimeRequire(join(packageDir, candidateFile)) as unknown
    if (isNapiMdCompilerModule(binding)) return binding
  }

  throw new Error(`Package "${packageName}" does not export an mdCompiler binding or contain a compatible native module`)
}

function loadNativeBinding(): NapiMdCompilerModule {
  if (shouldSkipNativeBinding()) {
    throw new Error('Native binding loading is disabled by TNMSC_DISABLE_NATIVE_BINDING=1')
  }

  const runtimeRequire = createRequire(import.meta.url)
  const {local, suffix} = getPlatformBinding()
  const localCandidates = [`./${local}.node`, `../dist/${local}.node`, `../${local}.node`]
  let localError: unknown = new Error(`No local candidate matched "${local}"`)

  for (const candidate of localCandidates) {
    try {
      const binding = runtimeRequire(candidate) as unknown
      if (isNapiMdCompilerModule(binding)) return binding
    }
    catch (error) {
      localError = error
    }
  }

  try {
    return loadBindingFromCliBinaryPackage(runtimeRequire, suffix)
  }
  catch (packageError) {
    const localMessage = localError instanceof Error ? localError.message : String(localError)
    const packageMessage = packageError instanceof Error ? packageError.message : String(packageError)
    throw new Error(
      [
        'Failed to load @truenine/md-compiler native binding.',
        `Tried local binaries for "${local}" and package "@truenine/memory-sync-cli-${suffix}".`,
        `Local error: ${localMessage}`,
        `Package error: ${packageMessage}`,
        'Run `pnpm -F @truenine/md-compiler run build` to build the native module.'
      ].join('\n')
    )
  }
}

export function getNapiMdCompilerBinding(): NapiMdCompilerModule {
  if (cachedBinding != null) return cachedBinding
  if (cachedBindingError != null) throw cachedBindingError

  try {
    cachedBinding = loadNativeBinding()
    return cachedBinding
  }
  catch (error) {
    cachedBindingError = error instanceof Error ? error : new Error(String(error))
    throw cachedBindingError
  }
}
