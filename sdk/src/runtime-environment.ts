import * as path from 'node:path'
import {getNativeBinding} from './core/native-binding'

export const DEFAULT_WSL_WINDOWS_USERS_ROOT = '/mnt/c/Users'
export const DEFAULT_GLOBAL_CONFIG_DIR = '.aindex'
export const DEFAULT_GLOBAL_CONFIG_FILE_NAME = '.tnmsc.json'

const WINDOWS_DRIVE_PATH_PATTERN = /^[A-Z]:\\/i
const PERCENT_ENV_PATTERN = /%([^%]+)%/gu
const BRACED_ENV_PATTERN = /\$\{([A-Za-z_]\w*)\}/gu
const SHELL_ENV_PATTERN = /\$([A-Za-z_]\w*)/gu

type RuntimeFs = Pick<typeof import('node:fs'), 'existsSync' | 'readdirSync' | 'statSync'>

export interface RuntimeEnvironmentDependencies {
  readonly fs?: RuntimeFs
  readonly env?: NodeJS.ProcessEnv
  readonly platform?: NodeJS.Platform
  readonly homedir?: string
  readonly release?: string
  readonly windowsUsersRoot?: string
}

export interface RuntimeEnvironmentContext {
  readonly platform: NodeJS.Platform
  readonly isWsl: boolean
  readonly nativeHomeDir: string
  readonly effectiveHomeDir: string
  readonly globalConfigCandidates: readonly string[]
  readonly selectedGlobalConfigPath?: string
  readonly wslHostHomeDir?: string
  readonly windowsUsersRoot: string
  readonly expandedEnv: Readonly<Record<string, string>>
}

function isRuntimeEnvironmentContext(
  value: RuntimeEnvironmentDependencies | RuntimeEnvironmentContext | undefined
): value is RuntimeEnvironmentContext {
  return value != null
    && 'effectiveHomeDir' in value
    && 'expandedEnv' in value
}

function getPathModule(platform: NodeJS.Platform): typeof path.posix | typeof path.win32 {
  return platform === 'win32' ? path.win32 : path.posix
}

function expandEnvironmentVariables(
  rawPath: string,
  environment: Readonly<Record<string, string>>
): string {
  const replaceValue = (match: string, key: string): string => environment[key] ?? match

  return rawPath
    .replaceAll(PERCENT_ENV_PATTERN, replaceValue)
    .replaceAll(BRACED_ENV_PATTERN, replaceValue)
    .replaceAll(SHELL_ENV_PATTERN, replaceValue)
}

function expandHomeDirectory(
  rawPath: string,
  homeDir: string,
  platform: NodeJS.Platform
): string {
  if (rawPath === '~') return homeDir
  if (!(rawPath.startsWith('~/') || rawPath.startsWith('~\\'))) return rawPath

  const pathModule = getPathModule(platform)
  const normalizedSuffix = platform === 'win32'
    ? rawPath.slice(2).replaceAll('/', '\\')
    : rawPath.slice(2).replaceAll('\\', '/')

  return pathModule.resolve(homeDir, normalizedSuffix)
}

function convertWindowsPathToWsl(rawPath: string): string | undefined {
  if (!WINDOWS_DRIVE_PATH_PATTERN.test(rawPath)) return void 0

  const driveLetter = rawPath.slice(0, 1).toLowerCase()
  const relativePath = rawPath
    .slice(2)
    .replaceAll('\\', '/')
    .replace(/^\/+/u, '')

  const basePath = `/mnt/${driveLetter}`
  if (relativePath.length === 0) return basePath
  return path.posix.join(basePath, relativePath)
}

function normalizeResolvedPath(rawPath: string, platform: NodeJS.Platform): string {
  if (platform === 'win32') return path.win32.normalize(rawPath.replaceAll('/', '\\'))
  return path.posix.normalize(rawPath)
}

export function resolveUserPath(
  rawPath: string,
  dependenciesOrContext?: RuntimeEnvironmentDependencies | RuntimeEnvironmentContext
): string {
  const runtimeEnvironment = isRuntimeEnvironmentContext(dependenciesOrContext)
    ? dependenciesOrContext
    : resolveRuntimeEnvironment()

  let resolvedPath = expandEnvironmentVariables(rawPath, runtimeEnvironment.expandedEnv)
  resolvedPath = expandHomeDirectory(resolvedPath, runtimeEnvironment.effectiveHomeDir, runtimeEnvironment.platform)

  if (!runtimeEnvironment.isWsl) return normalizeResolvedPath(resolvedPath, runtimeEnvironment.platform)

  const convertedWindowsPath = convertWindowsPathToWsl(resolvedPath)
  if (convertedWindowsPath != null) resolvedPath = convertedWindowsPath
  else if (
    resolvedPath.startsWith(runtimeEnvironment.effectiveHomeDir)
    || resolvedPath.startsWith('/mnt/')
    || resolvedPath.startsWith('/')
  ) {
    resolvedPath = resolvedPath.replaceAll('\\', '/')
  }
  return normalizeResolvedPath(resolvedPath, runtimeEnvironment.platform)
}

interface RuntimeEnvFns {
  readonly resolveRuntimeEnvironment: () => string
  readonly getEffectiveHomeDir: () => string
  readonly getGlobalConfigPath: () => string
  readonly getRequiredGlobalConfigPath: () => string
  readonly isWslRuntime: () => boolean
  readonly findWslHostGlobalConfigPaths?: () => string[]
}

let runtimeEnvFnsCache: RuntimeEnvFns | undefined

function getRuntimeEnvFns(): RuntimeEnvFns {
  if (runtimeEnvFnsCache != null) return runtimeEnvFnsCache

  const candidate = getNativeBinding<RuntimeEnvFns>()
  if (candidate == null) {
    throw new TypeError('Native runtime-environment binding is required. Build or install the Rust NAPI package before running tnmsc.')
  }
  if (
    typeof candidate.resolveRuntimeEnvironment !== 'function'
    || typeof candidate.getEffectiveHomeDir !== 'function'
    || typeof candidate.getGlobalConfigPath !== 'function'
    || typeof candidate.getRequiredGlobalConfigPath !== 'function'
    || typeof candidate.isWslRuntime !== 'function'
  ) {
    throw new TypeError('Native runtime-environment binding is incomplete. Rebuild the Rust NAPI package before running tnmsc.')
  }
  runtimeEnvFnsCache = candidate
  return candidate
}

export function resolveRuntimeEnvironment(): RuntimeEnvironmentContext {
  return JSON.parse(getRuntimeEnvFns().resolveRuntimeEnvironment()) as RuntimeEnvironmentContext
}

export function getEffectiveHomeDir(): string {
  return getRuntimeEnvFns().getEffectiveHomeDir()
}

export function getGlobalConfigPath(): string {
  return getRuntimeEnvFns().getGlobalConfigPath()
}

export function getRequiredGlobalConfigPath(): string {
  return getRuntimeEnvFns().getRequiredGlobalConfigPath()
}

export function isWslRuntime(): boolean {
  return getRuntimeEnvFns().isWslRuntime()
}

export function findWslHostGlobalConfigPaths(): string[] {
  const fns = getRuntimeEnvFns()
  if (fns.findWslHostGlobalConfigPaths != null) {
    return fns.findWslHostGlobalConfigPaths()
  }
  throw new TypeError('Native findWslHostGlobalConfigPaths binding is unavailable. Build or install the Rust NAPI package before running tnmsc.')
}
