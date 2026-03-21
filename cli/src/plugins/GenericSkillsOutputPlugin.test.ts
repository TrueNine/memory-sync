import type {OutputWriteContext, SkillPrompt} from './plugin-core'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {describe, expect, it} from 'vitest'
import {GenericSkillsOutputPlugin} from './GenericSkillsOutputPlugin'
import {createLogger, FilePathKind, PromptKind} from './plugin-core'

class TestGenericSkillsOutputPlugin extends GenericSkillsOutputPlugin {
  constructor(private readonly testHomeDir: string) {
    super()
  }

  protected override getHomeDir(): string {
    return this.testHomeDir
  }
}

function createSkillPrompt(scope: 'project' | 'global', name: string): SkillPrompt {
  return {
    type: PromptKind.Skill,
    content: 'skill body',
    length: 10,
    filePathKind: FilePathKind.Relative,
    skillName: name,
    dir: {
      pathKind: FilePathKind.Relative,
      path: `skills/${name}`,
      basePath: path.resolve('tmp/dist/skills'),
      getDirectoryName: () => name,
      getAbsolutePath: () => path.resolve('tmp/dist/skills', name)
    },
    yamlFrontMatter: {
      description: 'Skill description',
      scope
    },
    mcpConfig: {
      type: PromptKind.SkillMcpConfig,
      mcpServers: {
        inspector: {
          command: 'npx',
          args: ['inspector']
        }
      },
      rawContent: '{"mcpServers":{"inspector":{"command":"npx","args":["inspector"]}}}'
    },
    markdownContents: []
  } as SkillPrompt
}

function createContext(
  workspaceBase: string,
  pluginOptions?: OutputWriteContext['pluginOptions'],
  skills: readonly SkillPrompt[] = [createSkillPrompt('project', 'ship-it')]
): OutputWriteContext {
  return {
    logger: createLogger('GenericSkillsOutputPlugin', 'error'),
    fs,
    path,
    glob: {} as never,
    dryRun: true,
    pluginOptions,
    collectedOutputContext: {
      workspace: {
        directory: {
          pathKind: FilePathKind.Absolute,
          path: workspaceBase,
          getDirectoryName: () => path.basename(workspaceBase)
        },
        projects: [{
          name: '__workspace__',
          isWorkspaceRootProject: true
        }]
      },
      skills: [...skills]
    }
  } as OutputWriteContext
}

describe('genericSkillsOutputPlugin synthetic workspace project output', () => {
  it('writes project-scoped skills into workspace root .agents/skills via the synthetic workspace project', async () => {
    const workspaceBase = path.resolve('tmp/generic-skills-workspace')
    const plugin = new TestGenericSkillsOutputPlugin(path.resolve('tmp/generic-skills-home'))
    const ctx = createContext(workspaceBase)

    const declarations = await plugin.declareOutputFiles(ctx)

    expect(declarations.map(declaration => declaration.path)).toContain(
      path.join(workspaceBase, '.agents', 'skills', 'ship-it', 'SKILL.md')
    )
    expect(declarations.every(declaration => declaration.scope === 'project')).toBe(true)
  })

  it('writes global mcp.json even when skill files stay project-scoped', async () => {
    const workspaceBase = path.resolve('tmp/generic-skills-workspace')
    const homeDir = path.resolve('tmp/generic-skills-home')
    const plugin = new TestGenericSkillsOutputPlugin(homeDir)
    const skills = [
      createSkillPrompt('project', 'ship-it'),
      createSkillPrompt('global', 'inspect-globally')
    ]
    const ctx = createContext(workspaceBase, {
      outputScopes: {
        plugins: {
          GenericSkillsOutputPlugin: {
            skills: 'project',
            mcp: 'global'
          }
        }
      }
    }, skills)

    const declarations = await plugin.declareOutputFiles(ctx)

    expect(declarations.map(declaration => declaration.path)).toContain(
      path.join(workspaceBase, '.agents', 'skills', 'ship-it', 'SKILL.md')
    )
    expect(declarations.map(declaration => declaration.path)).toContain(
      path.join(homeDir, '.agents', 'skills', 'inspect-globally', 'mcp.json')
    )
  })

  it('writes project mcp.json even when skill files stay global-scoped', async () => {
    const workspaceBase = path.resolve('tmp/generic-skills-workspace')
    const homeDir = path.resolve('tmp/generic-skills-home')
    const plugin = new TestGenericSkillsOutputPlugin(homeDir)
    const skills = [
      createSkillPrompt('project', 'inspect-locally'),
      createSkillPrompt('global', 'ship-it')
    ]
    const ctx = createContext(workspaceBase, {
      outputScopes: {
        plugins: {
          GenericSkillsOutputPlugin: {
            skills: 'global',
            mcp: 'project'
          }
        }
      }
    }, skills)

    const declarations = await plugin.declareOutputFiles(ctx)

    expect(declarations.map(declaration => declaration.path)).toContain(
      path.join(homeDir, '.agents', 'skills', 'ship-it', 'SKILL.md')
    )
    expect(declarations.map(declaration => declaration.path)).toContain(
      path.join(workspaceBase, '.agents', 'skills', 'inspect-locally', 'mcp.json')
    )
  })
})
