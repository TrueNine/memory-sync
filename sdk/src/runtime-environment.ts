import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import process from 'node:process'

export const DEFAULT_WSL_WINDOWS_USERS_ROOT = '/mnt/c/Users'
export const DEFAULT_GLOBAL_CONFIG_DIR = '.aindex'
export const DEFAULT_GLOBAL_CONFIG_FILE_NAME = '.tnmsc.json'

const WINDOWS_DRIVE_PATH_PATTERN = /^[A-Za-z]:[\\/]/u
const PERCENT_ENV_PATTERN = /%([^%]+)%/gu
const BRACED_ENV_PATTERN = /\$\{([A-Za-z_]\w*)\}/gu
const SHELL_ENV_PATTERN = /\$([A-Za-z_]\w*)/gu

type RuntimeFs = Pick<typeof fs, 'existsSync' | 'readdirSync' | 'statSync'>

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

function getFs(dependencies?: RuntimeEnvironmentDependencies): RuntimeFs {
  return dependencies?.fs ?? fs
}

function getPlatform(dependencies?: RuntimeEnvironmentDependencies): NodeJS.Platform {
  return dependencies?.platform ?? process.platform
}

function getRelease(dependencies?: RuntimeEnvironmentDependencies): string {
  return dependencies?.release ?? os.release()
}

function getNativeHomeDir(dependencies?: RuntimeEnvironmentDependencies): string {
  return dependencies?.homedir ?? os.homedir()
}

function getEnv(dependencies?: RuntimeEnvironmentDependencies): NodeJS.ProcessEnv {
  return dependencies?.env ?? process.env
}

function getWindowsUsersRoot(dependencies?: RuntimeEnvironmentDependencies): string {
  return dependencies?.windowsUsersRoot ?? DEFAULT_WSL_WINDOWS_USERS_ROOT
}

function normalizePosixLikePath(rawPath: string): string {
  return path.posix.normalize(rawPath.replaceAll('\\', '/'))
}

function isSameOrChildPath(candidatePath: string, parentPath: string): boolean {
  const normalizedCandidate = normalizePosixLikePath(candidatePath)
  const normalizedParent = normalizePosixLikePath(parentPath)

  if (normalizedCandidate === normalizedParent) return true
  return normalizedCandidate.startsWith(`${normalizedParent}/`)
}

function resolveWslHostHomeCandidate(
  rawPath: string | undefined,
  usersRoot: string
): string | undefined {
  if (typeof rawPath !== 'string') return void 0

  const trimmedPath = rawPath.trim()
  if (trimmedPath.length === 0) return void 0

  const candidatePaths = [
    convertWindowsPathToWsl(trimmedPath),
    normalizePosixLikePath(trimmedPath)
  ]

  for (const candidatePath of candidatePaths) {
    if (candidatePath == null) continue
    if (isSameOrChildPath(candidatePath, usersRoot)) return normalizePosixLikePath(candidatePath)
  }

  return void 0
}

function getPreferredWslHostHomeDirs(
  dependencies?: RuntimeEnvironmentDependencies
): string[] {
  const env = getEnv(dependencies)
  const usersRoot = normalizePosixLikePath(getWindowsUsersRoot(dependencies))
  const homeDrive = env['HOMEDRIVE']
  const homePath = env['HOMEPATH']
  const preferredHomeDirs = [
    resolveWslHostHomeCandidate(env['USERPROFILE'], usersRoot),
    typeof homeDrive === 'string' && homeDrive.length > 0 && typeof homePath === 'string' && homePath.length > 0
      ? resolveWslHostHomeCandidate(`${homeDrive}${homePath}`, usersRoot)
      : void 0,
    resolveWslHostHomeCandidate(env['HOME'], usersRoot)
  ]

  return [...new Set(preferredHomeDirs.filter((candidate): candidate is string => candidate != null))]
}

function getWslHostHomeDirForConfigPath(configPath: string): string {
  const normalizedConfigPath = normalizePosixLikePath(configPath)
  return path.posix.dirname(path.posix.dirname(normalizedConfigPath))
}

function selectWslHostGlobalConfigPath(
  globalConfigCandidates: readonly string[],
  dependencies?: RuntimeEnvironmentDependencies
): string | undefined {
  const preferredHomeDirs = getPreferredWslHostHomeDirs(dependencies)

  if (preferredHomeDirs.length <= 0) return globalConfigCandidates.length === 1 ? globalConfigCandidates[0] : void 0

  for (const preferredHomeDir of preferredHomeDirs) {
    const matchedCandidate = globalConfigCandidates.find(candidatePath =>
      getWslHostHomeDirForConfigPath(candidatePath) === preferredHomeDir)
    if (matchedCandidate != null) return matchedCandidate
  }
  return void 0
}

function isDirectory(fsImpl: RuntimeFs, targetPath: string): boolean {
  try {
    return fsImpl.statSync(targetPath).isDirectory()
  }
  catch {
    return false
  }
}

function isFile(fsImpl: RuntimeFs, targetPath: string): boolean {
  try {
    return fsImpl.statSync(targetPath).isFile()
  }
  catch {
    return false
  }
}

function getPathModule(platform: NodeJS.Platform): typeof path.posix | typeof path.win32 {
  return platform === 'win32' ? path.win32 : path.posix
}

