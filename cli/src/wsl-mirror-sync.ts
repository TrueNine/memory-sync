import type {
  ILogger,
  OutputPlugin,
  OutputWriteContext,
  PluginOptions,
  WslMirrorFileDeclaration
} from './plugins/plugin-core'
import type {RuntimeEnvironmentContext} from './runtime-environment'
import {spawnSync} from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import process from 'node:process'
import {getEffectiveHomeDir, resolveUserPath} from './runtime-environment'

type MirrorFs = Pick<typeof fs, 'existsSync' | 'mkdirSync' | 'readFileSync' | 'writeFileSync'>
type SpawnSyncFn = typeof spawnSync
type SpawnSyncResult = ReturnType<SpawnSyncFn>

export interface WslMirrorRuntimeDependencies {
  readonly fs?: MirrorFs
  readonly spawnSync?: SpawnSyncFn
  readonly platform?: NodeJS.Platform
  readonly effectiveHomeDir?: string
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

function normalizeConfiguredInstances(
  pluginOptions?: PluginOptions
): string[] {
  const configuredInstances = pluginOptions?.windows?.wsl2?.instances
  const instanceList = configuredInstances == null
    ? []
    : Array.isArray(configuredInstances)
      ? configuredInstances
      : [configuredInstances]

  const normalizedInstances = instanceList
    .map(instance => instance.trim())
    .filter(instance => instance.length > 0)

  return [...new Set(normalizedInstances)]
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

function validateMirroredSourcePath(
  sourcePath: string,
  hostHomeDir: string
): string {
  const normalizedHostHome = path.win32.normalize(hostHomeDir)
  const normalizedSourcePath = path.win32.normalize(sourcePath)
  const relativePath = path.win32.relative(normalizedHostHome, normalizedSourcePath)

  if (
    relativePath.length === 0
    || relativePath.startsWith('..')
    || path.win32.isAbsolute(relativePath)
  ) {
    throw new Error(
      `WSL mirror source "${sourcePath}" must stay under the host home directory "${hostHomeDir}".`
    )
  }

  return relativePath
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
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
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
  outputPlugins: readonly OutputPlugin[],
  ctx: OutputWriteContext
): Promise<readonly WslMirrorFileDeclaration[]> {
  const declarations = await Promise.all(outputPlugins.map(async plugin => {
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

export function resolveWslInstanceTargets(
  pluginOptions: Required<PluginOptions>,
  logger: ILogger,
  dependencies?: WslMirrorRuntimeDependencies
): ResolvedWslInstanceTarget[] {
  if (getPlatform(dependencies) !== 'win32') return []

  const configuredInstances = normalizeConfiguredInstances(pluginOptions)
  if (configuredInstances.length === 0) return []

  const fsImpl = getFs(dependencies)
  const spawnSyncImpl = getSpawnSync(dependencies)
  const resolvedTargets: ResolvedWslInstanceTarget[] = []

  for (const instance of configuredInstances) {
    const probeResult = spawnSyncImpl('wsl.exe', ['-d', instance, 'sh', '-lc', 'printf %s "$HOME"'], {
      encoding: 'utf8',
      shell: false,
      windowsHide: true
    })

    const unavailableReason = getWslUnavailableReason(probeResult)
    if (unavailableReason != null) throw new WslUnavailableError(unavailableReason)

    if (probeResult.status !== 0) {
      const stderr = typeof probeResult.stderr === 'string' ? probeResult.stderr.trim() : ''
      throw new Error(
        `Failed to probe WSL instance "${instance}". ${stderr.length > 0 ? stderr : 'wsl.exe returned a non-zero exit status.'}`
      )
    }

    const linuxHomeDir = typeof probeResult.stdout === 'string' ? probeResult.stdout.trim() : ''
    if (linuxHomeDir.length === 0) throw new Error(`WSL instance "${instance}" returned an empty home directory.`)

    const windowsHomeDir = buildWindowsWslHomePath(instance, linuxHomeDir)
    if (!fsImpl.existsSync(windowsHomeDir)) {
      throw new Error(
        `WSL instance "${instance}" home directory is unavailable at "${windowsHomeDir}".`
      )
    }

    logger.info('resolved wsl instance home', {
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

export async function syncWindowsConfigIntoWsl(
  outputPlugins: readonly OutputPlugin[],
  ctx: OutputWriteContext,
  dependencies?: WslMirrorRuntimeDependencies
): Promise<WslMirrorSyncResult> {
  if (getPlatform(dependencies) !== 'win32') {
    return {
      mirroredFiles: 0,
      warnings: [],
      errors: []
    }
  }

  const mirrorDeclarations = await collectDeclaredWslMirrorFiles(outputPlugins, ctx)
  if (mirrorDeclarations.length === 0) {
    return {
      mirroredFiles: 0,
      warnings: [],
      errors: []
    }
  }

  const pluginOptions = (ctx.pluginOptions ?? {}) as Required<PluginOptions>
  let resolvedTargets: ResolvedWslInstanceTarget[]
  try {
    resolvedTargets = resolveWslInstanceTargets(pluginOptions, ctx.logger, dependencies)
  }
  catch (error) {
    if (error instanceof WslUnavailableError) {
      ctx.logger.info('wsl is unavailable, skipping WSL mirror sync', {
        reason: error.message
      })
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

  if (resolvedTargets.length === 0) {
    return {
      mirroredFiles: 0,
      warnings: [],
      errors: []
    }
  }

  const fsImpl = getFs(dependencies)
  const hostHomeDir = path.win32.normalize(getHostHomeDir(dependencies))
  const pathRuntimeContext: RuntimeEnvironmentContext = {
    platform: getPlatform(dependencies),
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
  let mirroredFiles = 0
  const warnings: string[] = []
  const errors: string[] = []

  for (const declaration of mirrorDeclarations) {
    let sourcePath: string,
      relativeHomePath: string

    try {
      sourcePath = path.win32.normalize(resolveUserPath(declaration.sourcePath, pathRuntimeContext))
      relativeHomePath = validateMirroredSourcePath(sourcePath, hostHomeDir)
    }
    catch (error) {
      errors.push(error instanceof Error ? error.message : String(error))
      continue
    }

    if (!fsImpl.existsSync(sourcePath)) {
      const warningMessage = `Skipping missing WSL mirror source file: ${sourcePath}`
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

    for (const resolvedTarget of resolvedTargets) {
      const targetPath = path.win32.join(resolvedTarget.windowsHomeDir, relativeHomePath)

      try {
        if (ctx.dryRun === true) {
          ctx.logger.info('would mirror windows config into wsl', {
            instance: resolvedTarget.instance,
            sourcePath,
            targetPath,
            dryRun: true
          })
        } else {
          const content = fsImpl.readFileSync(sourcePath)
          fsImpl.mkdirSync(path.win32.dirname(targetPath), {recursive: true})
          fsImpl.writeFileSync(targetPath, content)
          ctx.logger.info('mirrored windows config into wsl', {
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
