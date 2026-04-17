import type { CliIntegrationArtifacts } from "../src/artifacts";
import { beforeAll, describe, expect, it } from "vitest";
import { prepareCliIntegrationArtifacts } from "../src/artifacts";
import { CONTAINER_EXTERNAL_CWD, createOpencodeFixture } from "../src/fixtures";
import { assertDistContent, assertPathStates, describeForHost, expectSuccess, withPluginEnvironment } from "../src/test-helpers";

describeForHost("opencode cli integration", () => {
  let artifacts: CliIntegrationArtifacts;

  beforeAll(() => {
    artifacts = prepareCliIntegrationArtifacts();
  });

  describe("bootstrap", () => {
    it("bootstraps the latest pnpm and exposes the installed cli help surface", async () => {
      const fixture = createOpencodeFixture();

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
        expect(plugins.stdout).toContain("OpencodeCLIOutputAdaptor");
      });
    });
  });

  describe("dry-run", () => {
    it("keeps dry-run side effect free for opencode outputs", async () => {
      const fixture = createOpencodeFixture();

      await withPluginEnvironment(artifacts, fixture, async (container) => {
        const result = container.exec("tnmsc dry-run", CONTAINER_EXTERNAL_CWD);
        expectSuccess(result.exitCode);

        assertPathStates(
          container,
          [
            fixture.outputPaths.globalMemory,
            fixture.outputPaths.projectMemory,
            fixture.outputPaths.projectCommand,
            fixture.outputPaths.projectAgent,
            fixture.outputPaths.projectSkill,
            fixture.outputPaths.projectSkillMcp,
            fixture.outputPaths.projectRule,
          ],
          false,
        );
      });
    });
  });

  describe("install", () => {
    it("installs opencode outputs from dist content", async () => {
      const fixture = createOpencodeFixture();

      await withPluginEnvironment(artifacts, fixture, async (container) => {
        const result = container.exec("tnmsc", CONTAINER_EXTERNAL_CWD);
        expectSuccess(result.exitCode);

        assertPathStates(
          container,
          [
            fixture.outputPaths.globalMemory,
            fixture.outputPaths.projectMemory,
            fixture.outputPaths.projectCommand,
            fixture.outputPaths.projectAgent,
            fixture.outputPaths.projectSkill,
            fixture.outputPaths.projectSkillMcp,
            fixture.outputPaths.projectRule,
          ],
          true,
        );

        const globalMemory = container.readFile(fixture.outputPaths.globalMemory);
        assertDistContent(globalMemory, ["English global memory body"], ["中文全局记忆内容"]);

        const projectMemory = container.readFile(fixture.outputPaths.projectMemory);
        assertDistContent(projectMemory, ["English project memory body"], ["中文项目记忆内容"]);

        const command = container.readFile(fixture.outputPaths.projectCommand);
        assertDistContent(command, ["description: English dist description", "English dist command body"], ["中文源命令内容"]);

        const agent = container.readFile(fixture.outputPaths.projectAgent);
        assertDistContent(agent, ["mode: subagent", "Review changes carefully."], ["请仔细审查改动。"]);

        const skill = container.readFile(fixture.outputPaths.projectSkill);
        assertDistContent(skill, ["name: ship-it", "description: Ship-it skill", "English dist skill body"], ["中文技能内容"]);

        const mcp = container.readFile(fixture.outputPaths.projectSkillMcp);
        assertDistContent(mcp, ['"$schema": "https://opencode.ai/config.json"', '"opencode-rules@latest"', '"mcp": {}'], []);

        const rule = container.readFile(fixture.outputPaths.projectRule);
        assertDistContent(rule, ["globs: '**/*.ts'", "English rule body"], ["中文规则内容"]);
      });
    });
  });

  describe("clean", () => {
    it("supports clean dry-run and clean for opencode outputs", async () => {
      const fixture = createOpencodeFixture();

      await withPluginEnvironment(artifacts, fixture, async (container) => {
        const installResult = container.exec("tnmsc", CONTAINER_EXTERNAL_CWD);
        expectSuccess(installResult.exitCode);

        const cleanDryRunResult = container.exec("tnmsc clean --dry-run", CONTAINER_EXTERNAL_CWD);
        expectSuccess(cleanDryRunResult.exitCode);
        assertPathStates(
          container,
          [
            fixture.outputPaths.globalMemory,
            fixture.outputPaths.projectMemory,
            fixture.outputPaths.projectCommand,
            fixture.outputPaths.projectAgent,
            fixture.outputPaths.projectSkill,
            fixture.outputPaths.projectSkillMcp,
            fixture.outputPaths.projectRule,
          ],
          true,
        );

        const cleanResult = container.exec("tnmsc clean", CONTAINER_EXTERNAL_CWD);
        expectSuccess(cleanResult.exitCode);
        assertPathStates(
          container,
          [
            fixture.outputPaths.globalMemory,
            fixture.outputPaths.projectMemory,
            fixture.outputPaths.projectCommand,
            fixture.outputPaths.projectAgent,
            fixture.outputPaths.projectSkill,
            fixture.outputPaths.projectSkillMcp,
            fixture.outputPaths.projectRule,
          ],
          false,
        );
      });
    });
  });
});
