import { spawnSync } from "node:child_process";
import { statSync } from "node:fs";
import path from "node:path";
import { GenericContainer } from "testcontainers";

import type { CliIntegrationArtifacts } from "./artifacts";
import { CONTAINER_EXTERNAL_CWD, CONTAINER_HOME_DIR, CONTAINER_WORKSPACE_DIR } from "./fixtures";

const NODE_IMAGE = "node:22-trixie";
const BASE_IMAGE_REPOSITORY = "tnmsc-cli-integration";
const MAX_BUFFER = 16 * 1024 * 1024;

let cachedPreparedBaseImage: string | undefined;
let baseImageCleanupRegistered = false;

export interface ContainerExecResult {
  readonly command: string;
  readonly cwd: string;
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

export interface InstalledCliResolution {
  readonly mainPackageDir: string;
  readonly platformPackageDir: string;
}

export interface CliIntegrationFixture {
  readonly homeDir: string;
  readonly workspaceDir: string;
}

function quoteShell(value: string): string {
  return `'${value.replaceAll(`'`, `'\"'\"'`)}'`;
}

function runDockerCommand(args: readonly string[]): {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
} {
  const result = spawnSync("docker", args, {
    encoding: "utf8",
    maxBuffer: MAX_BUFFER,
  });

  if (result.error != null) throw result.error;

  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    exitCode: result.status ?? 1,
  };
}

function assertDockerCommandSucceeded(
  args: readonly string[],
  result: {
    readonly stdout: string;
    readonly stderr: string;
    readonly exitCode: number;
  },
): void {
  if (result.exitCode === 0) return;

  throw new Error([`Docker command failed: docker ${args.join(" ")}`, `${result.stdout}${result.stderr}`.trim() || "No output captured."].join("\n"));
}

function registerBaseImageCleanup(): void {
  if (baseImageCleanupRegistered) return;

  baseImageCleanupRegistered = true;
  process.once("exit", () => {
    cleanupPreparedCliIntegrationBaseImage();
  });
}

function cleanupPreparedCliIntegrationBaseImage(): void {
  if (cachedPreparedBaseImage == null) return;

  runDockerCommand(["rmi", "-f", cachedPreparedBaseImage]);
  cachedPreparedBaseImage = void 0;
}

function removeDockerContainer(containerId: string): void {
  const args = ["rm", "-f", "-v", containerId];
  const result = runDockerCommand(args);

  if (result.exitCode === 0) return;
  if (result.stderr.includes("No such container")) return;

  assertDockerCommandSucceeded(args, result);
}

async function startBackgroundContainer(image: string): Promise<string> {
  const startedContainer = await new GenericContainer(image).withCommand(["sh", "-lc", "while true; do sleep 3600; done"]).start();
  return startedContainer.getId();
}

function shellScript(command: string, cwd: string): string {
  return [
    "set -eu",
    `export HOME=${quoteShell(CONTAINER_HOME_DIR)}`,
    "export PNPM_HOME=/pnpm",
    'export PATH="$PNPM_HOME:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"',
    `mkdir -p "$PNPM_HOME" /artifacts ${quoteShell(CONTAINER_WORKSPACE_DIR)} ${quoteShell(CONTAINER_EXTERNAL_CWD)}`,
    `cd ${quoteShell(cwd)}`,
    command,
  ].join("\n");
}

function buildPinnedGlobalCliPlatformLinkScript(): string {
  return [
    'MAIN_PACKAGE_JSON="$(find -L /pnpm/global -path \'*/@truenine/memory-sync-cli/package.json\' -print -quit)"',
    'PLATFORM_PACKAGE_JSON="$(find -L /pnpm/global -path \'*/@truenine/memory-sync-cli-linux-x64-gnu/package.json\' -print -quit)"',
    'test -n "$MAIN_PACKAGE_JSON"',
    'test -n "$PLATFORM_PACKAGE_JSON"',
  ].join("\n");
}

function containerTarballPath(hostTarballPath: string): string {
  return path.posix.join("/artifacts", path.basename(hostTarballPath));
}

export class PreparedCliIntegrationContainer {
  constructor(private readonly containerId: string) {}

  exec(command: string, cwd: string = CONTAINER_EXTERNAL_CWD): ContainerExecResult {
    const args = ["exec", this.containerId, "sh", "-lc", shellScript(command, cwd)];
    const result = runDockerCommand(args);

    return {
      command,
      cwd,
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
    };
  }

  assertExecSuccess(command: string, cwd: string = CONTAINER_EXTERNAL_CWD): ContainerExecResult {
    const result = this.exec(command, cwd);
    if (result.exitCode === 0) return result;

    throw new Error([`Container command failed in "${cwd}": ${command}`, `${result.stdout}${result.stderr}`.trim() || "No output captured."].join("\n"));
  }

  pathExists(targetPath: string): boolean {
    return this.exec(`test -e ${quoteShell(targetPath)}`, "/").exitCode === 0;
  }

  readFile(targetPath: string): string {
    return this.assertExecSuccess(`cat ${quoteShell(targetPath)}`, "/").stdout;
  }

