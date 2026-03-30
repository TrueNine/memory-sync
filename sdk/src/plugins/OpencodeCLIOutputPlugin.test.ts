import type {OutputCleanContext, OutputWriteContext, SubAgentPrompt} from './plugin-core'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {describe, expect, it} from 'vitest'
import {OpencodeCLIOutputPlugin} from './OpencodeCLIOutputPlugin'
import {createLogger, FilePathKind, PromptKind} from './plugin-core'

class TestOpencodeCLIOutputPlugin extends OpencodeCLIOutputPlugin {
  constructor(private readonly testHomeDir: string) {
    super()
  }

  protected override getHomeDir(): string {
    return this.testHomeDir
  }
}

function createCleanContext(): OutputCleanContext {
  return {
    logger: createLogger('OpencodeCLIOutputPlugin', 'error'),
    fs,
    path,
    glob: {} as never,
    dryRun: true,
    runtimeTargets: {},
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
  } as unknown as OutputCleanContext
}

function createSubAgentPrompt(scope: 'project' | 'global'): SubAgentPrompt {
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
      namingCase: 'kebab-case'
    },
    markdownContents: []
  } as unknown as SubAgentPrompt
}

describe('opencodeCLIOutputPlugin synthetic workspace project output', () => {
  it('writes project-scoped subagents into workspace root .opencode/agents via the synthetic workspace project', async () => {
    const workspaceBase = path.resolve('tmp/opencode-workspace')
    const plugin = new OpencodeCLIOutputPlugin()
    const ctx = {
      logger: createLogger('OpencodeCLIOutputPlugin', 'error'),
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
})

describe('opencodeCLIOutputPlugin cleanup', () => {
  it('keeps global opencode.json out of cleanup delete targets', async () => {
    const tempHomeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-opencode-cleanup-'))

    try {
      const plugin = new TestOpencodeCLIOutputPlugin(tempHomeDir)
      const cleanup = await plugin.declareCleanupPaths(createCleanContext())
      const deletePaths = cleanup.delete?.map(target => target.path.replaceAll('\\', '/')) ?? []

      expect(deletePaths).toContain(path.join(tempHomeDir, '.config', 'opencode', 'AGENTS.md').replaceAll('\\', '/'))
      expect(deletePaths).not.toContain(path.join(tempHomeDir, '.config', 'opencode', 'opencode.json').replaceAll('\\', '/'))
    } finally {
      fs.rmSync(tempHomeDir, {recursive: true, force: true})
    }
  })
})
