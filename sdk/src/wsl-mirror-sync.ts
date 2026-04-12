import type {
  AdaptorOptions,
  ILogger,
  OutputAdaptor,
  OutputFileDeclaration,
  OutputWriteContext,
  WslMirrorFileDeclaration
} from './adaptors/adaptor-core'
import type {RuntimeEnvironmentContext} from './runtime-environment'
import {Buffer} from 'node:buffer'
import {spawnSync} from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import process from 'node:process'
import {isOutputAdaptorEnabled} from './adaptors/adaptor-core'
import {getEffectiveHomeDir, resolveRuntimeEnvironment, resolveUserPath} from './runtime-environment'

type MirrorFs = Pick<typeof fs, 'existsSync' | 'mkdirSync' | 'readFileSync' | 'writeFileSync'>
type SpawnSyncFn = typeof spawnSync
type SpawnSyncResult = ReturnType<SpawnSyncFn>

export interface WslMirrorRuntimeDependencies {
  readonly fs?: MirrorFs
  readonly spawnSync?: SpawnSyncFn
  readonly platform?: NodeJS.Platform
  readonly effectiveHomeDir?: string
  readonly nativeHomeDir?: string
  readonly isWsl?: boolean
}

export interface ResolvedWslInstanceTarget {
  readonly instance: string
  readonly linuxHomeDir: string
  readonly windowsHomeDir: string
}

export interface WslMirrorSyncResult {
  readonly mirroredFiles: number
  readonly warnings: readonly string[]
  readonly errors: readonly string[]
}

class WslUnavailableError extends Error {}

interface ResolvedWslMirrorSource {
  readonly kind: 'declared' | 'generated'
  readonly sourcePath: string
  readonly relativePathSegments: readonly string[]
}

function getFs(dependencies?: WslMirrorRuntimeDependencies): MirrorFs {
  return dependencies?.fs ?? fs
}

function getSpawnSync(dependencies?: WslMirrorRuntimeDependencies): SpawnSyncFn {
  return dependencies?.spawnSync ?? spawnSync
}

function getPlatform(dependencies?: WslMirrorRuntimeDependencies): NodeJS.Platform {
  return dependencies?.platform ?? process.platform
}

function getHostHomeDir(dependencies?: WslMirrorRuntimeDependencies): string {
  return dependencies?.effectiveHomeDir ?? getEffectiveHomeDir()
}

function getNativeHomeDir(dependencies?: WslMirrorRuntimeDependencies): string {
  return dependencies?.nativeHomeDir ?? resolveRuntimeEnvironment().nativeHomeDir
}

function isWslExecutionRuntime(dependencies?: WslMirrorRuntimeDependencies): boolean {
  return dependencies?.isWsl ?? resolveRuntimeEnvironment().isWsl
}

function getPathModuleForPlatform(
  platform: NodeJS.Platform
): typeof path.win32 | typeof path.posix {
  return platform === 'win32' ? path.win32 : path.posix
}

function normalizeInstanceNames(
  instances: readonly string[]
): string[] {
  return [...new Set(instances.map(instance => instance.trim()).filter(instance => instance.length > 0))]
}

function normalizeConfiguredInstances(
  pluginOptions?: AdaptorOptions
): string[] {
  const configuredInstances = pluginOptions?.windows?.wsl2?.instances
  const instanceList = configuredInstances == null
    ? []
    : Array.isArray(configuredInstances)
      ? configuredInstances
      : [configuredInstances]

  return normalizeInstanceNames(instanceList)
}

function buildWindowsWslHomePath(
  instance: string,
  linuxHomeDir: string
): string {
  if (!linuxHomeDir.startsWith('/')) {
    throw new Error(`WSL instance "${instance}" returned a non-absolute home path: "${linuxHomeDir}".`)
  }

  const pathSegments = linuxHomeDir.split('/').filter(segment => segment.length > 0)
  return path.win32.join(`\\\\wsl$\\${instance}`, ...pathSegments)
}

function resolveMirroredRelativePathSegments(
  sourcePath: string,
  hostHomeDir: string,
  platform: NodeJS.Platform
): string[] {
  const pathModule = getPathModuleForPlatform(platform)
  const normalizedHostHome = pathModule.normalize(hostHomeDir)
  const normalizedSourcePath = pathModule.normalize(sourcePath)
  const relativePath = pathModule.relative(normalizedHostHome, normalizedSourcePath)

  if (
    relativePath.length === 0
    || relativePath.startsWith('..')
    || pathModule.isAbsolute(relativePath)
  ) {
    throw new Error(
      `WSL mirror source "${sourcePath}" must stay under the host home directory "${hostHomeDir}".`
    )
  }

  return relativePath.split(/[\\/]+/u).filter(segment => segment.length > 0)
}

