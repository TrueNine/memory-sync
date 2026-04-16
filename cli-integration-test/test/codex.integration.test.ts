import type {CliIntegrationArtifacts} from '../src/artifacts'
import {beforeAll, describe, expect, it} from 'vitest'
import path from 'node:path'
import {prepareCliIntegrationArtifacts} from '../src/artifacts'
import {CONTAINER_EXTERNAL_CWD, createCodexFixture} from '../src/fixtures'
import {
  assertDistContent,
  assertPathStates,
  describeForHost,
  expectSuccess,
  withPluginEnvironment,
} from '../src/test-helpers'

function expectNoLegacyNoise(output: string): void {
  expect(output).not.toContain('Aindex is not inside a Git repository')
  expect(output).not.toContain('Prepared output plan')
  expect(output).not.toContain('Removed stale generated files')
  expect(output).not.toContain('Wrote output files')
  expect(output).not.toContain('cleanup native')
  expect(output).not.toContain('Current directory:')
  expect(output).not.toContain('**Context**')
}

describeForHost('codex cli integration', () => {
  let artifacts: CliIntegrationArtifacts

  beforeAll(() => {
    artifacts = prepareCliIntegrationArtifacts()
  })

  describe('bootstrap', () => {
    it('bootstraps the latest pnpm and exposes the installed cli help surface', async () => {
      const fixture = createCodexFixture()

      await withPluginEnvironment(artifacts, fixture, async container => {
        const pnpmVersion = container.assertExecSuccess('pnpm --version').stdout.trim()
        expect(pnpmVersion).toBe(artifacts.latestPnpmVersion)

        const installedResolution = container.inspectInstalledCliResolution()
        expect(installedResolution.mainPackageDir).toContain('@truenine+memory-sync-cli@file')
        expect(installedResolution.platformPackageDir).toContain('@truenine+memory-sync-cli-linux-x64-gnu@file')
        expect(installedResolution.resolvedAddonPath).toContain('@truenine+memory-sync-cli-linux-x64-gnu@file')
        expect(installedResolution.sdkPackagePath).toContain('@truenine+memory-sync-sdk@file')

        const help = container.assertExecSuccess('tnmsc help')
        expect(help.stdout).toContain('install')
        expect(help.stdout).toContain('dry-run')
        expect(help.stdout).toContain('clean')
        expect(help.stdout).toContain('plugins')

        const plugins = container.assertExecSuccess('tnmsc plugins')
        expect(plugins.stdout).toContain('CodexCLIOutputAdaptor')
      })
    })
  })

  describe('dry-run', () => {
    it('keeps dry-run side effect free for codex outputs', async () => {
      const fixture = createCodexFixture()

      await withPluginEnvironment(artifacts, fixture, async container => {
        const result = container.exec('tnmsc dry-run', CONTAINER_EXTERNAL_CWD)
        expectSuccess(result.exitCode)

        assertPathStates(container, [
          fixture.outputPaths.globalCommand,
          fixture.outputPaths.workspaceCommand,
          fixture.outputPaths.projectAgent,
          fixture.outputPaths.projectSkill,
          fixture.outputPaths.projectSkillMcp,
        ], false)
      })
    })
  })

  describe('install', () => {
    it('installs codex outputs from dist content and preserves the built-in system skill directory', async () => {
      const fixture = createCodexFixture({
        seedGlobalSystemSkill: true,
        seedGlobalStaleSkill: true,
      })

      await withPluginEnvironment(artifacts, fixture, async container => {
        const result = container.exec('tnmsc', CONTAINER_EXTERNAL_CWD)
        expectSuccess(result.exitCode)

        expect(container.pathExists(fixture.outputPaths.globalCommand)).toBe(true)
        expect(container.pathExists(fixture.outputPaths.workspaceCommand)).toBe(false)
        expect(container.pathExists(fixture.outputPaths.projectAgent)).toBe(true)
        expect(container.pathExists(fixture.outputPaths.projectSkill)).toBe(true)
        expect(container.pathExists(fixture.outputPaths.projectSkillMcp)).toBe(true)

        const command = container.readFile(fixture.outputPaths.globalCommand)
        assertDistContent(command,
          ['description: English dist description', 'English dist command body'],
          ['中文源描述', '中文源命令内容'],
        )

        const agent = container.readFile(fixture.outputPaths.projectAgent)
        assertDistContent(agent,
          ['name = "qa-reviewer"', 'description = "Review pull requests"', 'developer_instructions = """', 'Review changes carefully.', 'Focus on concrete regressions.', 'nickname_candidates = ["guard"]', 'sandbox_mode = "workspace-write"', '[mcp_servers.docs]'],
          [],
        )

        const skill = container.readFile(fixture.outputPaths.projectSkill)
        assertDistContent(skill,
          ['description: Ship-it skill', 'English dist skill body'],
          ['中文技能内容'],
        )

        const skillMcp = container.readFile(fixture.outputPaths.projectSkillMcp)
        assertDistContent(skillMcp, ['"inspector"', '"command": "npx"', '"args"'], [])

        expect(container.pathExists(fixture.outputPaths.globalSystemSkill)).toBe(true)
        expect(container.pathExists(fixture.outputPaths.globalStaleSkill)).toBe(false)
      })
    })
  })

  describe('clean', () => {
    it('supports clean dry-run and clean while preserving the built-in system skill directory', async () => {
      const fixture = createCodexFixture({
        seedGlobalSystemSkill: true,
      })

      await withPluginEnvironment(artifacts, fixture, async container => {
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
        assertPathStates(container, [
          fixture.outputPaths.globalCommand,
          fixture.outputPaths.workspaceCommand,
          fixture.outputPaths.projectAgent,
          fixture.outputPaths.projectSkill,
          fixture.outputPaths.projectSkillMcp,
        ], false)
        expect(container.pathExists(fixture.outputPaths.globalSystemSkill)).toBe(true)
      })
    })
  })

  it('runs the packed dist entry with tilde workspace config, resolves parent git, and keeps output concise', async () => {
    const fixture = createCodexFixture({
      logLevel: 'info',
      workspaceLocation: 'home',
      seedWorkspaceGit: true,
    })

    await withPluginEnvironment(artifacts, fixture, async container => {
      const installedResolution = container.inspectInstalledCliResolution()
      const cliDistEntry = path.posix.join(installedResolution.mainPackageDir, 'dist', 'index.mjs')

      const result = container.exec(`node "${cliDistEntry}"`, CONTAINER_EXTERNAL_CWD)
      expectSuccess(result.exitCode)

      expect(result.stderr).toContain('### Running outside the workspace')
      expect(result.stderr).toContain('tnmsc will sync "/root/workspace" and every managed project from the current directory.')
      expect(result.stderr).toContain('Run tnmsc in "/root/workspace" for workspace-only sync, or inside a managed project for project-only sync.')
      expect(result.stderr).not.toContain('/tmp/~/workspace')

      expect(result.stdout).toContain('### Wrote outputs')
      expect(result.stdout).toContain('### Sync complete')
      expect(result.stdout).not.toContain('### version control detected')

      expectNoLegacyNoise(result.stdout)
      expectNoLegacyNoise(result.stderr)

      expect(container.pathExists(fixture.outputPaths.globalCommand)).toBe(true)
      expect(container.pathExists(fixture.outputPaths.projectAgent)).toBe(true)
      expect(container.pathExists(fixture.outputPaths.projectSkill)).toBe(true)
      expect(container.pathExists(fixture.outputPaths.projectSkillMcp)).toBe(true)
    })
  })
})
