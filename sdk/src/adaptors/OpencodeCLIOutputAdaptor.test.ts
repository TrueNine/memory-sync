import type {OutputCleanContext, OutputWriteContext, Project, SubAgentPrompt} from './adaptor-core'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {describe, expect, it} from 'vitest'
import {collectDeletionTargets} from '@/runtime/cleanup'
import {OpencodeCLIOutputAdaptor} from './OpencodeCLIOutputAdaptor'
import {createLogger, FilePathKind, PromptKind} from './adaptor-core'

class TestOpencodeCLIOutputAdaptor extends OpencodeCLIOutputAdaptor {
  constructor(private readonly testHomeDir: string) {
    super()
  }

  protected override getHomeDir(): string {
    return this.testHomeDir
  }
}

function createWorkspaceRootProject(): Project {
  return {
    name: '__workspace__',
    isWorkspaceRootProject: true
  } as Project
}

function createCleanContext(
  workspaceBase = path.resolve('.'),
  projects: readonly Project[] = []
): OutputCleanContext {
  return {
    logger: createLogger('OpencodeCLIOutputAdaptor', 'error'),
    fs,
    path,
    glob: {} as never,
    dryRun: true,
    runtimeTargets: {jetbrainsCodexDirs: []},
    collectedOutputContext: {
      workspace: {
        directory: {
          pathKind: FilePathKind.Absolute,
          path: workspaceBase,
          getDirectoryName: () => path.basename(workspaceBase)
        },
        projects: [...projects]
      }
    }
  } as unknown as OutputCleanContext
}

function createSubAgentPrompt(
  scope: 'project' | 'global',
  frontMatterOverrides: Record<string, unknown> = {}
): SubAgentPrompt {
  return {
    type: PromptKind.SubAgent,
    content: 'subagent body',
    length: 13,
    filePathKind: FilePathKind.Relative,
    dir: {
      pathKind: FilePathKind.Relative,
      path: 'subagents/reviewer.mdx',
      basePath: path.resolve('tmp/dist/subagents'),
      getDirectoryName: () => 'reviewer',
      getAbsolutePath: () => path.resolve('tmp/dist/subagents/reviewer.mdx')
    },
    agentPrefix: 'ops',
    agentName: 'reviewer',
    canonicalName: 'ops-reviewer',
    yamlFrontMatter: {
      description: 'Reviewer',
      scope,
      namingCase: 'kebab-case',
      ...frontMatterOverrides
    },
    markdownContents: []
  } as unknown as SubAgentPrompt
}

describe('opencodeCLIOutputAdaptor synthetic workspace project output', () => {
  it('writes project-scoped subagents into workspace root .opencode/agents via the synthetic workspace project', async () => {
    const workspaceBase = path.resolve('tmp/opencode-workspace')
    const plugin = new OpencodeCLIOutputAdaptor()
    const ctx = {
      logger: createLogger('OpencodeCLIOutputAdaptor', 'error'),
      fs,
      path,
      glob: {} as never,
      dryRun: true,
      runtimeTargets: {},
      collectedOutputContext: {
        workspace: {
          directory: {
            pathKind: FilePathKind.Absolute,
            path: workspaceBase,
            getDirectoryName: () => path.basename(workspaceBase)
          },
          projects: [
            {
              name: '__workspace__',
              isWorkspaceRootProject: true
            }
          ]
        },
        subAgents: [createSubAgentPrompt('project')]
      }
    } as unknown as OutputWriteContext

    const declarations = await plugin.declareOutputFiles(ctx)

    expect(declarations.map(declaration => declaration.path)).toContain(path.join(workspaceBase, '.opencode', 'agents', 'ops-reviewer.md'))
    expect(declarations.every(declaration => declaration.scope === 'project')).toBe(true)
  })

  it('drops model from rendered subagent front matter', async () => {
    const workspaceBase = path.resolve('tmp/opencode-workspace')
    const plugin = new OpencodeCLIOutputAdaptor()
    const ctx = {
      logger: createLogger('OpencodeCLIOutputAdaptor', 'error'),
      fs,
      path,
      glob: {} as never,
      dryRun: true,
      runtimeTargets: {},
      collectedOutputContext: {
        workspace: {
          directory: {
            pathKind: FilePathKind.Absolute,
            path: workspaceBase,
            getDirectoryName: () => path.basename(workspaceBase)
          },
          projects: [
            {
              name: '__workspace__',
              isWorkspaceRootProject: true
            }
          ]
        },
        subAgents: [
          createSubAgentPrompt('project', {
            model: 'gpt-5.4',
            temperature: 0.2
          })
        ]
      }
    } as unknown as OutputWriteContext

    const declarations = await plugin.declareOutputFiles(ctx)
    const subAgentDeclaration = declarations.find(
      declaration => declaration.path === path.join(workspaceBase, '.opencode', 'agents', 'ops-reviewer.md')
    )

    expect(subAgentDeclaration).toBeDefined()
    if (subAgentDeclaration == null) throw new Error('Expected opencode subagent declaration')

    const rendered = await plugin.convertContent(subAgentDeclaration, ctx)

    expect(String(rendered)).toContain('mode: subagent')
    expect(String(rendered)).toContain('temperature: 0.2')
    expect(String(rendered)).not.toContain('model:')
  })
})

