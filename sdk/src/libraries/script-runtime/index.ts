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
import {dirname, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {createNativeBindingLoader} from '../../core/native-binding-loader'

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

function isScriptRuntimeBinding(value: unknown): value is ScriptRuntimeBinding {
  if (value == null || typeof value !== 'object') return false
  const candidate = value as ScriptRuntimeBinding
  return typeof candidate.validate_public_path === 'function'
    || typeof candidate.validatePublicPath === 'function'
    || typeof candidate.resolve_public_path === 'function'
    || typeof candidate.resolvePublicPath === 'function'
}

const getBinding = createNativeBindingLoader<ScriptRuntimeBinding>({
  packageName: '@truenine/memory-sync-sdk',
  binaryName: 'napi-memory-sync-cli',
  bindingValidator: isScriptRuntimeBinding,
  cliExportName: 'scriptRuntime',
  optionalMethods: {
    validatePublicPath: ['validate_public_path'],
    resolvePublicPath: ['resolve_public_path']
  }
})

let workerPathCache: string | undefined
const runtimeRequire = createRequire(import.meta.url)

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

function getPackageWorkerPaths(): string[] {
  try {
    const packageJsonPath = runtimeRequire.resolve('@truenine/memory-sync-sdk/package.json')
    const packageDir = dirname(packageJsonPath)

    return [
      resolve(packageDir, 'dist', 'resolve-proxy-worker.mjs'),
      resolve(packageDir, 'dist', 'script-runtime-worker.mjs')
    ]
  }
  catch {
    return []
  }
}

function getWorkerPath(): string {
  if (workerPathCache != null) return workerPathCache

  const candidatePaths = [
    ...getPackageWorkerPaths(),
    fileURLToPath(new URL('./resolve-proxy-worker.mjs', import.meta.url)),
    fileURLToPath(new URL('./script-runtime-worker.mjs', import.meta.url)),
    fileURLToPath(new URL('../resolve-proxy-worker.mjs', import.meta.url)),
    fileURLToPath(new URL('../script-runtime-worker.mjs', import.meta.url)),
    fileURLToPath(new URL('../../resolve-proxy-worker.mjs', import.meta.url)),
    fileURLToPath(new URL('../../script-runtime-worker.mjs', import.meta.url)),
    fileURLToPath(new URL('../../../cli/dist/script-runtime-worker.mjs', import.meta.url)),
    fileURLToPath(new URL('../../../../cli/dist/script-runtime-worker.mjs', import.meta.url))
  ]

  for (const candidatePath of candidatePaths) {
    if (fs.existsSync(candidatePath)) {
      workerPathCache = candidatePath
      return candidatePath
    }
  }

  workerPathCache = candidatePaths[0]
  return candidatePaths[0]! // eslint-disable-line ts/no-non-null-assertion -- fallback array is never empty
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