function decodeWslCliOutput(
  value: unknown
): string {
  if (typeof value === 'string') return value
  if (!Buffer.isBuffer(value) || value.length === 0) return ''

  const hasUtf16LeBom = value.length >= 2 && value[0] === 0xFF && value[1] === 0xFE
  const hasUtf16BeBom = value.length >= 2 && value[0] === 0xFE && value[1] === 0xFF
  if (hasUtf16LeBom || hasUtf16BeBom) return value.toString('utf16le').replace(/^\uFEFF/u, '')

  const utf8Text = value.toString('utf8')
  if (utf8Text.includes('\u0000')) return value.toString('utf16le').replace(/^\uFEFF/u, '')
  return utf8Text
}

function getSpawnOutputText(
  value: unknown
): string {
  return decodeWslCliOutput(value).replaceAll('\u0000', '')
}

function getSpawnSyncErrorCode(result: SpawnSyncResult): string | undefined {
  const {error} = result
  if (error == null || typeof error !== 'object') return void 0
  return 'code' in error && typeof error.code === 'string' ? error.code : void 0
}

function getWslUnavailableReason(result: SpawnSyncResult): string | undefined {
  const errorCode = getSpawnSyncErrorCode(result)
  if (errorCode === 'ENOENT') return 'wsl.exe is not available on PATH.'

  const combinedOutput = [result.stderr, result.stdout]
    .map(value => getSpawnOutputText(value).trim())
    .filter(value => value.length > 0)
    .join('\n')
    .toLowerCase()

  if (combinedOutput.length === 0) return void 0

  const unavailableMarkers = [
    'windows subsystem for linux has no installed distributions',
    'windows subsystem for linux has not been enabled',
    'the windows subsystem for linux optional component is not enabled',
    'wsl is not installed',
    'run \'wsl.exe --install\'',
    'run "wsl.exe --install"',
    'wslregisterdistribution failed with error: 0x8007019e'
  ]

  return unavailableMarkers.some(marker => combinedOutput.includes(marker))
    ? combinedOutput
    : void 0
}

export async function collectDeclaredWslMirrorFiles(
  outputAdaptors: readonly OutputAdaptor[],
  ctx: OutputWriteContext
): Promise<readonly WslMirrorFileDeclaration[]> {
  const declarations = await Promise.all(outputAdaptors.map(async plugin => {
    if (!isOutputAdaptorEnabled(plugin, ctx.pluginOptions)) return []
    if (plugin.declareWslMirrorFiles == null) return []
    return plugin.declareWslMirrorFiles(ctx)
  }))

  const dedupedDeclarations = new Map<string, WslMirrorFileDeclaration>()
  for (const group of declarations) {
    for (const declaration of group) {
      dedupedDeclarations.set(declaration.sourcePath, declaration)
    }
  }

  return [...dedupedDeclarations.values()]
}

function buildWindowsMirrorPathRuntimeContext(
  hostHomeDir: string
): RuntimeEnvironmentContext {
  return {
    platform: 'win32',
    isWsl: false,
    nativeHomeDir: hostHomeDir,
    effectiveHomeDir: hostHomeDir,
    globalConfigCandidates: [],
    windowsUsersRoot: '',
    expandedEnv: {
      HOME: hostHomeDir,
      USERPROFILE: hostHomeDir
    }
  }
}

function buildWslHostMirrorPathRuntimeContext(
  hostHomeDir: string,
  nativeHomeDir: string
): RuntimeEnvironmentContext {
  return {
    platform: 'linux',
    isWsl: true,
    nativeHomeDir,
    effectiveHomeDir: hostHomeDir,
    globalConfigCandidates: [],
    windowsUsersRoot: '',
    expandedEnv: {
      HOME: hostHomeDir,
      USERPROFILE: hostHomeDir
    }
  }
}

function parseWslInstanceList(
  rawOutput: string
): string[] {
  const instanceList = rawOutput
    .split(/\r?\n/u)
    .map(line => line.replace(/^\*/u, '').trim())
    .filter(line => line.length > 0)

  return normalizeInstanceNames(instanceList)
}