  inspectInstalledCliResolution(): InstalledCliResolution {
    const script = [
      'const fs = require("node:fs");',
      'const path = require("node:path");',
      "const mainPackageJson = process.argv[1];",
      "const platformPackageJson = process.argv[2];",
      "const mainDir = path.dirname(mainPackageJson);",
      "const platformDir = path.dirname(platformPackageJson);",
      'const binaryPath = path.join(platformDir, "bin", "tnmsc");',
      "const binaryExists = fs.existsSync(binaryPath);",
      "process.stdout.write(JSON.stringify({",
      "  mainPackageDir: mainDir,",
      "  platformPackageDir: platformDir,",
      "  binaryExists",
      "}));",
    ].join(" ");

    const result = this.assertExecSuccess(
      [
        'MAIN_PACKAGE_JSON="$(find -L /pnpm/global -path \'*/@truenine/memory-sync-cli/package.json\' -print -quit)"',
        'PLATFORM_PACKAGE_JSON="$(find -L /pnpm/global -path \'*/@truenine/memory-sync-cli-linux-x64-gnu/package.json\' -print -quit)"',
        'test -n "$MAIN_PACKAGE_JSON"',
        'test -n "$PLATFORM_PACKAGE_JSON"',
        `node -e ${quoteShell(script)} "$MAIN_PACKAGE_JSON" "$PLATFORM_PACKAGE_JSON"`,
      ].join(" && "),
    );

    const parsed = JSON.parse(result.stdout);

    if (!parsed.binaryExists) {
      throw new Error(`Expected tnmsc binary at "${parsed.platformPackageDir}/bin/tnmsc" but it does not exist.`);
    }

    return {
      mainPackageDir: parsed.mainPackageDir,
      platformPackageDir: parsed.platformPackageDir,
    };
  }

  async stop(): Promise<void> {
    removeDockerContainer(this.containerId);
  }

  private copyPathToContainer(sourcePath: string, targetPath: string): void {
    const sourceStat = statSync(sourcePath);
    const prepareTargetCommand = sourceStat.isDirectory() ? `mkdir -p ${quoteShell(targetPath)}` : `mkdir -p ${quoteShell(path.posix.dirname(targetPath))}`;
    this.assertExecSuccess(prepareTargetCommand, "/");

    const copySource = sourceStat.isDirectory() ? `${sourcePath}${path.sep}.` : sourcePath;

    const args = ["cp", copySource, `${this.containerId}:${targetPath}`];
    const result = runDockerCommand(args);
    assertDockerCommandSucceeded(args, result);
  }

  copyFixture(fixture: CliIntegrationFixture): void {
    this.copyPathToContainer(fixture.homeDir, CONTAINER_HOME_DIR);
    this.copyPathToContainer(fixture.workspaceDir, CONTAINER_WORKSPACE_DIR);
  }

  copyArtifacts(artifacts: CliIntegrationArtifacts): void {
    this.copyPathToContainer(artifacts.cliTarballPath, containerTarballPath(artifacts.cliTarballPath));
    this.copyPathToContainer(artifacts.linuxTarballPath, containerTarballPath(artifacts.linuxTarballPath));
  }

  bootstrapLatestPnpmAndInstallCli(artifacts: CliIntegrationArtifacts): void {
    const cliTarball = containerTarballPath(artifacts.cliTarballPath);
    const linuxTarball = containerTarballPath(artifacts.linuxTarballPath);

    this.assertExecSuccess(
      [
        "corepack enable",
        `corepack prepare pnpm@${quoteShell(artifacts.latestPnpmVersion)} --activate`,
        "pnpm --version",
        "mkdir -p /a /b",
        `tar xzf ${quoteShell(cliTarball)} -C /a --strip-components=1`,
        `tar xzf ${quoteShell(linuxTarball)} -C /b --strip-components=1`,
        "pnpm add -g /a /b",
        buildPinnedGlobalCliPlatformLinkScript(),
        "tnmsc help",
      ].join(" && "),
    );
  }
}

async function createPreparedCliIntegrationBaseImage(artifacts: CliIntegrationArtifacts): Promise<string> {
  if (cachedPreparedBaseImage != null) return cachedPreparedBaseImage;

  registerBaseImageCleanup();

  const containerId = await startBackgroundContainer(NODE_IMAGE);
  const container = new PreparedCliIntegrationContainer(containerId);

  const imageTag = `${BASE_IMAGE_REPOSITORY}:${process.pid}-${Date.now()}`;

  try {
    container.copyArtifacts(artifacts);
    container.bootstrapLatestPnpmAndInstallCli(artifacts);

    const commitArgs = ["commit", containerId, imageTag];
    const commitResult = runDockerCommand(commitArgs);
    assertDockerCommandSucceeded(commitArgs, commitResult);

    cachedPreparedBaseImage = imageTag;
    return imageTag;
  } catch (error) {
    runDockerCommand(["rmi", "-f", imageTag]);
    throw error;
  } finally {
    removeDockerContainer(containerId);
  }
}

export async function createPreparedCliIntegrationContainer(
  artifacts: CliIntegrationArtifacts,
  fixture: CliIntegrationFixture,
): Promise<PreparedCliIntegrationContainer> {
  const baseImage = await createPreparedCliIntegrationBaseImage(artifacts);
  const containerId = await startBackgroundContainer(baseImage);
  const container = new PreparedCliIntegrationContainer(containerId);

  try {
    container.copyFixture(fixture);
    return container;
  } catch (error) {
    removeDockerContainer(containerId);
    throw error;
  }
}
