import process from 'node:process'
import {createNativeBindingLoader} from '../../../sdk/src/core/native-binding-loader'

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

const loadNativeBinding = createNativeBindingLoader<NapiMdCompilerModule>({
  packageName: '@truenine/md-compiler',
  binaryName: 'napi-md-compiler',
  bindingValidator: isNapiMdCompilerModule,
  cliExportName: 'mdCompiler'
})

let cachedBindingError: Error | undefined

export function getNapiMdCompilerBinding(): NapiMdCompilerModule {
  if (cachedBindingError != null) throw cachedBindingError

  if (!shouldSkipNativeBinding()) return loadNativeBinding()

  cachedBindingError = new Error('Native binding loading is disabled by TNMSC_DISABLE_NATIVE_BINDING=1')
  throw cachedBindingError
}