function discoverWslInstances(
  logger: ILogger,
  dependencies?: WslMirrorRuntimeDependencies
): string[] {
  const spawnSyncImpl = getSpawnSync(dependencies)
  const listResult = spawnSyncImpl('wsl.exe', ['--list', '--quiet'], {
    shell: false,
    windowsHide: true
  })

  const unavailableReason = getWslUnavailableReason(listResult)
  if (unavailableReason != null) throw new WslUnavailableError(unavailableReason)

  if (listResult.status !== 0) {
    const stderr = getSpawnOutputText(listResult.stderr).trim()
    throw new Error(
      `Failed to enumerate WSL instances. ${stderr.length > 0 ? stderr : 'wsl.exe returned a non-zero exit status.'}`
    )
  }

  const discoveredInstances = parseWslInstanceList(getSpawnOutputText(listResult.stdout))
  logger.debug('Discovered WSL instances', {
    instances: discoveredInstances
  })
  return discoveredInstances
}

function resolveConfiguredOrDiscoveredInstances(
  pluginOptions: Required<AdaptorOptions>,
  logger: ILogger,
  dependencies?: WslMirrorRuntimeDependencies
): string[] {
  const configuredInstances = normalizeConfiguredInstances(pluginOptions)
  if (configuredInstances.length > 0) return configuredInstances
  return discoverWslInstances(logger, dependencies)
}

function resolveGeneratedWslMirrorSource(
  declaration: OutputFileDeclaration,
  hostHomeDir: string,
  platform: NodeJS.Platform
): ResolvedWslMirrorSource | undefined {
  if (declaration.scope !== 'global') return void 0

  const pathModule = getPathModuleForPlatform(platform)
  const sourcePath = pathModule.normalize(declaration.path)
  let relativePathSegments: string[]
  try {
    relativePathSegments = resolveMirroredRelativePathSegments(sourcePath, hostHomeDir, platform)
  }
  catch {
    return void 0
  }

  const [topLevelSegment] = relativePathSegments

  // Mirror home-style tool config roots only. Windows app-data trees such as
  // AppData\Local\JetBrains\... stay Windows-only even though they live under the user profile.
  if (!topLevelSegment?.startsWith('.')) return void 0

  return {
    kind: 'generated',
    sourcePath,
    relativePathSegments
  }
}

function collectGeneratedWslMirrorSources(
  predeclaredOutputs: ReadonlyMap<OutputAdaptor, readonly OutputFileDeclaration[]> | undefined,
  hostHomeDir: string,
  platform: NodeJS.Platform
): readonly ResolvedWslMirrorSource[] {
  if (predeclaredOutputs == null) return []

  const dedupedSources = new Map<string, ResolvedWslMirrorSource>()
  for (const declarations of predeclaredOutputs.values()) {
    for (const declaration of declarations) {
      const resolvedSource = resolveGeneratedWslMirrorSource(declaration, hostHomeDir, platform)
      if (resolvedSource == null) continue
      dedupedSources.set(resolvedSource.sourcePath, resolvedSource)
    }
  }

  return [...dedupedSources.values()]
}

function resolveDeclaredWslMirrorSource(
  declaration: WslMirrorFileDeclaration,
  pathRuntimeContext: RuntimeEnvironmentContext,
  hostHomeDir: string,
  platform: NodeJS.Platform
): ResolvedWslMirrorSource {
  const pathModule = getPathModuleForPlatform(platform)
  const sourcePath = pathModule.normalize(resolveUserPath(declaration.sourcePath, pathRuntimeContext))
  const relativePathSegments = resolveMirroredRelativePathSegments(sourcePath, hostHomeDir, platform)

  return {
    kind: 'declared',
    sourcePath,
    relativePathSegments
  }
}

function combineWslMirrorSources(
  mirrorDeclarations: readonly WslMirrorFileDeclaration[],
  generatedMirrorSources: readonly ResolvedWslMirrorSource[],
  pathRuntimeContext: RuntimeEnvironmentContext,
  hostHomeDir: string,
  platform: NodeJS.Platform
): {readonly sources: readonly ResolvedWslMirrorSource[], readonly errors: readonly string[]} {
  const dedupedSources = new Map<string, ResolvedWslMirrorSource>()
  const errors: string[] = []

  for (const declaration of mirrorDeclarations) {
    try {
      const resolvedSource = resolveDeclaredWslMirrorSource(declaration, pathRuntimeContext, hostHomeDir, platform)
      dedupedSources.set(resolvedSource.sourcePath, resolvedSource)
    }
    catch (error) {
      errors.push(error instanceof Error ? error.message : String(error))
    }
  }

  for (const source of generatedMirrorSources) {
    dedupedSources.set(source.sourcePath, source)
  }

  return {
    sources: [...dedupedSources.values()],
    errors
  }
}

