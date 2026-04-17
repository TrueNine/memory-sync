#!/usr/bin/env tsx

import {spawnSync} from 'node:child_process'
import {chmodSync, copyFileSync, existsSync, mkdirSync, rmSync} from 'node:fs'
import {dirname, resolve} from 'node:path'
import process from 'node:process'
import {fileURLToPath} from 'node:url'

interface NativeTarget {
  readonly suffix: string
  readonly rustTarget: string
  readonly binaryName: string
  readonly packageDir: string
  readonly packageBinaryRelativePath: string
  readonly distBinaryRelativePath: string
  readonly platform: NodeJS.Platform
  readonly arch: NodeJS.Architecture
}

const __dirname = dirname(fileURLToPath(import.meta.url))
const cliDir = resolve(__dirname, '..')
const workspaceDir = resolve(cliDir, '..')
const targetDir = resolve(workspaceDir, 'target')
const distNativeDir = resolve(cliDir, 'dist', 'native')
const npmDir = resolve(cliDir, 'npm')

const SUPPORTED_TARGETS: readonly NativeTarget[] = [
  {
    suffix: 'linux-x64-gnu',
    rustTarget: 'x86_64-unknown-linux-gnu',
    binaryName: 'tnmsc',
    packageDir: 'linux',
    packageBinaryRelativePath: 'bin/x64-gnu/tnmsc',
    distBinaryRelativePath: 'linux/x64-gnu/tnmsc',
    platform: 'linux',
    arch: 'x64'
  },
  {
    suffix: 'linux-arm64-gnu',
    rustTarget: 'aarch64-unknown-linux-gnu',
    binaryName: 'tnmsc',
    packageDir: 'linux',
    packageBinaryRelativePath: 'bin/arm64-gnu/tnmsc',
    distBinaryRelativePath: 'linux/arm64-gnu/tnmsc',
    platform: 'linux',
    arch: 'arm64'
  },
  {
    suffix: 'darwin-arm64',
    rustTarget: 'aarch64-apple-darwin',
    binaryName: 'tnmsc',
    packageDir: 'darwin',
    packageBinaryRelativePath: 'bin/arm64/tnmsc',
    distBinaryRelativePath: 'darwin/arm64/tnmsc',
    platform: 'darwin',
    arch: 'arm64'
  },
  {
    suffix: 'darwin-x64',
    rustTarget: 'x86_64-apple-darwin',
    binaryName: 'tnmsc',
    packageDir: 'darwin',
    packageBinaryRelativePath: 'bin/x64/tnmsc',
    distBinaryRelativePath: 'darwin/x64/tnmsc',
    platform: 'darwin',
    arch: 'x64'
  },
  {
    suffix: 'win32-x64-msvc',
    rustTarget: 'x86_64-pc-windows-msvc',
    binaryName: 'tnmsc.exe',
    packageDir: 'win32',
    packageBinaryRelativePath: 'bin/x64-msvc/tnmsc.exe',
    distBinaryRelativePath: 'win32/x64-msvc/tnmsc.exe',
    platform: 'win32',
    arch: 'x64'
  }
] as const

function getArgValue(flag: string): string | undefined {
  const direct = process.argv.find(value => value.startsWith(`${flag}=`))
  if (direct != null) return direct.slice(flag.length + 1)

  const index = process.argv.findIndex(value => value === flag)
  if (index >= 0) return process.argv[index + 1]

  return void 0
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag)
}

function fail(message: string): never {
  throw new Error(message)
}

function resolveHostTarget(): NativeTarget {
  const target = SUPPORTED_TARGETS.find(
    candidate => candidate.platform === process.platform && candidate.arch === process.arch
  )

  if (target == null) {
    fail(`Unsupported host platform for native CLI build: ${process.platform}-${process.arch}`)
  }

  return target
}

function resolveRequestedTargets(): readonly NativeTarget[] {
  const requested = getArgValue('--targets') ?? process.env.TNMSC_CLI_NATIVE_TARGETS ?? 'host'

  if (requested === 'host') {
    return [resolveHostTarget()]
  }

  if (requested === 'all') {
    return SUPPORTED_TARGETS
  }

  const targets = requested
    .split(',')
    .map(value => value.trim())
    .filter(value => value.length > 0)
    .map(value => {
      const target = SUPPORTED_TARGETS.find(
        candidate => candidate.suffix === value || candidate.rustTarget === value || candidate.packageDir === value
      )

      if (target == null) {
        fail(`Unknown native target: ${value}`)
      }

      return target
    })

  if (targets.length === 0) {
    fail('No native targets were selected.')
  }

  return targets
}

function run(command: string, args: readonly string[]): void {
  const result = spawnSync(command, args, {
    cwd: workspaceDir,
    stdio: 'inherit'
  })

  if (result.error != null) {
    throw result.error
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

function getBuiltBinaryPath(target: NativeTarget): string {
  return resolve(targetDir, target.rustTarget, 'release', target.binaryName)
}

function getPackagedBinaryPath(target: NativeTarget): string {
  return resolve(npmDir, target.packageDir, target.packageBinaryRelativePath)
}

function getDistBinaryPath(target: NativeTarget): string {
  return resolve(distNativeDir, target.distBinaryRelativePath)
}

function getArtifactBinaryPath(target: NativeTarget, artifactsDir: string): string {
  return resolve(artifactsDir, `cli-binary-${target.suffix}`, target.binaryName)
}

function ensureExecutableIfNeeded(filePath: string, binaryName: string): void {
  if (binaryName.endsWith('.exe')) return
  chmodSync(filePath, 0o755)
}

function copyBinary(sourcePath: string, targetPath: string, binaryName: string): void {
  mkdirSync(dirname(targetPath), {recursive: true})
  copyFileSync(sourcePath, targetPath)
  ensureExecutableIfNeeded(targetPath, binaryName)
}

function buildTarget(target: NativeTarget): void {
  run('cargo', ['build', '--release', '--target', target.rustTarget, '-p', 'tnmsc-cli-shell'])

  const builtBinaryPath = getBuiltBinaryPath(target)
  if (!existsSync(builtBinaryPath)) {
    fail(`Expected compiled native CLI at "${builtBinaryPath}".`)
  }

  copyBinary(builtBinaryPath, getPackagedBinaryPath(target), target.binaryName)
}

function importArtifactTarget(target: NativeTarget, artifactsDir: string): void {
  const artifactBinaryPath = getArtifactBinaryPath(target, artifactsDir)
  if (!existsSync(artifactBinaryPath)) {
    fail(`Expected artifact binary at "${artifactBinaryPath}".`)
  }

  copyBinary(artifactBinaryPath, getPackagedBinaryPath(target), target.binaryName)
}

function syncPlatformPackagesIntoDist(): void {
  rmSync(distNativeDir, {recursive: true, force: true})

  for (const target of SUPPORTED_TARGETS) {
    const packagedBinaryPath = getPackagedBinaryPath(target)
    if (!existsSync(packagedBinaryPath)) continue
    copyBinary(packagedBinaryPath, getDistBinaryPath(target), target.binaryName)
  }
}

const targets = resolveRequestedTargets()
const artifactsDir = getArgValue('--artifacts-dir')
const skipBuild = hasFlag('--skip-build')

if (artifactsDir != null) {
  for (const target of targets) {
    importArtifactTarget(target, artifactsDir)
  }
} else if (!skipBuild) {
  for (const target of targets) {
    buildTarget(target)
  }
}

syncPlatformPackagesIntoDist()