describe('opencodeCLIOutputAdaptor cleanup', () => {
  it('includes global and xdgConfig opencode.json in cleanup delete targets', async () => {
    const tempHomeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-opencode-cleanup-'))

    try {
      const plugin = new TestOpencodeCLIOutputAdaptor(tempHomeDir)
      const cleanup = await plugin.declareCleanupPaths(createCleanContext())
      const deletePaths = cleanup.delete?.map(target => target.path.replaceAll('\\', '/')) ?? []

      expect(deletePaths).toContain(path.join(tempHomeDir, '.config', 'opencode', 'AGENTS.md').replaceAll('\\', '/'))
      expect(deletePaths).toContain(path.join(tempHomeDir, '.config', 'opencode', 'opencode.json').replaceAll('\\', '/'))
    } finally {
      fs.rmSync(tempHomeDir, {recursive: true, force: true})
    }
  })

  it('plans cleanup for the project-level .opencode directory itself', async () => {
    const tempHomeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-opencode-home-'))
    const workspaceBase = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-opencode-workspace-'))
    const projectConfigFile = path.join(workspaceBase, '.opencode', 'opencode.json')
    const projectAgentFile = path.join(workspaceBase, '.opencode', 'agents', 'ops-reviewer.md')
    const unmanagedProjectFile = path.join(workspaceBase, '.opencode', 'notes.txt')

    fs.mkdirSync(path.dirname(projectAgentFile), {recursive: true})
    fs.writeFileSync(projectConfigFile, '{}\n', 'utf8')
    fs.writeFileSync(projectAgentFile, '# reviewer\n', 'utf8')
    fs.writeFileSync(unmanagedProjectFile, 'keep nothing\n', 'utf8')

    try {
      const plugin = new TestOpencodeCLIOutputAdaptor(tempHomeDir)
      const cleanCtx = createCleanContext(workspaceBase, [createWorkspaceRootProject()])
      const cleanup = await plugin.declareCleanupPaths(cleanCtx)
      const deleteDirs = cleanup.delete
        ?.filter(target => target.kind === 'directory')
        .map(target => target.path.replaceAll('\\', '/'))
        ?? []
      const plan = await collectDeletionTargets([plugin], cleanCtx)
      const normalizedDirsToDelete = plan.dirsToDelete.map(target => target.replaceAll('\\', '/'))

      expect(deleteDirs).toContain(path.join(workspaceBase, '.opencode').replaceAll('\\', '/'))
      expect(normalizedDirsToDelete).toContain(path.join(workspaceBase, '.opencode').replaceAll('\\', '/'))
      expect(plan.violations).toEqual([])
    } finally {
      fs.rmSync(tempHomeDir, {recursive: true, force: true})
      fs.rmSync(workspaceBase, {recursive: true, force: true})
    }
  })
})
