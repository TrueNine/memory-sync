import type {CliIntegrationArtifacts} from '../src/artifacts'
import {beforeAll, describe, expect, it} from 'vitest'
import {prepareCliIntegrationArtifacts} from '../src/artifacts'
import {CONTAINER_EXTERNAL_CWD, createClaudeCodeFixture} from '../src/fixtures'
import {
  assertDistContent,
  assertPathStates,
  describeForHost,
  expectSuccess,
  withPluginEnvironment,
} from '../src/test-helpers'

describeForHost('claude code cli integration', () => {
  let artifacts: CliIntegrationArtifacts

  beforeAll(() => {
    artifacts = prepareCliIntegrationArtifacts()
  })

  describe('bootstrap', () => {
    it('bootstraps the latest pnpm, resolves local tarballs, and exposes the claude plugin surface', async () => {
      const fixture = createClaudeCodeFixture()

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
        expect(plugins.stdout).toContain('ClaudeCodeCLIOutputAdaptor')
      })
    })
  })

  describe('dry-run', () => {
    it('keeps dry-run side effect free for claude outputs', async () => {
      const fixture = createClaudeCodeFixture()

      await withPluginEnvironment(artifacts, fixture, async container => {
        const result = container.exec('tnmsc dry-run', CONTAINER_EXTERNAL_CWD)
        expectSuccess(result.exitCode)

        assertPathStates(container, [
          fixture.outputPaths.globalMemory,
          fixture.outputPaths.projectMemory,
          fixture.outputPaths.projectCommand,
          fixture.outputPaths.projectAgent,
          fixture.outputPaths.projectSkill,
          fixture.outputPaths.projectRule,
        ], false)
      })
    })
  })

  describe('install', () => {
    it('installs claude outputs from dist content', async () => {
      const fixture = createClaudeCodeFixture()

      await withPluginEnvironment(artifacts, fixture, async container => {
        const result = container.exec('tnmsc', CONTAINER_EXTERNAL_CWD)
        if (result.exitCode !== 0) throw new Error(`exit ${result.exitCode}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`)
        expectSuccess(result.exitCode)

        assertPathStates(container, [
          fixture.outputPaths.globalMemory,
          fixture.outputPaths.projectMemory,
          fixture.outputPaths.projectCommand,
          fixture.outputPaths.projectAgent,
          fixture.outputPaths.projectSkill,
          fixture.outputPaths.projectRule,
        ], true)

        const globalMemory = container.readFile(fixture.outputPaths.globalMemory)
        assertDistContent(globalMemory,
          ['English global memory body'],
          ['中文全局记忆内容'],
        )

        const projectMemory = container.readFile(fixture.outputPaths.projectMemory)
        assertDistContent(projectMemory,
          ['English project memory body'],
          ['中文项目记忆内容'],
        )

        const command = container.readFile(fixture.outputPaths.projectCommand)
        assertDistContent(command,
          ['description: English dist description', 'English dist command body'],
          ['中文源描述', '中文源命令内容'],
        )

        const agent = container.readFile(fixture.outputPaths.projectAgent)
        assertDistContent(agent,
          ['name: qa-reviewer', 'description: Review pull requests', 'memory: project', 'Review changes carefully.', 'Focus on concrete regressions.'],
          [],
        )

        const skill = container.readFile(fixture.outputPaths.projectSkill)
        assertDistContent(skill,
          ['description: Ship-it skill', 'English dist skill body'],
          ['中文技能内容'],
        )

        const rule = container.readFile(fixture.outputPaths.projectRule)
        assertDistContent(rule,
          ['paths:', '**/*.ts', 'English rule body'],
          ['中文规则内容'],
        )
      })
    })
  })

  describe('clean', () => {
    it('supports clean dry-run and clean for claude outputs', async () => {
      const fixture = createClaudeCodeFixture()

      await withPluginEnvironment(artifacts, fixture, async container => {
        const installResult = container.exec('tnmsc', CONTAINER_EXTERNAL_CWD)
        expectSuccess(installResult.exitCode)

        container.assertExecSuccess(
          [
            `mkdir -p "$(dirname '${fixture.outputPaths.projectSettings}')"`,
            `printf '{"theme":"dark"}\n' > '${fixture.outputPaths.projectSettings}'`,
            `printf '{"sandbox":"workspace"}\n' > '${fixture.outputPaths.projectSettingsLocal}'`,
          ].join(' && '),
          '/',
        )

        const cleanDryRunResult = container.exec('tnmsc clean --dry-run', CONTAINER_EXTERNAL_CWD)
        expectSuccess(cleanDryRunResult.exitCode)
        assertPathStates(container, [
          fixture.outputPaths.globalMemory,
          fixture.outputPaths.projectMemory,
          fixture.outputPaths.projectCommand,
          fixture.outputPaths.projectAgent,
          fixture.outputPaths.projectSkill,
          fixture.outputPaths.projectRule,
          fixture.outputPaths.projectSettings,
          fixture.outputPaths.projectSettingsLocal,
        ], true)

        const cleanResult = container.exec('tnmsc clean', CONTAINER_EXTERNAL_CWD)
        expectSuccess(cleanResult.exitCode)
        assertPathStates(container, [
          fixture.outputPaths.globalMemory,
          fixture.outputPaths.projectMemory,
          fixture.outputPaths.projectCommand,
          fixture.outputPaths.projectAgent,
          fixture.outputPaths.projectSkill,
          fixture.outputPaths.projectRule,
          fixture.outputPaths.projectSettings,
          fixture.outputPaths.projectSettingsLocal,
        ], false)
      })
    })
  })
})
