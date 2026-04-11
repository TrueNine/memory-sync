import type {OutputCleanContext, OutputWriteContext, SkillPrompt} from './adaptor-core'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {describe, expect, it} from 'vitest'
import {createLogger, FilePathKind, PromptKind} from './adaptor-core'
import {GenericSkillsOutputAdaptor} from './GenericSkillsOutputAdaptor'

class TestGenericSkillsOutputAdaptor extends GenericSkillsOutputAdaptor {
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
    logger: createLogger('GenericSkillsOutputAdaptor', 'error'),
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

function createCleanContext(): OutputCleanContext {
  return {
    logger: createLogger('GenericSkillsOutputAdaptor', 'error'),
    fs,
    path,
    glob: {} as never,
    dryRun: true,
    runtimeTargets: {
      jetbrainsCodexDirs: []
    },
    collectedOutputContext: {
      workspace: {
        directory: {
          pathKind: FilePathKind.Relative,
          path: '.',
          basePath: '.',
          getDirectoryName: () => '.',
          getAbsolutePath: () => path.resolve('.')
        },
        projects: []
      }
    }
  } as OutputCleanContext
}

describe('genericSkillsOutputAdaptor synthetic workspace project output', () => {
  it('writes project-scoped skills into workspace root .agents/skills via the synthetic workspace project', async () => {
    const workspaceBase = path.resolve('tmp/generic-skills-workspace')
    const plugin = new TestGenericSkillsOutputAdaptor(path.resolve('tmp/generic-skills-home'))
    const ctx = createContext(workspaceBase)

    const declarations = await plugin.declareOutputFiles(ctx)

    expect(declarations.map(declaration => declaration.path)).toContain(
      path.join(workspaceBase, '.agents', 'skills', 'ship-it', 'SKILL.md')
    )
    expect(declarations.every(declaration => declaration.scope === 'project')).toBe(true)
  })
})

describe('genericSkillsOutputAdaptor cleanup', () => {
  it('declares cleanup for the full legacy global ~/.skills directory', async () => {
    const homeDir = path.resolve('tmp/generic-skills-home')
    const plugin = new TestGenericSkillsOutputAdaptor(homeDir)

    const cleanup = await plugin.declareCleanupPaths(createCleanContext())
    const deletePaths = cleanup.delete?.map(target => target.path.replaceAll('\\', '/')) ?? []

    expect(deletePaths).toContain(
      path.join(homeDir, '.agents', 'skills').replaceAll('\\', '/')
    )
    expect(deletePaths).toContain(
      path.join(homeDir, '.skills').replaceAll('\\', '/')
    )
    expect(deletePaths).toContain(
      path.join(homeDir, '.aindex', '.skills').replaceAll('\\', '/')
    )
  })
})