function buildExpandedEnv(
  rawEnv: NodeJS.ProcessEnv,
  nativeHomeDir: string,
  effectiveHomeDir: string
): Readonly<Record<string, string>> {
  const expandedEnv: Record<string, string> = {}

  for (const [key, value] of Object.entries(rawEnv)) {
    if (typeof value === 'string') expandedEnv[key] = value
  }

  if (effectiveHomeDir === nativeHomeDir) return expandedEnv

  expandedEnv['HOME'] = effectiveHomeDir
  expandedEnv['USERPROFILE'] = effectiveHomeDir
  const hostHomeMatch = /^\/mnt\/([a-zA-Z])\/(.+)$/u.exec(effectiveHomeDir)
  if (hostHomeMatch == null) return expandedEnv

  const driveLetter = hostHomeMatch[1]
  const relativePath = hostHomeMatch[2]
  if (driveLetter == null || relativePath == null) return expandedEnv
  expandedEnv['HOMEDRIVE'] = `${driveLetter.toUpperCase()}:`
  expandedEnv['HOMEPATH'] = `\\${relativePath.replaceAll('/', '\\')}`
  return expandedEnv
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

export function isWslRuntime(
  dependencies?: RuntimeEnvironmentDependencies
): boolean {
  if (getPlatform(dependencies) !== 'linux') return false

  const env = getEnv(dependencies)
  if (typeof env['WSL_DISTRO_NAME'] === 'string' && env['WSL_DISTRO_NAME'].length > 0) return true
  if (typeof env['WSL_INTEROP'] === 'string' && env['WSL_INTEROP'].length > 0) return true

  return getRelease(dependencies).toLowerCase().includes('microsoft')
}

export function findWslHostGlobalConfigPaths(
  dependencies?: RuntimeEnvironmentDependencies
): string[] {
  const fsImpl = getFs(dependencies)
  const usersRoot = getWindowsUsersRoot(dependencies)

  if (!isDirectory(fsImpl, usersRoot)) return []

  try {
    const dirEntries = fsImpl.readdirSync(usersRoot, {withFileTypes: true})
    const candidates = dirEntries
      .filter(dirEntry => dirEntry.isDirectory())
      .map(dirEntry => path.join(usersRoot, dirEntry.name, DEFAULT_GLOBAL_CONFIG_DIR, DEFAULT_GLOBAL_CONFIG_FILE_NAME))
      .filter(candidatePath => fsImpl.existsSync(candidatePath) && isFile(fsImpl, candidatePath))

    candidates.sort((a, b) => a.localeCompare(b))
    return candidates
  }
  catch {
    return []
  }
}

export function resolveRuntimeEnvironment(
  dependencies?: RuntimeEnvironmentDependencies
): RuntimeEnvironmentContext {
  const platform = getPlatform(dependencies)
  const nativeHomeDir = getNativeHomeDir(dependencies)
  const wslRuntime = isWslRuntime(dependencies)
  const globalConfigCandidates = wslRuntime ? findWslHostGlobalConfigPaths(dependencies) : []
  const selectedGlobalConfigPath = wslRuntime
    ? selectWslHostGlobalConfigPath(globalConfigCandidates, dependencies)
    : void 0
  const effectiveHomeDir = selectedGlobalConfigPath != null
    ? getWslHostHomeDirForConfigPath(selectedGlobalConfigPath)
    : nativeHomeDir

  return {
    platform,
    isWsl: wslRuntime,
    nativeHomeDir,
    effectiveHomeDir,
    globalConfigCandidates,
    ...selectedGlobalConfigPath != null && {selectedGlobalConfigPath},
    ...selectedGlobalConfigPath != null && {wslHostHomeDir: effectiveHomeDir},
    windowsUsersRoot: getWindowsUsersRoot(dependencies),
    expandedEnv: buildExpandedEnv(getEnv(dependencies), nativeHomeDir, effectiveHomeDir)
  }
}

export function getEffectiveHomeDir(
  dependencies?: RuntimeEnvironmentDependencies
): string {
  return resolveRuntimeEnvironment(dependencies).effectiveHomeDir
}

export function getGlobalConfigPath(
  dependencies?: RuntimeEnvironmentDependencies
): string {
  const runtimeEnvironment = resolveRuntimeEnvironment(dependencies)
  if (runtimeEnvironment.selectedGlobalConfigPath != null) return runtimeEnvironment.selectedGlobalConfigPath

  return path.join(
    runtimeEnvironment.effectiveHomeDir,
    DEFAULT_GLOBAL_CONFIG_DIR,
    DEFAULT_GLOBAL_CONFIG_FILE_NAME
  )
}

export function getRequiredGlobalConfigPath(
  dependencies?: RuntimeEnvironmentDependencies
): string {
  const runtimeEnvironment = resolveRuntimeEnvironment(dependencies)

  if (!runtimeEnvironment.isWsl || runtimeEnvironment.selectedGlobalConfigPath != null) {
    return getGlobalConfigPath(dependencies)
  }

  const configLookupPattern = `"${runtimeEnvironment.windowsUsersRoot}/*/${DEFAULT_GLOBAL_CONFIG_DIR}/${DEFAULT_GLOBAL_CONFIG_FILE_NAME}"`
  if (runtimeEnvironment.globalConfigCandidates.length === 0) {
    throw new Error(`WSL host config file not found under ${configLookupPattern}.`)
  }
  if (getPreferredWslHostHomeDirs(dependencies).length > 0) {
    throw new Error(`WSL host config file for the current Windows user was not found under ${configLookupPattern}.`)
  }
  throw new Error(`WSL host config file could not be matched to the current Windows user under ${configLookupPattern}.`)
}

export function resolveUserPath(
  rawPath: string,
  dependenciesOrContext?: RuntimeEnvironmentDependencies | RuntimeEnvironmentContext
): string {
  const runtimeEnvironment = isRuntimeEnvironmentContext(dependenciesOrContext)
    ? dependenciesOrContext
    : resolveRuntimeEnvironment(dependenciesOrContext)

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
