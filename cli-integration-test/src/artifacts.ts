import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const CLI_DIR = path.join(REPO_ROOT, "cli");
const CLI_LINUX_PACKAGE_DIR = path.join(CLI_DIR, "npm", "linux-x64-gnu");
const RUST_BINARY_PATH = path.join(REPO_ROOT, "target", "release", "tnmsc");
const LINUX_PACKAGE_BINARY = "tnmsc";
const MAX_BUFFER = 16 * 1024 * 1024;

export interface CliIntegrationArtifacts {
  readonly tempDir: string;
  readonly cliTarballPath: string;
  readonly linuxTarballPath: string;
  readonly latestPnpmVersion: string;
}

let cachedArtifacts: CliIntegrationArtifacts | undefined;
let cleanupRegistered = false;

function registerArtifactCleanup(): void {
  if (cleanupRegistered) return;

  cleanupRegistered = true;
  process.once("exit", () => {
    cleanupCliIntegrationArtifacts();
  });
}

function runCommand(command: string, args: readonly string[], cwd: string = REPO_ROOT): string {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    maxBuffer: MAX_BUFFER,
  });

  if (result.error != null) throw result.error;
  if (result.status === 0) return `${result.stdout ?? ""}${result.stderr ?? ""}`;

  throw new Error(
    [`Command failed: ${command} ${args.join(" ")}`, `cwd: ${cwd}`, `${result.stdout ?? ""}${result.stderr ?? ""}`.trim() || "No output captured."].join("\n"),
  );
}

function resolveLatestPackageVersion(packageName: string): string {
  const raw = runCommand("npm", ["view", packageName, "version"], tmpdir()).trim();
  const firstLine = raw
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  if (firstLine != null) return firstLine;

  throw new Error(`Failed to resolve the latest version for "${packageName}".`);
}

function ensureDirectory(dirPath: string): void {
  mkdirSync(dirPath, { recursive: true });
}

function findSingleTarball(dirPath: string): string {
  const tarballs = readdirSync(dirPath)
    .filter((fileName) => fileName.endsWith(".tgz"))
    .sort();

  if (tarballs.length !== 1) {
    throw new Error(`Expected exactly one tarball in "${dirPath}", found ${tarballs.length}.`);
  }

  return path.join(dirPath, tarballs[0] ?? "");
}

function packWorkspacePackage(packageDir: string, targetDir: string): string {
  ensureDirectory(targetDir);
  runCommand("pnpm", ["-C", packageDir, "pack", "--pack-destination", targetDir]);
  return findSingleTarball(targetDir);
}

function ensureLinuxBinaryInPlatformPackage(): void {
  const targetBinary = path.join(CLI_LINUX_PACKAGE_DIR, LINUX_PACKAGE_BINARY);
  const hasBinary = existsSync(RUST_BINARY_PATH);

  if (!hasBinary) {
    throw new Error(`Expected the Rust binary at "${RUST_BINARY_PATH}". Run "cargo build --release -p tnmsc-cli-shell" first.`);
  }

  ensureDirectory(CLI_LINUX_PACKAGE_DIR);

  copyFileSync(RUST_BINARY_PATH, targetBinary);
}

function assertSupportedHost(): void {
  if (process.platform === "linux" && process.arch === "x64") return;

  throw new Error(`cli-integration-test currently supports only linux-x64 hosts. Current host: ${process.platform}-${process.arch}.`);
}

export function prepareCliIntegrationArtifacts(): CliIntegrationArtifacts {
  if (cachedArtifacts != null) return cachedArtifacts;

  assertSupportedHost();
  registerArtifactCleanup();
  runCommand("pnpm", ["-C", CLI_DIR, "run", "build"]);
  ensureLinuxBinaryInPlatformPackage();

  const tempDir = mkdtempSync(path.join(tmpdir(), "tnmsc-cli-integration-artifacts-"));
  const cliTarballPath = packWorkspacePackage(CLI_DIR, path.join(tempDir, "cli"));
  const linuxTarballPath = packWorkspacePackage(CLI_LINUX_PACKAGE_DIR, path.join(tempDir, "cli-linux-x64"));
  const latestPnpmVersion = resolveLatestPackageVersion("pnpm");

  cachedArtifacts = {
    tempDir,
    cliTarballPath,
    linuxTarballPath,
    latestPnpmVersion,
  };

  return cachedArtifacts;
}

export function cleanupCliIntegrationArtifacts(): void {
  if (cachedArtifacts == null) return;

  rmSync(cachedArtifacts.tempDir, { recursive: true, force: true });
  cachedArtifacts = void 0;
}
