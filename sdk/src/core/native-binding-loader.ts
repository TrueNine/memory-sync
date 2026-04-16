import {readdirSync} from 'node:fs'
import {createRequire} from 'node:module'
import {dirname, join} from 'node:path'
import process from 'node:process'

export interface PlatformBinding {
  readonly local: string
  readonly suffix: string
}

export interface NativeBindingLoaderOptions<T> {
  readonly packageName: string
  readonly binaryName: string
  readonly bindingValidator: (value: unknown) => value is T
  readonly packageSuffix?: string
  readonly _requireFactory?: () => ReturnType<typeof createRequire>
  readonly _readdirSync?: (packageDir: string) => readonly string[]
}

interface BindingCache<T> {
  binding: T | undefined
  error: Error | undefined
}

const DEFAULT_LOCAL_CANDIDATE_RELATIVE_PATHS = [
  './',
  '../',
  '../dist/',
  '../../../cli/npm/'
] as const

const DEFAULT_PACKAGE_DIR_CANDIDATE_RELATIVE_PATHS = [
  '../npm/',
  '../../npm/',
  '../../cli/npm/',
  '../../../cli/npm/'
] as const

function resolvePlatformBindings(binaryName: string): Record<string, PlatformBinding> {
  return {
    'win32-x64': {local: `${binaryName}.win32-x64-msvc`, suffix: 'win32-x64-msvc'},
    'linux-x64': {local: `${binaryName}.linux-x64-gnu`, suffix: 'linux-x64-gnu'},
    'linux-arm64': {local: `${binaryName}.linux-arm64-gnu`, suffix: 'linux-arm64-gnu'},
    'darwin-arm64': {local: `${binaryName}.darwin-arm64`, suffix: 'darwin-arm64'},
    'darwin-x64': {local: `${binaryName}.darwin-x64`, suffix: 'darwin-x64'}
  }
}

export function getPlatformBinding(
  platformBindings: Record<string, PlatformBinding>,
  packageName: string
): PlatformBinding {
  const binding = platformBindings[`${process.platform}-${process.arch}`]
  if (binding != null) return binding

  throw new Error(
    `Unsupported platform for ${packageName} native binding: ${process.platform}-${process.arch}`
  )
}

export function formatBindingLoadError(
  packageName: string,
  localError: unknown,
  packageError: unknown,
  suffix: string
): Error {
  const localMessage = localError instanceof Error ? localError.message : String(localError)
  const packageMessage = packageError instanceof Error ? packageError.message : String(packageError)
  return new Error(
    [
      `Failed to load ${packageName} native binding.`,
      `Tried local binaries next to the source/bundle and package "@truenine/memory-sync-cli-${suffix}".`,
      `Local error: ${localMessage}`,
      `Package error: ${packageMessage}`,
      `Run \`pnpm -F ${packageName} run build\` to build the native module.`
    ].join('\n')
  )
}

export function loadBindingFromDirectory<T>(
  runtimeRequire: ReturnType<typeof createRequire>,
  packageDir: string,
  binaryName: string,
  bindingValidator: (value: unknown) => value is T,
  readDirectory: (packageDir: string) => readonly string[] = readdirSync
): T | undefined {
  const bindingCandidates = [...readDirectory(packageDir)]
    .filter(fileName => fileName.startsWith(`${binaryName}.`) && fileName.endsWith('.node'))
    .sort()

  for (const candidateFile of bindingCandidates) {
    const bindingModule = runtimeRequire(join(packageDir, candidateFile)) as unknown

    if (bindingValidator(bindingModule)) return bindingModule
  }

  return void 0
}

function resolvePackageDirCandidates(
  runtimeRequire: ReturnType<typeof createRequire>,
  packageName: string,
  suffix: string,
  relativePaths: readonly string[]
): string[] {
  const cliPackageName = `@truenine/memory-sync-cli-${suffix}`
  const packageDirCandidates: string[] = []

  try {
    const packageJsonPath = runtimeRequire.resolve(`${cliPackageName}/package.json`)
    packageDirCandidates.push(dirname(packageJsonPath))
  }
  catch {
  }

  try {
    const selfPackageJsonPath = runtimeRequire.resolve(`${packageName}/package.json`)
    packageDirCandidates.push(join(dirname(selfPackageJsonPath), 'dist'))
  }
  catch {
  }

  for (const relativePath of relativePaths) {
    packageDirCandidates.push(`${relativePath}${suffix}`)
  }

  return packageDirCandidates
}

