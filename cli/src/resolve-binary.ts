import {existsSync, realpathSync} from 'node:fs'
import {createRequire} from 'node:module'
import {dirname, join, resolve} from 'node:path'
import process from 'node:process'
import {fileURLToPath, pathToFileURL} from 'node:url'

const __filename = realpathSync(fileURLToPath(import.meta.url))
const __dirname = dirname(__filename)
const require = createRequire(pathToFileURL(__filename))

interface PlatformTarget {
  readonly packageName: string
  readonly packageBinaryRelativePath: string
  readonly distBinaryRelativePath: string
}

function getPlatformTarget(): PlatformTarget | undefined {
  const {platform} = process
  const {arch} = process
  const isGlibcLinux
    = platform === 'linux' && typeof process.report?.getReport === 'function'
      ? ((process.report.getReport() as {header?: {glibcVersion?: string}}).header?.glibcVersion ?? '').length > 0
      : false

  if (platform === 'darwin' && arch === 'arm64') {
    return {
      packageName: '@truenine/memory-sync-cli-darwin',
      packageBinaryRelativePath: 'bin/arm64/tnmsc',
      distBinaryRelativePath: 'darwin/arm64/tnmsc'
    }
  }

  if (platform === 'darwin' && arch === 'x64') {
    return {
      packageName: '@truenine/memory-sync-cli-darwin',
      packageBinaryRelativePath: 'bin/x64/tnmsc',
      distBinaryRelativePath: 'darwin/x64/tnmsc'
    }
  }

  if (platform === 'linux' && arch === 'arm64' && isGlibcLinux) {
    return {
      packageName: '@truenine/memory-sync-cli-linux',
      packageBinaryRelativePath: 'bin/arm64-gnu/tnmsc',
      distBinaryRelativePath: 'linux/arm64-gnu/tnmsc'
    }
  }

  if (platform === 'linux' && arch === 'x64' && isGlibcLinux) {
    return {
      packageName: '@truenine/memory-sync-cli-linux',
      packageBinaryRelativePath: 'bin/x64-gnu/tnmsc',
      distBinaryRelativePath: 'linux/x64-gnu/tnmsc'
    }
  }

  if (platform === 'win32' && arch === 'x64') {
    return {
      packageName: '@truenine/memory-sync-cli-win32',
      packageBinaryRelativePath: 'bin/x64-msvc/tnmsc.exe',
      distBinaryRelativePath: 'win32/x64-msvc/tnmsc.exe'
    }
  }

  return void 0
}

function findBinaryFromPlatformPackage(): string | undefined {
  const target = getPlatformTarget()
  if (target == null) return void 0

  try {
    const packageDir = dirname(require.resolve(`${target.packageName}/package.json`))
    const binaryPath = join(packageDir, target.packageBinaryRelativePath)
    if (existsSync(binaryPath)) return binaryPath
  } catch {
    // Platform package not installed — optional dependency was skipped.
  }

  return void 0
}

function findBinaryFromBundledNativeDist(): string | undefined {
  const target = getPlatformTarget()
  if (target == null) return void 0

  const candidates = [
    resolve(__dirname, 'native', target.distBinaryRelativePath),
    resolve(__dirname, '..', 'dist', 'native', target.distBinaryRelativePath)
  ]

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }

  return void 0
}

function findBinaryInLocalTargetDir(): string | undefined {
  const binaryName = process.platform === 'win32' ? 'tnmsc.exe' : 'tnmsc'
  const candidates = [
    resolve(__dirname, '..', '..', 'target', 'debug', binaryName),
    resolve(__dirname, '..', '..', 'target', 'release', binaryName)
  ]

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }

  return void 0
}

export function resolveTnmscBinary(): string {
  const fromBundledDist = findBinaryFromBundledNativeDist()
  if (fromBundledDist != null) return fromBundledDist

  const fromPlatform = findBinaryFromPlatformPackage()
  if (fromPlatform != null) return fromPlatform

  const fromLocalTarget = findBinaryInLocalTargetDir()
  if (fromLocalTarget != null) return fromLocalTarget

  throw new Error(
    `Unable to resolve the native tnmsc binary for ${process.platform}-${process.arch}. Install the matching CLI platform package or run \`pnpm -C cli run build\`.`
  )
}
