#!/usr/bin/env tsx

import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const cliDir = resolve(__dirname, "..");
const workspaceDir = resolve(cliDir, "..");
const cliDistDir = resolve(cliDir, "dist");
const cliEntryPath = resolve(cliDistDir, "index.mjs");
const schemaOutputPath = resolve(cliDistDir, "tnmsc.schema.json");
const cliCargoManifestPath = resolve(cliDir, "Cargo.toml");
const runtimeRequire = createRequire(import.meta.url);
const bundledJitiBabelRuntimeSourcePath = resolve(dirname(runtimeRequire.resolve("jiti")), "../dist/babel.cjs");
const bundledJitiBabelRuntimeTargetPath = resolve(cliDistDir, "babel.cjs");

function getCombinedOutput(stdout?: string | null, stderr?: string | null): string {
  return `${stdout ?? ""}${stderr ?? ""}`.trim();
}

function assertProcessSucceeded(result: ReturnType<typeof spawnSync>, lines: readonly string[]): void {
  if (result.error != null) {
    throw result.error;
  }

  if (result.status === 0) {
    return;
  }

  throw new Error([...lines, getCombinedOutput(result.stdout, result.stderr) || "No output captured."].join("\n"));
}

function withTempDir<T>(prefix: string, callback: (tempDir: string) => T): T {
  const tempDir = mkdtempSync(join(tmpdir(), prefix));

  try {
    return callback(tempDir);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function findBundledJitiChunkPath(): string | undefined {
  const bundledJitiChunkName = readdirSync(cliDistDir).find((fileName) => /^jiti-.*\.mjs$/u.test(fileName));
  return bundledJitiChunkName == null ? undefined : resolve(cliDistDir, bundledJitiChunkName);
}

function writeCliSchema(): void {
  const schemaResult = spawnSync("cargo", ["run", "--quiet", "--manifest-path", cliCargoManifestPath, "--", "schema"], {
    cwd: workspaceDir,
    encoding: "utf8",
  });

  assertProcessSucceeded(schemaResult, ["Failed to generate CLI schema from the native tnmsc shell."]);

  const schema = schemaResult.stdout.trim();
  if (schema.length === 0) {
    throw new Error("The native tnmsc shell returned an empty schema payload.");
  }

  mkdirSync(cliDistDir, { recursive: true });
  writeFileSync(schemaOutputPath, `${schema}\n`, "utf8");
}

function ensureBundledCliEntry(): void {
  if (existsSync(cliEntryPath)) return;
  throw new Error(`Expected bundled CLI entry at "${cliEntryPath}".`);
}

function ensureBundledJitiRuntimeAssets(): void {
  if (findBundledJitiChunkPath() == null) return;

  if (!existsSync(bundledJitiBabelRuntimeSourcePath)) {
    throw new Error(`Bundled jiti runtime asset is missing: ${bundledJitiBabelRuntimeSourcePath}`);
  }

  copyFileSync(bundledJitiBabelRuntimeSourcePath, bundledJitiBabelRuntimeTargetPath);
}

function smokeTestCliEntry(): void {
  withTempDir("tnmsc-cli-home-", (isolatedHomeDir) => {
    const smokeTest = spawnSync(process.execPath, [cliEntryPath, "--version"], {
      cwd: cliDir,
      encoding: "utf8",
      env: {
        ...process.env,
        HOME: isolatedHomeDir,
        USERPROFILE: isolatedHomeDir,
      },
    });

    assertProcessSucceeded(smokeTest, [`Bundled CLI entry "${cliEntryPath}" failed the runtime smoke test.`]);
  });
}

writeCliSchema();
ensureBundledCliEntry();
ensureBundledJitiRuntimeAssets();
smokeTestCliEntry();