export function resolveWslInstanceTargets(
  pluginOptions: Required<AdaptorOptions>,
  logger: ILogger,
  dependencies?: WslMirrorRuntimeDependencies
): ResolvedWslInstanceTarget[] {
  if (getPlatform(dependencies) !== 'win32') return []

  const configuredInstances = resolveConfiguredOrDiscoveredInstances(pluginOptions, logger, dependencies)
  if (configuredInstances.length === 0) return []

  const fsImpl = getFs(dependencies)
  const spawnSyncImpl = getSpawnSync(dependencies)
  const resolvedTargets: ResolvedWslInstanceTarget[] = []

  for (const instance of configuredInstances) {
    const probeResult = spawnSyncImpl('wsl.exe', ['-d', instance, 'sh', '-lc', 'printf %s "$HOME"'], {
      shell: false,
      windowsHide: true
    })

    const unavailableReason = getWslUnavailableReason(probeResult)
    if (unavailableReason != null) throw new WslUnavailableError(unavailableReason)

    if (probeResult.status !== 0) {
      const stderr = getSpawnOutputText(probeResult.stderr).trim()
      throw new Error(
        `Failed to probe WSL instance "${instance}". ${stderr.length > 0 ? stderr : 'wsl.exe returned a non-zero exit status.'}`
      )
    }

    const linuxHomeDir = getSpawnOutputText(probeResult.stdout).trim()
    if (linuxHomeDir.length === 0) throw new Error(`WSL instance "${instance}" returned an empty home directory.`)

    const windowsHomeDir = buildWindowsWslHomePath(instance, linuxHomeDir)
    if (!fsImpl.existsSync(windowsHomeDir)) {
      throw new Error(
        `WSL instance "${instance}" home directory is unavailable at "${windowsHomeDir}".`
      )
    }

    logger.debug('Resolved WSL instance home', {
      instance,
      linuxHomeDir,
      windowsHomeDir
    })

    resolvedTargets.push({
      instance,
      linuxHomeDir,
      windowsHomeDir
    })
  }

  return resolvedTargets
}

