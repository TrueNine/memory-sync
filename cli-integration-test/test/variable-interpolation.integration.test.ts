import type {CliIntegrationArtifacts} from '../src/artifacts'
import {beforeAll, describe, expect, it} from 'vitest'
import {prepareCliIntegrationArtifacts} from '../src/artifacts'
import {CONTAINER_EXTERNAL_CWD} from '../src/fixtures'
import {
  createClaudeCodeInterpolationFixture,
  createCodexInterpolationFixture,
  createOpencodeInterpolationFixture,
  createTraeInterpolationFixture,
} from '../src/fixtures'
import {
  describeForHost,
  expectSuccess,
  withPluginEnvironment,
} from '../src/test-helpers'

const USERNAME = 'testuser'

describeForHost('variable interpolation integration', () => {
  let artifacts: CliIntegrationArtifacts

  beforeAll(() => {
    artifacts = prepareCliIntegrationArtifacts()
  })

  describe('claude code plugin', () => {
    it('resolves {profile.username} in global memory output', async () => {
      const fixture = createClaudeCodeInterpolationFixture()

      await withPluginEnvironment(artifacts, fixture, async container => {
        const result = container.exec('tnmsc', CONTAINER_EXTERNAL_CWD)
        expectSuccess(result.exitCode)

        const output = container.readFile(fixture.outputPaths.globalMemory)
        expect(output).toContain(`Hello, ${USERNAME}!`)
        expect(output).not.toContain('{profile.username}')
        expect(output).not.toContain('中文全局记忆内容')
      })
    })

    it('resolves {os.platform} in global memory output', async () => {
      const fixture = createClaudeCodeInterpolationFixture()

      await withPluginEnvironment(artifacts, fixture, async container => {
        const result = container.exec('tnmsc', CONTAINER_EXTERNAL_CWD)
        expectSuccess(result.exitCode)

        const output = container.readFile(fixture.outputPaths.globalMemory)
        expect(output).toContain('Your platform is linux')
        expect(output).not.toContain('{os.platform}')
      })
    })

    it('resolves {profile.username} and {tool.websearch} in command output', async () => {
      const fixture = createClaudeCodeInterpolationFixture()

      await withPluginEnvironment(artifacts, fixture, async container => {
        const result = container.exec('tnmsc', CONTAINER_EXTERNAL_CWD)
        expectSuccess(result.exitCode)

        const output = container.readFile(fixture.outputPaths.projectCommand)
        expect(output).toContain(`by ${USERNAME}`)
        expect(output).toContain('websearch')
        expect(output).not.toContain('{profile.username}')
        expect(output).not.toContain('{tool.websearch}')
        expect(output).not.toContain('中文源命令内容')
      })
    })

    it('resolves {profile.username} and {codeStyles.indent} in subagent output', async () => {
      const fixture = createClaudeCodeInterpolationFixture()

      await withPluginEnvironment(artifacts, fixture, async container => {
        const result = container.exec('tnmsc', CONTAINER_EXTERNAL_CWD)
        expectSuccess(result.exitCode)

        const output = container.readFile(fixture.outputPaths.projectAgent)
        expect(output).toContain(`Review changes by ${USERNAME}`)
        expect(output).toContain('memory: project')
        expect(output).not.toContain('{profile.username}')
        expect(output).not.toContain('{codeStyles.indent}')
        expect(output).not.toContain('请仔细审查改动。')
      })
    })

    it('resolves {profile.username} and {tool.readFile} in skill output', async () => {
      const fixture = createClaudeCodeInterpolationFixture()

      await withPluginEnvironment(artifacts, fixture, async container => {
        const result = container.exec('tnmsc', CONTAINER_EXTERNAL_CWD)
        expectSuccess(result.exitCode)

        const output = container.readFile(fixture.outputPaths.projectSkill)
        expect(output).toContain(`Deploy workflow for ${USERNAME}`)
        expect(output).not.toContain('{profile.username}')
        expect(output).not.toContain('{tool.readFile}')
        expect(output).not.toContain('中文技能内容')
      })
    })

    it('resolves {profile.username} and {env.NODE_ENV} in rule output', async () => {
      const fixture = createClaudeCodeInterpolationFixture()

      await withPluginEnvironment(artifacts, fixture, async container => {
        const result = container.exec('tnmsc', CONTAINER_EXTERNAL_CWD)
        expectSuccess(result.exitCode)

        const output = container.readFile(fixture.outputPaths.projectRule)
        expect(output).toContain(`Safety rules for ${USERNAME}`)
        expect(output).not.toContain('{profile.username}')
        expect(output).not.toContain('{env.NODE_ENV}')
        expect(output).not.toContain('中文规则内容')
      })
    })

    it('resolves {profile.username} and {os.kind} in project memory output', async () => {
      const fixture = createClaudeCodeInterpolationFixture()

      await withPluginEnvironment(artifacts, fixture, async container => {
        const result = container.exec('tnmsc', CONTAINER_EXTERNAL_CWD)
        expectSuccess(result.exitCode)

        const output = container.readFile(fixture.outputPaths.projectMemory)
        expect(output).toContain(`Project owned by ${USERNAME}`)
        expect(output).not.toContain('{profile.username}')
        expect(output).not.toContain('{os.kind}')
        expect(output).not.toContain('中文项目记忆内容')
      })
    })

    it('does not leak unresolved expression syntax in any output', async () => {
      const fixture = createClaudeCodeInterpolationFixture()

      await withPluginEnvironment(artifacts, fixture, async container => {
        const result = container.exec('tnmsc', CONTAINER_EXTERNAL_CWD)
        expectSuccess(result.exitCode)

        const allOutputs = [
          container.readFile(fixture.outputPaths.globalMemory),
          container.readFile(fixture.outputPaths.projectCommand),
          container.readFile(fixture.outputPaths.projectAgent),
          container.readFile(fixture.outputPaths.projectSkill),
          container.readFile(fixture.outputPaths.projectRule),
          container.readFile(fixture.outputPaths.projectMemory),
        ]

        for (const output of allOutputs) {
          expect(output).not.toContain('{profile.')
          expect(output).not.toContain('{os.')
          expect(output).not.toContain('{env.')
          expect(output).not.toContain('{tool.')
          expect(output).not.toContain('{codeStyles.')
        }
      })
    })
  })

  describe('codex plugin', () => {
    it('resolves {profile.username} and {tool.websearch} in command output', async () => {
      const fixture = createCodexInterpolationFixture()

      await withPluginEnvironment(artifacts, fixture, async container => {
        const result = container.exec('tnmsc', CONTAINER_EXTERNAL_CWD)
        expectSuccess(result.exitCode)

        const output = container.readFile(fixture.outputPaths.globalCommand)
        expect(output).toContain(`by ${USERNAME}`)
        expect(output).toContain('websearch')
        expect(output).not.toContain('{profile.username}')
        expect(output).not.toContain('{tool.websearch}')
        expect(output).not.toContain('中文源命令内容')
      })
    })

    it('resolves {profile.username} and {codeStyles.indent} in subagent output (TOML format)', async () => {
      const fixture = createCodexInterpolationFixture()

      await withPluginEnvironment(artifacts, fixture, async container => {
        const result = container.exec('tnmsc', CONTAINER_EXTERNAL_CWD)
        expectSuccess(result.exitCode)

        const output = container.readFile(fixture.outputPaths.projectAgent)
        expect(output).toContain(`Review changes by ${USERNAME}`)
        expect(output).toContain('name = "qa-reviewer"')
        expect(output).not.toContain('{profile.username}')
        expect(output).not.toContain('{codeStyles.indent}')
        expect(output).not.toContain('请仔细审查改动。')
      })
    })

    it('resolves {profile.username} and {tool.readFile} in skill output', async () => {
      const fixture = createCodexInterpolationFixture()

      await withPluginEnvironment(artifacts, fixture, async container => {
        const result = container.exec('tnmsc', CONTAINER_EXTERNAL_CWD)
        expectSuccess(result.exitCode)

        const output = container.readFile(fixture.outputPaths.projectSkill)
        expect(output).toContain(`Deploy workflow for ${USERNAME}`)
        expect(output).not.toContain('{profile.username}')
        expect(output).not.toContain('{tool.readFile}')
        expect(output).not.toContain('中文技能内容')
      })
    })

    it('does not leak unresolved expression syntax in any output', async () => {
      const fixture = createCodexInterpolationFixture()

      await withPluginEnvironment(artifacts, fixture, async container => {
        const result = container.exec('tnmsc', CONTAINER_EXTERNAL_CWD)
        expectSuccess(result.exitCode)

        const allOutputs = [
          container.readFile(fixture.outputPaths.globalCommand),
          container.readFile(fixture.outputPaths.projectAgent),
          container.readFile(fixture.outputPaths.projectSkill),
        ]

        for (const output of allOutputs) {
          expect(output).not.toContain('{profile.')
          expect(output).not.toContain('{os.')
          expect(output).not.toContain('{env.')
          expect(output).not.toContain('{tool.')
          expect(output).not.toContain('{codeStyles.')
        }
      })
    })
  })

  describe('trae plugin', () => {
    it('resolves {profile.username} and {os.platform} in global memory output', async () => {
      const fixture = createTraeInterpolationFixture()

      await withPluginEnvironment(artifacts, fixture, async container => {
        const result = container.exec('tnmsc', CONTAINER_EXTERNAL_CWD)
        expectSuccess(result.exitCode)

        const output = container.readFile(fixture.outputPaths.globalMemory)
        expect(output).toContain(`Hello, ${USERNAME}!`)
        expect(output).toContain('Your platform is linux')
        expect(output).not.toContain('{profile.username}')
        expect(output).not.toContain('{os.platform}')
        expect(output).not.toContain('中文全局记忆内容')
      })
    })

    it('resolves {profile.username} and {os.platform} in global memory CN mirror output', async () => {
      const fixture = createTraeInterpolationFixture()

      await withPluginEnvironment(artifacts, fixture, async container => {
        const result = container.exec('tnmsc', CONTAINER_EXTERNAL_CWD)
        expectSuccess(result.exitCode)

        const output = container.readFile(fixture.outputPaths.globalMemoryCn)
        expect(output).toContain(`Hello, ${USERNAME}!`)
        expect(output).toContain('Your platform is linux')
        expect(output).not.toContain('{profile.username}')
        expect(output).not.toContain('{os.platform}')
      })
    })

    it('resolves {profile.username} and {tool.readFile} in skill output', async () => {
      const fixture = createTraeInterpolationFixture()

      await withPluginEnvironment(artifacts, fixture, async container => {
        const result = container.exec('tnmsc', CONTAINER_EXTERNAL_CWD)
        expectSuccess(result.exitCode)

        const output = container.readFile(fixture.outputPaths.projectSkill)
        expect(output).toContain(`Deploy workflow for ${USERNAME}`)
        expect(output).not.toContain('{profile.username}')
        expect(output).not.toContain('{tool.readFile}')
        expect(output).not.toContain('中文技能内容')
      })
    })

    it('resolves {profile.username} and {env.NODE_ENV} in rule output', async () => {
      const fixture = createTraeInterpolationFixture()

      await withPluginEnvironment(artifacts, fixture, async container => {
        const result = container.exec('tnmsc', CONTAINER_EXTERNAL_CWD)
        expectSuccess(result.exitCode)

        const output = container.readFile(fixture.outputPaths.projectRule)
        expect(output).toContain(`Safety rules for ${USERNAME}`)
        expect(output).not.toContain('{profile.username}')
        expect(output).not.toContain('{env.NODE_ENV}')
        expect(output).not.toContain('中文规则内容')
      })
    })

    it('does not leak unresolved expression syntax in any output', async () => {
      const fixture = createTraeInterpolationFixture()

      await withPluginEnvironment(artifacts, fixture, async container => {
        const result = container.exec('tnmsc', CONTAINER_EXTERNAL_CWD)
        expectSuccess(result.exitCode)

        const allOutputs = [
          container.readFile(fixture.outputPaths.globalMemory),
          container.readFile(fixture.outputPaths.globalMemoryCn),
          container.readFile(fixture.outputPaths.projectSkill),
          container.readFile(fixture.outputPaths.projectRule),
        ]

        for (const output of allOutputs) {
          expect(output).not.toContain('{profile.')
          expect(output).not.toContain('{os.')
          expect(output).not.toContain('{env.')
          expect(output).not.toContain('{tool.')
          expect(output).not.toContain('{codeStyles.')
        }
      })
    })
  })

  describe('opencode plugin', () => {
    it('resolves {profile.username} and {os.platform} in global memory output', async () => {
      const fixture = createOpencodeInterpolationFixture()

      await withPluginEnvironment(artifacts, fixture, async container => {
        const result = container.exec('tnmsc', CONTAINER_EXTERNAL_CWD)
        expectSuccess(result.exitCode)

        const output = container.readFile(fixture.outputPaths.globalMemory)
        expect(output).toContain(`Hello, ${USERNAME}!`)
        expect(output).toContain('Your platform is linux')
        expect(output).not.toContain('{profile.username}')
        expect(output).not.toContain('{os.platform}')
        expect(output).not.toContain('中文全局记忆内容')
      })
    })

    it('resolves {profile.username} and {tool.websearch} in command output', async () => {
      const fixture = createOpencodeInterpolationFixture()

      await withPluginEnvironment(artifacts, fixture, async container => {
        const result = container.exec('tnmsc', CONTAINER_EXTERNAL_CWD)
        expectSuccess(result.exitCode)

        const output = container.readFile(fixture.outputPaths.projectCommand)
        expect(output).toContain(`by ${USERNAME}`)
        expect(output).toContain('websearch')
        expect(output).not.toContain('{profile.username}')
        expect(output).not.toContain('{tool.websearch}')
        expect(output).not.toContain('中文源命令内容')
      })
    })

    it('resolves {profile.username} and {codeStyles.indent} in subagent output', async () => {
      const fixture = createOpencodeInterpolationFixture()

      await withPluginEnvironment(artifacts, fixture, async container => {
        const result = container.exec('tnmsc', CONTAINER_EXTERNAL_CWD)
        expectSuccess(result.exitCode)

        const output = container.readFile(fixture.outputPaths.projectAgent)
        expect(output).toContain(`Review changes by ${USERNAME}`)
        expect(output).toContain('mode: subagent')
        expect(output).not.toContain('{profile.username}')
        expect(output).not.toContain('{codeStyles.indent}')
        expect(output).not.toContain('请仔细审查改动。')
      })
    })

    it('resolves {profile.username} and {tool.readFile} in skill output', async () => {
      const fixture = createOpencodeInterpolationFixture()

      await withPluginEnvironment(artifacts, fixture, async container => {
        const result = container.exec('tnmsc', CONTAINER_EXTERNAL_CWD)
        expectSuccess(result.exitCode)

        const output = container.readFile(fixture.outputPaths.projectSkill)
        expect(output).toContain(`Deploy workflow for ${USERNAME}`)
        expect(output).not.toContain('{profile.username}')
        expect(output).not.toContain('{tool.readFile}')
        expect(output).not.toContain('中文技能内容')
      })
    })

    it('resolves {profile.username} and {env.NODE_ENV} in rule output', async () => {
      const fixture = createOpencodeInterpolationFixture()

      await withPluginEnvironment(artifacts, fixture, async container => {
        const result = container.exec('tnmsc', CONTAINER_EXTERNAL_CWD)
        expectSuccess(result.exitCode)

        const output = container.readFile(fixture.outputPaths.projectRule)
        expect(output).toContain(`Safety rules for ${USERNAME}`)
        expect(output).not.toContain('{profile.username}')
        expect(output).not.toContain('{env.NODE_ENV}')
        expect(output).not.toContain('中文规则内容')
      })
    })

    it('resolves {profile.username} and {os.kind} in project memory output', async () => {
      const fixture = createOpencodeInterpolationFixture()

      await withPluginEnvironment(artifacts, fixture, async container => {
        const result = container.exec('tnmsc', CONTAINER_EXTERNAL_CWD)
        expectSuccess(result.exitCode)

        const output = container.readFile(fixture.outputPaths.projectMemory)
        expect(output).toContain(`Project owned by ${USERNAME}`)
        expect(output).not.toContain('{profile.username}')
        expect(output).not.toContain('{os.kind}')
        expect(output).not.toContain('中文项目记忆内容')
      })
    })

    it('does not leak unresolved expression syntax in any output', async () => {
      const fixture = createOpencodeInterpolationFixture()

      await withPluginEnvironment(artifacts, fixture, async container => {
        const result = container.exec('tnmsc', CONTAINER_EXTERNAL_CWD)
        expectSuccess(result.exitCode)

        const allOutputs = [
          container.readFile(fixture.outputPaths.globalMemory),
          container.readFile(fixture.outputPaths.projectCommand),
          container.readFile(fixture.outputPaths.projectAgent),
          container.readFile(fixture.outputPaths.projectSkill),
          container.readFile(fixture.outputPaths.projectRule),
          container.readFile(fixture.outputPaths.projectMemory),
        ]

        for (const output of allOutputs) {
          expect(output).not.toContain('{profile.')
          expect(output).not.toContain('{os.')
          expect(output).not.toContain('{env.')
          expect(output).not.toContain('{tool.')
          expect(output).not.toContain('{codeStyles.')
        }
      })
    })
  })
})
