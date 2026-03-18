import type {
  ProxyContext,
  ProxyDefinition,
  ProxyModule,
  ProxyModuleConfig,
  ProxyRouteHandler,
  ValidatePublicPathOptions
} from './types'

import * as fs from 'node:fs'
import {createRequire} from 'node:module'
import {dirname, join} from 'node:path'
import process from 'node:process'
import {fileURLToPath} from 'node:url'
import {
  loadProxyModule as loadProxyModuleInternal,
  resolvePublicPathModule
} from './runtime-core'

export type {
  ProxyCommand,
  ProxyContext,
  ProxyDefinition,
  ProxyMatcherConfig,
  ProxyModule,
  ProxyModuleConfig,
  ProxyRouteHandler,
  ValidatePublicPathOptions
} from './types'

interface ScriptRuntimeBinding {
  validate_public_path?: (resolvedPath: string, aindexPublicDir: string) => string
  validatePublicPath?: (resolvedPath: string, aindexPublicDir: string) => string
  resolve_public_path?: (filePath: string, ctxJson: string, logicalPath: string) => string
  resolvePublicPath?: (filePath: string, ctxJson: string, logicalPath: string) => string
}

interface PlatformBinding {
  readonly local: string
  readonly suffix: string
}

const PLATFORM_BINDINGS: Record<string, PlatformBinding> = {
  'win32-x64': {local: 'napi-script-runtime.win32-x64-msvc', suffix: 'win32-x64-msvc'},
  'linux-x64': {local: 'napi-script-runtime.linux-x64-gnu', suffix: 'linux-x64-gnu'},
  'linux-arm64': {local: 'napi-script-runtime.linux-arm64-gnu', suffix: 'linux-arm64-gnu'},
  'darwin-arm64': {local: 'napi-script-runtime.darwin-arm64', suffix: 'darwin-arm64'},
  'darwin-x64': {local: 'napi-script-runtime.darwin-x64', suffix: 'darwin-x64'}
}

let binding: ScriptRuntimeBinding | undefined, bindingLoadError: Error | undefined

function getPlatformBinding(): PlatformBinding {
  const platformBinding = PLATFORM_BINDINGS[`${process.platform}-${process.arch}`]
  if (platformBinding != null) return platformBinding

  throw new Error(
    `Unsupported platform for @truenine/script-runtime native binding: ${process.platform}-${process.arch}`
  )
}

function isScriptRuntimeBinding(value: unknown): value is ScriptRuntimeBinding {
  if (value == null || typeof value !== 'object') return false
  const candidate = value as ScriptRuntimeBinding
  return typeof candidate.validate_public_path === 'function'
    || typeof candidate.validatePublicPath === 'function'
    || typeof candidate.resolve_public_path === 'function'
    || typeof candidate.resolvePublicPath === 'function'
}

function formatBindingLoadError(localError: unknown, packageError: unknown, suffix: string): Error {
  const localMessage = localError instanceof Error ? localError.message : String(localError)
  const packageMessage = packageError instanceof Error ? packageError.message : String(packageError)
  return new Error(
    [
      'Failed to load @truenine/script-runtime native binding.',
      `Tried local binary "./${PLATFORM_BINDINGS[`${process.platform}-${process.arch}`]?.local ?? 'unknown'}.node" and package "@truenine/memory-sync-cli-${suffix}".`,
      `Local error: ${localMessage}`,
      `Package error: ${packageMessage}`,
      'Run `pnpm -F @truenine/script-runtime run build` to build the native module.'
    ].join('\n')
  )
}