function syncResolvedMirrorSourcesIntoCurrentWslHome(
  sources: readonly ResolvedWslMirrorSource[],
  ctx: OutputWriteContext,
  dependencies?: WslMirrorRuntimeDependencies
): WslMirrorSyncResult {
  const fsImpl = getFs(dependencies)
  const nativeHomeDir = path.posix.normalize(getNativeHomeDir(dependencies))
  let mirroredFiles = 0
  const warnings: string[] = []
  const errors: string[] = []

  for (const source of sources) {
    if (source.kind === 'declared' && !fsImpl.existsSync(source.sourcePath)) {
      const warningMessage = `Skipping missing WSL mirror source file: ${source.sourcePath}`
      warnings.push(warningMessage)
      ctx.logger.warn({
        code: 'WSL_MIRROR_SOURCE_MISSING',
        title: 'WSL mirror source file is missing',
        rootCause: [warningMessage],
        exactFix: [
          'Create the source file on the Windows host or remove the WSL mirror declaration before retrying tnmsc.'
        ]
      })
      continue
    }

    const targetPath = path.posix.join(nativeHomeDir, ...source.relativePathSegments)
    try {
      if (ctx.dryRun === true) {
        ctx.logger.debug('Prepared WSL mirror preview for current runtime home', {
          sourcePath: source.sourcePath,
          targetPath,
          dryRun: true
        })
      } else {
        const content = fsImpl.readFileSync(source.sourcePath)
        fsImpl.mkdirSync(path.posix.dirname(targetPath), {recursive: true})
        fsImpl.writeFileSync(targetPath, content)
        ctx.logger.debug('Mirrored host config into the current WSL runtime home', {
          sourcePath: source.sourcePath,
          targetPath
        })
      }

      mirroredFiles += 1
    }
    catch (error) {
      errors.push(
        `Failed to mirror "${source.sourcePath}" into the current WSL home at "${targetPath}": ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  return {
    mirroredFiles,
    warnings,
    errors
  }
}

export async function syncWindowsConfigIntoWsl(
  outputAdaptors: readonly OutputAdaptor[],
  ctx: OutputWriteContext,
  dependencies?: WslMirrorRuntimeDependencies,
  predeclaredOutputs?: ReadonlyMap<OutputAdaptor, readonly OutputFileDeclaration[]>
): Promise<WslMirrorSyncResult> {
  const platform = getPlatform(dependencies)
  const wslRuntime = platform === 'linux' && isWslExecutionRuntime(dependencies)
  if (platform !== 'win32' && !wslRuntime) {
    return {
      mirroredFiles: 0,
      warnings: [],
      errors: []
    }
  }

  const hostHomeDir = wslRuntime
    ? path.posix.normalize(getHostHomeDir(dependencies))
    : path.win32.normalize(getHostHomeDir(dependencies))
  const mirrorDeclarations = await collectDeclaredWslMirrorFiles(outputAdaptors, ctx)
  const generatedMirrorSources = collectGeneratedWslMirrorSources(predeclaredOutputs, hostHomeDir, platform)
  if (mirrorDeclarations.length === 0 && generatedMirrorSources.length === 0) {
    return {
      mirroredFiles: 0,
      warnings: [],
      errors: []
    }
  }

  const pluginOptions = (ctx.pluginOptions ?? {}) as Required<AdaptorOptions>
  const nativeHomeDir = wslRuntime ? path.posix.normalize(getNativeHomeDir(dependencies)) : void 0
  const pathRuntimeContext = wslRuntime
    ? buildWslHostMirrorPathRuntimeContext(hostHomeDir, nativeHomeDir ?? hostHomeDir)
    : buildWindowsMirrorPathRuntimeContext(hostHomeDir)
  const resolvedMirrorSources = combineWslMirrorSources(
    mirrorDeclarations,
    generatedMirrorSources,
    pathRuntimeContext,
    hostHomeDir,
    platform
  )

  if (wslRuntime) {
    if (resolvedMirrorSources.sources.length === 0 || nativeHomeDir == null || hostHomeDir === nativeHomeDir) {
      return {
        mirroredFiles: 0,
        warnings: [],
        errors: [...resolvedMirrorSources.errors]
      }
    }

    const localMirrorResult = syncResolvedMirrorSourcesIntoCurrentWslHome(
      resolvedMirrorSources.sources,
      ctx,
      dependencies
    )

    return {
      mirroredFiles: localMirrorResult.mirroredFiles,
      warnings: [...localMirrorResult.warnings],
      errors: [...resolvedMirrorSources.errors, ...localMirrorResult.errors]
    }
  }

  let resolvedTargets: ResolvedWslInstanceTarget[]
  try {
    resolvedTargets = resolveWslInstanceTargets(pluginOptions, ctx.logger, dependencies)
  }
  catch (error) {
    if (error instanceof WslUnavailableError) {
      ctx.logger.info('wsl is unavailable, skipping WSL mirror sync')
      return {
        mirroredFiles: 0,
        warnings: [],
        errors: []
      }
    }

    return {
      mirroredFiles: 0,
      warnings: [],
      errors: [error instanceof Error ? error.message : String(error)]
    }
  }

  if (resolvedTargets.length === 0 || resolvedMirrorSources.sources.length === 0) {
    return {
      mirroredFiles: 0,
      warnings: [],
      errors: [...resolvedMirrorSources.errors]
    }
  }

  const fsImpl = getFs(dependencies)
  let mirroredFiles = 0
  const warnings: string[] = []
  const errors: string[] = [...resolvedMirrorSources.errors]

  for (const declaration of resolvedMirrorSources.sources) {
    if (declaration.kind === 'declared' && !fsImpl.existsSync(declaration.sourcePath)) {
      const warningMessage = `Skipping missing WSL mirror source file: ${declaration.sourcePath}`
      warnings.push(warningMessage)
      ctx.logger.warn({
        code: 'WSL_MIRROR_SOURCE_MISSING',
        title: 'WSL mirror source file is missing',
        rootCause: [warningMessage],
        exactFix: [
          'Create the source file on the Windows host or remove the WSL mirror declaration before retrying tnmsc.'
        ]
      })
      continue
    }

    const {relativePathSegments, sourcePath} = declaration

    for (const resolvedTarget of resolvedTargets) {
      const targetPath = path.win32.join(resolvedTarget.windowsHomeDir, ...relativePathSegments)

      try {
        if (ctx.dryRun === true) {
          ctx.logger.debug('Prepared WSL mirror preview', {
            instance: resolvedTarget.instance,
            sourcePath,
            targetPath,
            dryRun: true
          })
        } else {
          const content = fsImpl.readFileSync(sourcePath)
          fsImpl.mkdirSync(path.win32.dirname(targetPath), {recursive: true})
          fsImpl.writeFileSync(targetPath, content)
          ctx.logger.debug('Mirrored Windows config into WSL', {
            instance: resolvedTarget.instance,
            sourcePath,
            targetPath
          })
        }

        mirroredFiles += 1
      }
      catch (error) {
        errors.push(
          `Failed to mirror "${sourcePath}" into WSL instance "${resolvedTarget.instance}" at "${targetPath}": ${error instanceof Error ? error.message : String(error)}`
        )
      }
    }
  }

  return {
    mirroredFiles,
    warnings,
    errors
  }
}
