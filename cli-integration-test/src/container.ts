import {spawnSync} from 'node:child_process'
import {statSync} from 'node:fs'
import path from 'node:path'
import type {StartedTestContainer} from 'testcontainers'
import {GenericContainer} from 'testcontainers'

import type {CliIntegrationArtifacts} from './artifacts'
import {
  CONTAINER_EXTERNAL_CWD,
  CONTAINER_HOME_DIR,
  CONTAINER_WORKSPACE_DIR
} from './fixtures'

const NODE_IMAGE = 'node:22-trixie'
const BASE_IMAGE_REPOSITORY = 'tnmsc-cli-integration'
const MAX_BUFFER = 16 * 1024 * 1024

let cachedPreparedBaseImage: string | undefined
let baseImageCleanupRegistered = false

export interface ContainerExecResult {
  readonly command: string
  readonly cwd: string
  readonly stdout: string
  readonly stderr: string
  readonly exitCode: number
}

export interface InstalledCliResolution {
  readonly mainPackageDir: string
  readonly platformPackageDir: string
  readonly resolvedAddonPath: string
  readonly scriptRuntimePackagePath: string
}

export interface CliIntegrationFixture {
  readonly homeDir: string
  readonly workspaceDir: string
}

function quoteShell(value: string): string {
  return `'${value.replaceAll(`'`, `'\"'\"'`)}'`
}

function runDockerCommand(args: readonly string[]): {
  readonly stdout: string
  readonly stderr: string
  readonly exitCode: number
} {
  const result = spawnSync('docker', args, {
    encoding: 'utf8',
    maxBuffer: MAX_BUFFER
  })

  if (result.error != null) throw result.error

  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    exitCode: result.status ?? 1
  }
}

function assertDockerCommandSucceeded(
  args: readonly string[],
  result: {
    readonly stdout: string
    readonly stderr: string
    readonly exitCode: number
  }
): void {
  if (result.exitCode === 0) return

  throw new Error([
    `Docker command failed: docker ${args.join(' ')}`,
    `${result.stdout}${result.stderr}`.trim() || 'No output captured.'
  ].join('\n'))
}

function registerBaseImageCleanup(): void {
  if (baseImageCleanupRegistered) return

  baseImageCleanupRegistered = true
  process.once('exit', () => {
    cleanupPreparedCliIntegrationBaseImage()
  })
}

function cleanupPreparedCliIntegrationBaseImage(): void {
  if (cachedPreparedBaseImage == null) return

  runDockerCommand(['rmi', '-f', cachedPreparedBaseImage])
  cachedPreparedBaseImage = void 0
}

function shellScript(command: string, cwd: string): string {
  return [
    'set -eu',
    `export HOME=${quoteShell(CONTAINER_HOME_DIR)}`,
    'export PNPM_HOME=/pnpm',
    'export PATH="$PNPM_HOME:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"',
    `mkdir -p "$PNPM_HOME" /artifacts ${quoteShell(CONTAINER_WORKSPACE_DIR)} ${quoteShell(CONTAINER_EXTERNAL_CWD)}`,
    `cd ${quoteShell(cwd)}`,
    command
  ].join('\n')
}

function buildPinnedGlobalCliPlatformLinkScript(): string {
  return [
    'GLOBAL_ROOT="$(pnpm root -g)"',
    'PNPM_STORE_DIR="$(dirname "$GLOBAL_ROOT")/.pnpm"',
    'MAIN_STORE_DIR="$(find "$PNPM_STORE_DIR" -maxdepth 1 -type d -name \'@truenine+memory-sync-cli@file*\' | head -n 1)"',
    'PLATFORM_STORE_DIR="$(find "$PNPM_STORE_DIR" -maxdepth 1 -type d -name \'@truenine+memory-sync-cli-linux-x64-gnu@file*\' | head -n 1)"',
    'test -n "$MAIN_STORE_DIR"',
    'test -n "$PLATFORM_STORE_DIR"',
    'MAIN_PACKAGE_DIR="$MAIN_STORE_DIR/node_modules/@truenine/memory-sync-cli"',
    'PLATFORM_PACKAGE_DIR="$PLATFORM_STORE_DIR/node_modules/@truenine/memory-sync-cli-linux-x64-gnu"',
    'mkdir -p "$MAIN_PACKAGE_DIR/node_modules/@truenine"',
    'rm -rf "$MAIN_PACKAGE_DIR/node_modules/@truenine/memory-sync-cli-linux-x64-gnu"',
    'ln -s "$PLATFORM_PACKAGE_DIR" "$MAIN_PACKAGE_DIR/node_modules/@truenine/memory-sync-cli-linux-x64-gnu"',
    'node -e \'',
    'const {createRequire} = require("node:module");',
    'const path = require("node:path");',
    'const mainPackageDir = process.argv[1];',
    'const requireFromBridge = createRequire(path.join(mainPackageDir, "dist", "internal", "native-command-bridge.mjs"));',
    'const addon = requireFromBridge("@truenine/memory-sync-cli-linux-x64-gnu/napi-memory-sync-cli.linux-x64-gnu.node");',
    'const resolvedAddonPath = requireFromBridge.resolve("@truenine/memory-sync-cli-linux-x64-gnu/napi-memory-sync-cli.linux-x64-gnu.node");',
    'if (typeof addon.collectDroidOutputPlan !== "function") {',
    '  console.error("Pinned CLI platform package is missing collectDroidOutputPlan.");',
    '  process.exit(1);',
    '}',
    'if (!resolvedAddonPath.includes("@file+")) {',
    '  console.error(`Pinned CLI platform package resolved to a non-local path: ${resolvedAddonPath}`);',
    '  process.exit(1);',
    '}',
    '\' "$MAIN_PACKAGE_DIR"'
  ].join('\n')
}

