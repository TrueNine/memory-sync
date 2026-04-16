import type { CliIntegrationArtifacts } from "../src/artifacts";
import type { TraeFixture } from "../src/fixtures";
import { beforeAll, describe, expect, it } from "vitest";
import { prepareCliIntegrationArtifacts } from "../src/artifacts";
import { PreparedCliIntegrationContainer, createPreparedCliIntegrationContainer } from "../src/container";
import { CONTAINER_EXTERNAL_CWD, createTraeFixture } from "../src/fixtures";

const supportedHost = process.platform === "linux" && process.arch === "x64";
const describeForHost = supportedHost ? describe : describe.skip;

function expectSuccess(exitCode: number): void {
  expect(exitCode).toBe(0);
}

async function withTraeEnvironment(
  artifacts: CliIntegrationArtifacts,
  fixture: TraeFixture,
  run: (container: PreparedCliIntegrationContainer) => Promise<void>,
): Promise<void> {
  let container: PreparedCliIntegrationContainer | undefined;

  try {
    container = await createPreparedCliIntegrationContainer(artifacts, fixture);
    await run(container);
  } finally {
    await container?.stop();
    fixture.cleanup();
  }
}

describeForHost("trae cli integration", () => {
  let artifacts: CliIntegrationArtifacts;

  beforeAll(() => {
    artifacts = prepareCliIntegrationArtifacts();
  });

  it("bootstraps the latest pnpm and exposes the installed cli help surface", async () => {
    const fixture = createTraeFixture();

    await withTraeEnvironment(artifacts, fixture, async (container) => {
      const pnpmVersion = container.assertExecSuccess("pnpm --version").stdout.trim();
      expect(pnpmVersion).toBe(artifacts.latestPnpmVersion);

      const installedResolution = container.inspectInstalledCliResolution();
      expect(installedResolution.mainPackageDir).toContain("@truenine+memory-sync-cli@file");
      expect(installedResolution.platformPackageDir).toContain("@truenine+memory-sync-cli-linux-x64-gnu@file");
      expect(installedResolution.resolvedAddonPath).toContain("@truenine+memory-sync-cli-linux-x64-gnu@file");
      expect(installedResolution.sdkPackagePath).toContain("@truenine+memory-sync-sdk@file");

      const help = container.assertExecSuccess("tnmsc help");
      expect(help.stdout).toContain("install");
      expect(help.stdout).toContain("dry-run");
      expect(help.stdout).toContain("clean");
      expect(help.stdout).toContain("plugins");

      const plugins = container.assertExecSuccess("tnmsc plugins");
      expect(plugins.stdout).toContain("TraeOutputAdaptor");
    });
  });

  it("keeps dry-run side effect free for trae outputs", async () => {
    const fixture = createTraeFixture();

    await withTraeEnvironment(artifacts, fixture, async (container) => {
      const result = container.exec("tnmsc dry-run", CONTAINER_EXTERNAL_CWD);
      expectSuccess(result.exitCode);

      expect(container.pathExists(fixture.outputPaths.globalMemory)).toBe(false);
      expect(container.pathExists(fixture.outputPaths.globalMemoryCn)).toBe(false);
      expect(container.pathExists(fixture.outputPaths.projectSkill)).toBe(false);
      expect(container.pathExists(fixture.outputPaths.projectRule)).toBe(false);
    });
  });

  it("installs trae outputs from dist content including trae-cn mirrors", async () => {
    const fixture = createTraeFixture();

    await withTraeEnvironment(artifacts, fixture, async (container) => {
      const result = container.exec("tnmsc", CONTAINER_EXTERNAL_CWD);
      expectSuccess(result.exitCode);

      expect(container.pathExists(fixture.outputPaths.globalMemory)).toBe(true);
      expect(container.pathExists(fixture.outputPaths.globalMemoryCn)).toBe(true);
      expect(container.pathExists(fixture.outputPaths.projectSkill)).toBe(true);
      expect(container.pathExists(fixture.outputPaths.projectRule)).toBe(true);

      const globalMemory = container.readFile(fixture.outputPaths.globalMemory);
      expect(globalMemory).toContain("English global memory body");
      expect(globalMemory).not.toContain("中文全局记忆内容");

      const globalMemoryCn = container.readFile(fixture.outputPaths.globalMemoryCn);
      expect(globalMemoryCn).toContain("English global memory body");
      expect(globalMemoryCn).not.toContain("中文全局记忆内容");

      const skill = container.readFile(fixture.outputPaths.projectSkill);
      expect(skill).toContain("description: Ship-it skill");
      expect(skill).toContain("English dist skill body");
      expect(skill).not.toContain("中文技能内容");

      const rule = container.readFile(fixture.outputPaths.projectRule);
      expect(rule).toContain("globs: '**/*.ts'");
      expect(rule).toContain("English rule body");
      expect(rule).not.toContain("中文规则内容");
    });
  });

  it("supports clean dry-run and clean for trae outputs", async () => {
    const fixture = createTraeFixture();

    await withTraeEnvironment(artifacts, fixture, async (container) => {
      const installResult = container.exec("tnmsc", CONTAINER_EXTERNAL_CWD);
      expectSuccess(installResult.exitCode);

      const cleanDryRunResult = container.exec("tnmsc clean --dry-run", CONTAINER_EXTERNAL_CWD);
      expectSuccess(cleanDryRunResult.exitCode);
      expect(container.pathExists(fixture.outputPaths.globalMemory)).toBe(true);
      expect(container.pathExists(fixture.outputPaths.globalMemoryCn)).toBe(true);
      expect(container.pathExists(fixture.outputPaths.projectSkill)).toBe(true);
      expect(container.pathExists(fixture.outputPaths.projectRule)).toBe(true);

      const cleanResult = container.exec("tnmsc clean", CONTAINER_EXTERNAL_CWD);
      expectSuccess(cleanResult.exitCode);
      expect(container.pathExists(fixture.outputPaths.globalMemory)).toBe(false);
      expect(container.pathExists(fixture.outputPaths.globalMemoryCn)).toBe(false);
      expect(container.pathExists(fixture.outputPaths.projectSkill)).toBe(false);
      expect(container.pathExists(fixture.outputPaths.projectRule)).toBe(false);
    });
  });
});
