import type {CliIntegrationArtifacts} from '../src/artifacts'
import type {CodexFixture} from '../src/fixtures'
import {beforeAll, describe, expect, it} from 'vitest'
import {prepareCliIntegrationArtifacts} from '../src/artifacts'
import {
  PreparedCliIntegrationContainer,
  createPreparedCliIntegrationContainer
} from '../src/container'
import {
  CONTAINER_EXTERNAL_CWD,
  createCodexFixture
} from '../src/fixtures'

const supportedHost = process.platform === 'linux' && process.arch === 'x64'
const describeForHost = supportedHost ? describe : describe.skip

function expectSuccess(exitCode: number): void {
  expect(exitCode).toBe(0)
}

async function withCodexEnvironment(
  artifacts: CliIntegrationArtifacts,
  fixture: CodexFixture,
  run: (container: PreparedCliIntegrationContainer) => Promise<void>
): Promise<void> {
  let container: PreparedCliIntegrationContainer | undefined

  try {
    container = await createPreparedCliIntegrationContainer(artifacts, fixture)
    await run(container)
  }
  finally {
    await container?.stop()
    fixture.cleanup()
  }
}

describeForHost('codex cli integration', () => {
  let artifacts: CliIntegrationArtifacts

  beforeAll(() => {
    artifacts = prepareCliIntegrationArtifacts()
  })

  it('bootstraps the latest pnpm and exposes the installed cli help surface', async () => {
    const fixture = createCodexFixture()

    await withCodexEnvironment(artifacts, fixture, async container => {
      const pnpmVersion = container.assertExecSuccess('pnpm --version').stdout.trim()
      expect(pnpmVersion).toBe(artifacts.latestPnpmVersion)

      const installedResolution = container.inspectInstalledCliResolution()
      expect(installedResolution.mainPackageDir).toContain('@truenine+memory-sync-cli@file')
      expect(installedResolution.platformPackageDir).toContain('@truenine+memory-sync-cli-linux-x64-gnu@file')
      expect(installedResolution.resolvedAddonPath).toContain('@truenine+memory-sync-cli-linux-x64-gnu@file')
      expect(installedResolution.scriptRuntimePackagePath).toContain('@truenine+script-runtime@file')

      const help = container.assertExecSuccess('tnmsc help')
      expect(help.stdout).toContain('install')
      expect(help.stdout).toContain('dry-run')
      expect(help.stdout).toContain('clean')
      expect(help.stdout).toContain('plugins')

      const plugins = container.assertExecSuccess('tnmsc plugins')
      expect(plugins.stdout).toContain('CodexCLIOutputAdaptor')
    })
  })

  it('keeps dry-run side effect free for codex outputs', async () => {
    const fixture = createCodexFixture()

    await withCodexEnvironment(artifacts, fixture, async container => {
      const result = container.exec('tnmsc dry-run', CONTAINER_EXTERNAL_CWD)
      expectSuccess(result.exitCode)

      expect(container.pathExists(fixture.outputPaths.globalCommand)).toBe(false)
      expect(container.pathExists(fixture.outputPaths.workspaceCommand)).toBe(false)
      expect(container.pathExists(fixture.outputPaths.projectAgent)).toBe(false)
      expect(container.pathExists(fixture.outputPaths.projectSkill)).toBe(false)
      expect(container.pathExists(fixture.outputPaths.projectSkillMcp)).toBe(false)
    })
  })

  it('installs codex outputs from dist content and preserves the built-in system skill directory', async () => {
    const fixture = createCodexFixture({
      seedGlobalSystemSkill: true,
      seedGlobalStaleSkill: true
    })

    await withCodexEnvironment(artifacts, fixture, async container => {
      const result = container.exec('tnmsc', CONTAINER_EXTERNAL_CWD)
      expectSuccess(result.exitCode)

      expect(container.pathExists(fixture.outputPaths.globalCommand)).toBe(true)
      expect(container.pathExists(fixture.outputPaths.workspaceCommand)).toBe(false)
      expect(container.pathExists(fixture.outputPaths.projectAgent)).toBe(true)
      expect(container.pathExists(fixture.outputPaths.projectSkill)).toBe(true)
      expect(container.pathExists(fixture.outputPaths.projectSkillMcp)).toBe(true)

      const command = container.readFile(fixture.outputPaths.globalCommand)
      expect(command).toContain('description: English dist description')
      expect(command).toContain('English dist command body')
      expect(command).not.toContain('中文源描述')
      expect(command).not.toContain('中文源命令内容')

      const agent = container.readFile(fixture.outputPaths.projectAgent)
      expect(agent).toContain('name = "qa-reviewer"')
      expect(agent).toContain('description = "Review pull requests"')
      expect(agent).toContain('developer_instructions = """')
      expect(agent).toContain('Review changes carefully.')
      expect(agent).toContain('Focus on concrete regressions.')
      expect(agent).toContain('nickname_candidates = ["guard"]')
      expect(agent).toContain('sandbox_mode = "workspace-write"')
      expect(agent).toContain('[mcp_servers.docs]')

      const skill = container.readFile(fixture.outputPaths.projectSkill)
      expect(skill).toContain('description: Ship-it skill')
      expect(skill).toContain('English dist skill body')
      expect(skill).not.toContain('中文技能内容')

      const skillMcp = container.readFile(fixture.outputPaths.projectSkillMcp)
      expect(skillMcp).toContain('"inspector"')
      expect(skillMcp).toContain('"command": "npx"')
      expect(skillMcp).toContain('"args"')

      expect(container.pathExists(fixture.outputPaths.globalSystemSkill)).toBe(true)
      expect(container.pathExists(fixture.outputPaths.globalStaleSkill)).toBe(false)
    })
  })

  it('supports clean dry-run and clean while preserving the built-in system skill directory', async () => {
    const fixture = createCodexFixture({
      seedGlobalSystemSkill: true
    })

    await withCodexEnvironment(artifacts, fixture, async container => {
      const installResult = container.exec('tnmsc', CONTAINER_EXTERNAL_CWD)
      expectSuccess(installResult.exitCode)

      const cleanDryRunResult = container.exec('tnmsc clean --dry-run', CONTAINER_EXTERNAL_CWD)
      expectSuccess(cleanDryRunResult.exitCode)
      expect(container.pathExists(fixture.outputPaths.globalCommand)).toBe(true)
      expect(container.pathExists(fixture.outputPaths.workspaceCommand)).toBe(false)
      expect(container.pathExists(fixture.outputPaths.projectAgent)).toBe(true)
      expect(container.pathExists(fixture.outputPaths.projectSkill)).toBe(true)
      expect(container.pathExists(fixture.outputPaths.projectSkillMcp)).toBe(true)
      expect(container.pathExists(fixture.outputPaths.globalSystemSkill)).toBe(true)

      const cleanResult = container.exec('tnmsc clean', CONTAINER_EXTERNAL_CWD)
      expectSuccess(cleanResult.exitCode)
      expect(container.pathExists(fixture.outputPaths.globalCommand)).toBe(false)
      expect(container.pathExists(fixture.outputPaths.workspaceCommand)).toBe(false)
      expect(container.pathExists(fixture.outputPaths.projectAgent)).toBe(false)
      expect(container.pathExists(fixture.outputPaths.projectSkill)).toBe(false)
      expect(container.pathExists(fixture.outputPaths.projectSkillMcp)).toBe(false)
      expect(container.pathExists(fixture.outputPaths.globalSystemSkill)).toBe(true)
    })
  })
})