function containerTarballPath(hostTarballPath: string): string {
  return path.posix.join('/artifacts', path.basename(hostTarballPath))
}

export class PreparedCliIntegrationContainer {
  constructor(
    private readonly startedContainer: StartedTestContainer,
    private readonly containerId: string
  ) {}

  exec(command: string, cwd: string = CONTAINER_EXTERNAL_CWD): ContainerExecResult {
    const args = ['exec', this.containerId, 'sh', '-lc', shellScript(command, cwd)]
    const result = runDockerCommand(args)

    return {
      command,
      cwd,
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode
    }
  }

  assertExecSuccess(
    command: string,
    cwd: string = CONTAINER_EXTERNAL_CWD
  ): ContainerExecResult {
    const result = this.exec(command, cwd)
    if (result.exitCode === 0) return result

    throw new Error([
      `Container command failed in "${cwd}": ${command}`,
      `${result.stdout}${result.stderr}`.trim() || 'No output captured.'
    ].join('\n'))
  }

  pathExists(targetPath: string): boolean {
    return this.exec(`test -e ${quoteShell(targetPath)}`, '/').exitCode === 0
  }

  readFile(targetPath: string): string {
    return this.assertExecSuccess(`cat ${quoteShell(targetPath)}`, '/').stdout
  }

  inspectInstalledCliResolution(): InstalledCliResolution {
    const script = [
      'const {createRequire} = require("node:module");',
      'const path = require("node:path");',
      'const globalRoot = process.argv[1];',
      'const mainPackageDir = process.argv[2];',
      'const platformPackageDir = process.argv[3];',
      'const requireFromBridge = createRequire(path.join(mainPackageDir, "dist", "internal", "native-command-bridge.mjs"));',
      'const resolvedAddonPath = requireFromBridge.resolve("@truenine/memory-sync-cli-linux-x64-gnu/napi-memory-sync-cli.linux-x64-gnu.node");',
      'const scriptRuntimePackagePath = requireFromBridge.resolve("@truenine/script-runtime/package.json");',
      'process.stdout.write(JSON.stringify({',
      '  mainPackageDir,',
      '  platformPackageDir,',
      '  resolvedAddonPath,',
      '  scriptRuntimePackagePath',
      '}));'
    ].join(' ')

    const result = this.assertExecSuccess([
      'GLOBAL_ROOT="$(pnpm root -g)"',
      'PNPM_STORE_DIR="$(dirname "$GLOBAL_ROOT")/.pnpm"',
      'MAIN_STORE_DIR="$(find "$PNPM_STORE_DIR" -maxdepth 1 -type d -name \'@truenine+memory-sync-cli@file*\' | head -n 1)"',
      'PLATFORM_STORE_DIR="$(find "$PNPM_STORE_DIR" -maxdepth 1 -type d -name \'@truenine+memory-sync-cli-linux-x64-gnu@file*\' | head -n 1)"',
      'test -n "$MAIN_STORE_DIR"',
      'test -n "$PLATFORM_STORE_DIR"',
      'MAIN_PACKAGE_DIR="$MAIN_STORE_DIR/node_modules/@truenine/memory-sync-cli"',
      'PLATFORM_PACKAGE_DIR="$PLATFORM_STORE_DIR/node_modules/@truenine/memory-sync-cli-linux-x64-gnu"',
      `node -e ${quoteShell(script)} "$GLOBAL_ROOT" "$MAIN_PACKAGE_DIR" "$PLATFORM_PACKAGE_DIR"`
    ].join(' && '))

    return JSON.parse(result.stdout) as InstalledCliResolution
  }