function loadBindingFromCliBinaryPackage(
  runtimeRequire: ReturnType<typeof createRequire>,
  suffix: string
): ScriptRuntimeBinding {
  const packageName = `@truenine/memory-sync-cli-${suffix}`

  try {
    const cliBinaryPackage = runtimeRequire(packageName) as Record<string, unknown>
    const runtimeBinding = cliBinaryPackage['scriptRuntime']

    if (isScriptRuntimeBinding(runtimeBinding)) return runtimeBinding
  }
  catch {
  } // Fall through to the package-directory probe below.

  const packageJsonPath = runtimeRequire.resolve(`${packageName}/package.json`)
  const packageDir = dirname(packageJsonPath)
  const bindingCandidates = fs.readdirSync(packageDir)
    .filter(fileName => fileName.startsWith('napi-script-runtime.') && fileName.endsWith('.node'))
    .sort()

  for (const candidateFile of bindingCandidates) {
    const bindingModule = runtimeRequire(join(packageDir, candidateFile)) as unknown

    if (isScriptRuntimeBinding(bindingModule)) return bindingModule
  }

  throw new Error(`Package "${packageName}" does not export a scriptRuntime binding or contain a compatible native module`)
}

function loadNativeBinding(): ScriptRuntimeBinding {
  const runtimeRequire = createRequire(import.meta.url)
  const {local, suffix} = getPlatformBinding()

  try {
    return runtimeRequire(`./${local}.node`) as ScriptRuntimeBinding
  }
  catch (localError) {
    try {
      return loadBindingFromCliBinaryPackage(runtimeRequire, suffix)
    }
    catch (packageError) {
      throw formatBindingLoadError(localError, packageError, suffix)
    }
  }
}

function getBinding(): ScriptRuntimeBinding {
  if (binding != null) return binding
  if (bindingLoadError != null) throw bindingLoadError

  try {
    binding = loadNativeBinding()
    return binding
  }
  catch (error) {
    bindingLoadError = error instanceof Error ? error : new Error(String(error))
    throw bindingLoadError
  }
}

function callValidatePublicPathBinding(resolvedPath: string, options: ValidatePublicPathOptions): string {
  const nativeBinding = getBinding()
  const validatePublicPathNative = nativeBinding.validate_public_path ?? nativeBinding.validatePublicPath

  if (validatePublicPathNative == null) throw new Error('validate_public_path native binding is unavailable')

  return validatePublicPathNative(resolvedPath, options.aindexPublicDir)
}

function callResolvePublicPathBinding(filePath: string, ctxJson: string, logicalPath: string): string {
  const nativeBinding = getBinding()
  const resolvePublicPathNative = nativeBinding.resolve_public_path ?? nativeBinding.resolvePublicPath

  if (resolvePublicPathNative == null) throw new Error('resolve_public_path native binding is unavailable')

  return resolvePublicPathNative(filePath, ctxJson, logicalPath)
}

function getWorkerPath(): string {
  const candidatePaths: [string, string] = [
    fileURLToPath(new URL('./resolve-proxy-worker.mjs', import.meta.url)),
    fileURLToPath(new URL('./script-runtime-worker.mjs', import.meta.url))
  ]

  for (const candidatePath of candidatePaths) {
    if (fs.existsSync(candidatePath)) return candidatePath
  }

  return candidatePaths[0]
}

export function defineProxy<T extends ProxyDefinition | ProxyRouteHandler>(value: T): T {
  return value
}

export async function loadProxyModule(filePath: string): Promise<ProxyModule> {
  return loadProxyModuleInternal(filePath)
}

export function validatePublicPath(
  resolvedPath: string,
  options: ValidatePublicPathOptions
): string {
  return callValidatePublicPathBinding(resolvedPath, options)
}

export function resolvePublicPath(
  filePath: string,
  ctx: ProxyContext,
  logicalPath: string,
  timeoutMs: number = 5_000
): string {
  return callResolvePublicPathBinding(filePath, JSON.stringify({
    ...ctx,
    workerPath: getWorkerPath(),
    timeoutMs
  }), logicalPath)
}

export async function resolvePublicPathUnchecked(
  filePath: string,
  ctx: ProxyContext,
  logicalPath: string
): Promise<string> {
  return resolvePublicPathModule(filePath, ctx, logicalPath)
}

export function getProxyModuleConfig(module: ProxyModule): ProxyModuleConfig | undefined {
  return module.config
}
