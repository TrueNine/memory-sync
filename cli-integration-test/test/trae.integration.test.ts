import type { CliIntegrationArtifacts } from "../src/artifacts";
import { beforeAll, describe, expect, it } from "vitest";
import { prepareCliIntegrationArtifacts } from "../src/artifacts";
import { CONTAINER_EXTERNAL_CWD, createTraeFixture } from "../src/fixtures";
import { assertDistContent, assertPathStates, describeForHost, expectSuccess, withPluginEnvironment } from "../src/test-helpers";

describeForHost("trae cli integration", () => {
  let artifacts: CliIntegrationArtifacts;

  beforeAll(() => {
    artifacts = prepareCliIntegrationArtifacts();
  });

  describe("bootstrap", () => {
    it("bootstraps the latest pnpm and exposes the installed cli help surface", async () => {
      const fixture = createTraeFixture();

      await withPluginEnvironment(artifacts, fixture, async (container) => {
        const pnpmVersion = container.assertExecSuccess("pnpm --version").stdout.trim();
        expect(pnpmVersion).toBe(artifacts.latestPnpmVersion);

        const installedResolution = container.inspectInstalledCliResolution();
        expect(installedResolution.mainPackageDir).toContain("@truenine/memory-sync-cli");
        expect(installedResolution.platformPackageDir).toContain("@truenine/memory-sync-cli-linux-x64-gnu");

        const help = container.assertExecSuccess("tnmsc help");
        expect(help.stdout).toContain("install");
        expect(help.stdout).toContain("dry-run");
        expect(help.stdout).toContain("clean");
        expect(help.stdout).toContain("plugins");

        const plugins = container.assertExecSuccess("tnmsc plugins");
        expect(plugins.stdout).toContain("TraeOutputAdaptor");
      });
    });
  });

  describe("dry-run", () => {
    it("keeps dry-run side effect free for trae outputs", async () => {
      const fixture = createTraeFixture();

      await withPluginEnvironment(artifacts, fixture, async (container) => {
        const result = container.exec("tnmsc dry-run", CONTAINER_EXTERNAL_CWD);
        expectSuccess(result.exitCode);

        assertPathStates(
          container,
          [fixture.outputPaths.globalMemory, fixture.outputPaths.globalMemoryCn, fixture.outputPaths.projectSkill, fixture.outputPaths.projectRule],
          false,
        );
      });
    });
  });

  describe("install", () => {
    it("installs trae outputs from dist content including trae-cn mirrors", async () => {
      const fixture = createTraeFixture();

      await withPluginEnvironment(artifacts, fixture, async (container) => {
        const result = container.exec("tnmsc", CONTAINER_EXTERNAL_CWD);
        expectSuccess(result.exitCode);

        assertPathStates(
          container,
          [fixture.outputPaths.globalMemory, fixture.outputPaths.globalMemoryCn, fixture.outputPaths.projectSkill, fixture.outputPaths.projectRule],
          true,
        );

        const globalMemory = container.readFile(fixture.outputPaths.globalMemory);
        assertDistContent(globalMemory, ["English global memory body"], ["中文全局记忆内容"]);

        const globalMemoryCn = container.readFile(fixture.outputPaths.globalMemoryCn);
        assertDistContent(globalMemoryCn, ["English global memory body"], ["中文全局记忆内容"]);

        const skill = container.readFile(fixture.outputPaths.projectSkill);
        assertDistContent(skill, ["description: Ship-it skill", "English dist skill body"], ["中文技能内容"]);

        const rule = container.readFile(fixture.outputPaths.projectRule);
        assertDistContent(rule, ["globs: '**/*.ts'", "English rule body"], ["中文规则内容"]);
      });
    });
  });

  describe("clean", () => {
    it("supports clean dry-run and clean for trae outputs", async () => {
      const fixture = createTraeFixture();

      await withPluginEnvironment(artifacts, fixture, async (container) => {
        const installResult = container.exec("tnmsc", CONTAINER_EXTERNAL_CWD);
        expectSuccess(installResult.exitCode);

        const cleanDryRunResult = container.exec("tnmsc clean --dry-run", CONTAINER_EXTERNAL_CWD);
        expectSuccess(cleanDryRunResult.exitCode);
        assertPathStates(
          container,
          [fixture.outputPaths.globalMemory, fixture.outputPaths.globalMemoryCn, fixture.outputPaths.projectSkill, fixture.outputPaths.projectRule],
          true,
        );

        const cleanResult = container.exec("tnmsc clean", CONTAINER_EXTERNAL_CWD);
        expectSuccess(cleanResult.exitCode);
        assertPathStates(
          container,
          [fixture.outputPaths.globalMemory, fixture.outputPaths.globalMemoryCn, fixture.outputPaths.projectSkill, fixture.outputPaths.projectRule],
          false,
        );
      });
    });
  });
});
