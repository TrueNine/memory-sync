import type {OutputWriteContext, SubAgentPrompt} from './plugin-core'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {describe, expect, it} from 'vitest'
import {OpencodeCLIOutputPlugin} from './OpencodeCLIOutputPlugin'
import {createLogger, FilePathKind, PromptKind} from './plugin-core'

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
    yamlFrontMatter: {
      name: 'reviewer',
      description: 'Reviewer',
      scope
    },
    markdownContents: []
  } as SubAgentPrompt
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
        subAgents: [createSubAgentPrompt('project')]
      }
    } as OutputWriteContext

    const declarations = await plugin.declareOutputFiles(ctx)

    expect(declarations.map(declaration => declaration.path)).toContain(
      path.join(workspaceBase, '.opencode', 'agents', 'ops-reviewer.md')
    )
    expect(declarations.every(declaration => declaration.scope === 'project')).toBe(true)
  })
})