export function loadBindingFromCliBinaryPackage<T>(
  runtimeRequire: ReturnType<typeof createRequire>,
  options: NativeBindingLoaderOptions<T>,
  suffix: string
): T {
  const {packageName, binaryName, bindingValidator} = options
  const cliPackageName = `@truenine/memory-sync-cli-${suffix}`

  try {
    const cliBinaryPackage = runtimeRequire(cliPackageName) as unknown

    if (bindingValidator(cliBinaryPackage)) return cliBinaryPackage
  }
  catch {
  }

  let lastError: unknown = new Error(`No compatible ${binaryName} binding was found for ${cliPackageName}`)

  for (const candidateDir of resolvePackageDirCandidates(
    runtimeRequire,
    packageName,
    suffix,
    DEFAULT_PACKAGE_DIR_CANDIDATE_RELATIVE_PATHS
  )) {
    try {
      const loaded = loadBindingFromDirectory(
        runtimeRequire,
        candidateDir,
        binaryName,
        bindingValidator,
        options._readdirSync
      )
      if (loaded != null) return loaded
    }
    catch (error) {
      lastError = error
    }
  }

  if (lastError instanceof Error) throw lastError
  throw new Error(`Package "${cliPackageName}" does not export a ${binaryName} binding or contain a compatible native module`)
}

function buildLocalCandidatePaths(local: string, suffix: string): string[] {
  return DEFAULT_LOCAL_CANDIDATE_RELATIVE_PATHS.map(base => {
    if (base.endsWith('/')) {
      return `${base}${suffix}/${local}.node`
    }
    return `${base}${local}.node`
  })
}

export function loadNativeBinding<T>(
  options: NativeBindingLoaderOptions<T>
): T {
  const {
    packageName,
    binaryName,
    bindingValidator,
    packageSuffix,
    _requireFactory
  } = options

  const runtimeRequire = (_requireFactory ?? (() => createRequire(import.meta.url)))()
  const platformBindings = resolvePlatformBindings(binaryName)
  const {local, suffix} = getPlatformBinding(platformBindings, packageName)
  const effectiveSuffix = packageSuffix ?? suffix
  const localCandidates = buildLocalCandidatePaths(local, effectiveSuffix)

  let localError: unknown = new Error(`No local candidate matched "${local}"`)

  for (const candidate of localCandidates) {
    try {
      const bindingModule = runtimeRequire(candidate) as unknown
      if (bindingValidator(bindingModule)) {
        return bindingModule
      }
    }
    catch (error) {
      localError = error
    }
  }

  try {
    return loadBindingFromCliBinaryPackage(runtimeRequire, options, effectiveSuffix)
  }
  catch (packageError) {
    throw formatBindingLoadError(packageName, localError, packageError, effectiveSuffix)
  }
}

function createBindingCache<T>(): BindingCache<T> {
  return {binding: void 0, error: void 0}
}

const loaderCaches = new WeakMap<NativeBindingLoaderOptions<unknown>, BindingCache<unknown>>()

function getOrCreateCache<T>(options: NativeBindingLoaderOptions<T>): BindingCache<T> {
  const existing = loaderCaches.get(options as NativeBindingLoaderOptions<unknown>)
  if (existing != null) return existing as BindingCache<T>

  const cache = createBindingCache<T>()
  loaderCaches.set(options as NativeBindingLoaderOptions<unknown>, cache as BindingCache<unknown>)
  return cache
}

export function createNativeBindingLoader<T>(
  options: NativeBindingLoaderOptions<T>
): () => T {
  const cache = getOrCreateCache(options)

  return (): T => {
    if (cache.binding != null) return cache.binding

    if (cache.error != null) throw cache.error

    try {
      cache.binding = loadNativeBinding(options)
      return cache.binding
    }
    catch (error) {
      cache.error = error instanceof Error ? error : new Error(String(error))
      throw cache.error
    }
  }
}
