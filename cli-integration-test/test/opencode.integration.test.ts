import type { CliIntegrationArtifacts } from "../src/artifacts";
import type { OpencodeFixture } from "../src/fixtures";
import { beforeAll, describe, expect, it } from "vitest";
import { prepareCliIntegrationArtifacts } from "../src/artifacts";
import { PreparedCliIntegrationContainer, createPreparedCliIntegrationContainer } from "../src/container";
import { CONTAINER_EXTERNAL_CWD, createOpencodeFixture } from "../src/fixtures";

const supportedHost = process.platform === "linux" && process.arch === "x64";
const describeForHost = supportedHost ? describe : describe.skip;

function expectSuccess(exitCode: number): void {
  expect(exitCode).toBe(0);
}

async function withOpencodeEnvironment(
  artifacts: CliIntegrationArtifacts,
  fixture: OpencodeFixture,
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

describeForHost("opencode cli integration", () => {
  let artifacts: CliIntegrationArtifacts;

  beforeAll(() => {
    artifacts = prepareCliIntegrationArtifacts();
  });

  it("bootstraps the latest pnpm and exposes the installed cli help surface", async () => {
    const fixture = createOpencodeFixture();

    await withOpencodeEnvironment(artifacts, fixture, async (container) => {
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
      expect(plugins.stdout).toContain("OpencodeCLIOutputAdaptor");
    });
  });

  it("keeps dry-run side effect free for opencode outputs", async () => {
    const fixture = createOpencodeFixture();

    await withOpencodeEnvironment(artifacts, fixture, async (container) => {
      const result = container.exec("tnmsc dry-run", CONTAINER_EXTERNAL_CWD);
      expectSuccess(result.exitCode);

      expect(container.pathExists(fixture.outputPaths.globalMemory)).toBe(false);
      expect(container.pathExists(fixture.outputPaths.projectMemory)).toBe(false);
      expect(container.pathExists(fixture.outputPaths.projectCommand)).toBe(false);
      expect(container.pathExists(fixture.outputPaths.projectAgent)).toBe(false);
      expect(container.pathExists(fixture.outputPaths.projectSkill)).toBe(false);
      expect(container.pathExists(fixture.outputPaths.projectSkillMcp)).toBe(false);
      expect(container.pathExists(fixture.outputPaths.projectRule)).toBe(false);
    });
  });

  it("installs opencode outputs from dist content", async () => {
    const fixture = createOpencodeFixture();

    await withOpencodeEnvironment(artifacts, fixture, async (container) => {
      const result = container.exec("tnmsc", CONTAINER_EXTERNAL_CWD);
      expectSuccess(result.exitCode);

      expect(container.pathExists(fixture.outputPaths.globalMemory)).toBe(true);
      expect(container.pathExists(fixture.outputPaths.projectMemory)).toBe(true);
      expect(container.pathExists(fixture.outputPaths.projectCommand)).toBe(true);
      expect(container.pathExists(fixture.outputPaths.projectAgent)).toBe(true);
      expect(container.pathExists(fixture.outputPaths.projectSkill)).toBe(true);
      expect(container.pathExists(fixture.outputPaths.projectSkillMcp)).toBe(true);
      expect(container.pathExists(fixture.outputPaths.projectRule)).toBe(true);

      const globalMemory = container.readFile(fixture.outputPaths.globalMemory);
      expect(globalMemory).toContain("English global memory body");
      expect(globalMemory).not.toContain("中文全局记忆内容");

      const projectMemory = container.readFile(fixture.outputPaths.projectMemory);
      expect(projectMemory).toContain("English project memory body");
      expect(projectMemory).not.toContain("中文项目记忆内容");

      const command = container.readFile(fixture.outputPaths.projectCommand);
      expect(command).toContain("description: English dist description");
      expect(command).toContain("English dist command body");
      expect(command).not.toContain("中文源命令内容");

      const agent = container.readFile(fixture.outputPaths.projectAgent);
      expect(agent).toContain("mode: subagent");
      expect(agent).toContain("Review changes carefully.");
      expect(agent).not.toContain("请仔细审查改动。");

      const skill = container.readFile(fixture.outputPaths.projectSkill);
      expect(skill).toContain("name: ship-it");
      expect(skill).toContain("description: Ship-it skill");
      expect(skill).toContain("English dist skill body");
      expect(skill).not.toContain("中文技能内容");

      const mcp = container.readFile(fixture.outputPaths.projectSkillMcp);
      expect(mcp).toContain('"$schema": "https://opencode.ai/config.json"');
      expect(mcp).toContain('"opencode-rules@latest"');
      expect(mcp).toContain('"mcp": {}');

      const rule = container.readFile(fixture.outputPaths.projectRule);
      expect(rule).toContain("globs: '**/*.ts'");
      expect(rule).toContain("English rule body");
      expect(rule).not.toContain("中文规则内容");
    });
  });

  it("supports clean dry-run and clean for opencode outputs", async () => {
    const fixture = createOpencodeFixture();

    await withOpencodeEnvironment(artifacts, fixture, async (container) => {
      const installResult = container.exec("tnmsc", CONTAINER_EXTERNAL_CWD);
      expectSuccess(installResult.exitCode);

      const cleanDryRunResult = container.exec("tnmsc clean --dry-run", CONTAINER_EXTERNAL_CWD);
      expectSuccess(cleanDryRunResult.exitCode);
      expect(container.pathExists(fixture.outputPaths.globalMemory)).toBe(true);
      expect(container.pathExists(fixture.outputPaths.projectMemory)).toBe(true);
      expect(container.pathExists(fixture.outputPaths.projectCommand)).toBe(true);
      expect(container.pathExists(fixture.outputPaths.projectAgent)).toBe(true);
      expect(container.pathExists(fixture.outputPaths.projectSkill)).toBe(true);
      expect(container.pathExists(fixture.outputPaths.projectSkillMcp)).toBe(true);
      expect(container.pathExists(fixture.outputPaths.projectRule)).toBe(true);

      const cleanResult = container.exec("tnmsc clean", CONTAINER_EXTERNAL_CWD);
      expectSuccess(cleanResult.exitCode);
      expect(container.pathExists(fixture.outputPaths.globalMemory)).toBe(false);
      expect(container.pathExists(fixture.outputPaths.projectMemory)).toBe(false);
      expect(container.pathExists(fixture.outputPaths.projectCommand)).toBe(false);
      expect(container.pathExists(fixture.outputPaths.projectAgent)).toBe(false);
      expect(container.pathExists(fixture.outputPaths.projectSkill)).toBe(false);
      expect(container.pathExists(fixture.outputPaths.projectSkillMcp)).toBe(false);
      expect(container.pathExists(fixture.outputPaths.projectRule)).toBe(false);
    });
  });
});