  async stop(): Promise<void> {
    await this.startedContainer.stop()
  }

  private copyPathToContainer(sourcePath: string, targetPath: string): void {
    const sourceStat = statSync(sourcePath)
    const prepareTargetCommand = sourceStat.isDirectory()
      ? `mkdir -p ${quoteShell(targetPath)}`
      : `mkdir -p ${quoteShell(path.posix.dirname(targetPath))}`
    this.assertExecSuccess(prepareTargetCommand, '/')

    const copySource = sourceStat.isDirectory()
      ? `${sourcePath}${path.sep}.`
      : sourcePath

    const args = ['cp', copySource, `${this.containerId}:${targetPath}`]
    const result = runDockerCommand(args)
    assertDockerCommandSucceeded(args, result)
  }

  copyFixture(fixture: CliIntegrationFixture): void {
    this.copyPathToContainer(fixture.homeDir, CONTAINER_HOME_DIR)
    this.copyPathToContainer(fixture.workspaceDir, CONTAINER_WORKSPACE_DIR)
  }

  copyArtifacts(artifacts: CliIntegrationArtifacts): void {
    this.copyPathToContainer(artifacts.cliTarballPath, containerTarballPath(artifacts.cliTarballPath))
    this.copyPathToContainer(artifacts.linuxTarballPath, containerTarballPath(artifacts.linuxTarballPath))
    this.copyPathToContainer(
      artifacts.scriptRuntimeTarballPath,
      containerTarballPath(artifacts.scriptRuntimeTarballPath)
    )
  }

  bootstrapLatestPnpmAndInstallCli(artifacts: CliIntegrationArtifacts): void {
    const cliTarball = containerTarballPath(artifacts.cliTarballPath)
    const linuxTarball = containerTarballPath(artifacts.linuxTarballPath)
    const scriptRuntimeTarball = containerTarballPath(artifacts.scriptRuntimeTarballPath)

    this.assertExecSuccess(
      [
        'corepack enable',
        `corepack prepare pnpm@${quoteShell(artifacts.latestPnpmVersion)} --activate`,
        'pnpm --version',
        `pnpm add -g ${quoteShell(cliTarball)} ${quoteShell(linuxTarball)} ${quoteShell(scriptRuntimeTarball)}`,
        buildPinnedGlobalCliPlatformLinkScript(),
        'command -v tnmsc >/dev/null'
      ].join(' && ')
    )
  }
}

async function createPreparedCliIntegrationBaseImage(
  artifacts: CliIntegrationArtifacts
): Promise<string> {
  if (cachedPreparedBaseImage != null) return cachedPreparedBaseImage

  registerBaseImageCleanup()

  const startedContainer = await new GenericContainer(NODE_IMAGE)
    .withCommand(['sh', '-lc', 'while true; do sleep 3600; done'])
    .start()

  const container = new PreparedCliIntegrationContainer(
    startedContainer,
    startedContainer.getId()
  )

  const imageTag = `${BASE_IMAGE_REPOSITORY}:${process.pid}-${Date.now()}`

  try {
    container.copyArtifacts(artifacts)
    container.bootstrapLatestPnpmAndInstallCli(artifacts)

    const commitArgs = ['commit', startedContainer.getId(), imageTag]
    const commitResult = runDockerCommand(commitArgs)
    assertDockerCommandSucceeded(commitArgs, commitResult)

    cachedPreparedBaseImage = imageTag
    return imageTag
  }
  catch (error) {
    runDockerCommand(['rmi', '-f', imageTag])
    throw error
  }
  finally {
    await startedContainer.stop()
  }
}

export async function createPreparedCliIntegrationContainer(
  artifacts: CliIntegrationArtifacts,
  fixture: CliIntegrationFixture
): Promise<PreparedCliIntegrationContainer> {
  const baseImage = await createPreparedCliIntegrationBaseImage(artifacts)
  const startedContainer = await new GenericContainer(baseImage)
    .withCommand(['sh', '-lc', 'while true; do sleep 3600; done'])
    .start()

  const container = new PreparedCliIntegrationContainer(
    startedContainer,
    startedContainer.getId()
  )

  try {
    container.copyFixture(fixture)
    return container
  } catch (error) {
    await startedContainer.stop()
    throw error
  }
}
