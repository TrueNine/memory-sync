import type {OutputWriteContext, SubAgentPrompt} from './types'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {describe, expect, it} from 'vitest'
import {createLogger, FilePathKind, PromptKind} from '../plugin-core'
import {AbstractOutputPlugin} from './AbstractOutputPlugin'

class TestSubAgentOutputPlugin extends AbstractOutputPlugin {
  constructor(options?: ConstructorParameters<typeof AbstractOutputPlugin>[1]) {
    super('TestSubAgentOutputPlugin', {
      globalConfigDir: '.tool',
      outputFileName: '',
      subagents: {
        sourceScopes: ['project'],
        ...options?.subagents
      }
    })
  }
}

function createSubAgentPrompt(): SubAgentPrompt {
  return {
    type: PromptKind.SubAgent,
    content: 'subagent content',
    length: 16,
    filePathKind: FilePathKind.Relative,
    dir: {
      pathKind: FilePathKind.Relative,
      path: 'qa/boot.mdx',
      basePath: path.resolve('tmp/dist/subagents'),
      getDirectoryName: () => 'boot',
      getAbsolutePath: () => path.resolve('tmp/dist/subagents/qa/boot.mdx')
    },
    agentPrefix: 'qa',
    agentName: 'boot',
    canonicalName: 'qa-boot',
    yamlFrontMatter: {
      namingCase: 'kebabCase',
      description: 'subagent desc'
    },
    markdownContents: []
  } as SubAgentPrompt
}

function createWriteContext(subAgents: readonly SubAgentPrompt[]): OutputWriteContext {
  const workspaceBase = path.resolve('tmp/workspace')
  return {
    logger: createLogger('TestSubAgentOutputPlugin', 'error'),
    fs,
    path,
    glob: {} as never,
    dryRun: true,
    collectedOutputContext: {
      workspace: {
        directory: {
          pathKind: FilePathKind.Absolute,
          path: workspaceBase,
          getDirectoryName: () => 'workspace'
        },
        projects: [{
          name: 'demo',
          dirFromWorkspacePath: {
            pathKind: FilePathKind.Relative,
            path: 'demo',
            basePath: workspaceBase,
            getDirectoryName: () => 'demo',
            getAbsolutePath: () => path.join(workspaceBase, 'demo')
          }
        }]
      },
      subAgents
    }
  } as unknown as OutputWriteContext
}

describe('abstract output plugin subagent naming', () => {
  it('uses prefix-agent.ext by default', async () => {
    const plugin = new TestSubAgentOutputPlugin()
    const declarations = await plugin.declareOutputFiles(createWriteContext([createSubAgentPrompt()]))
    const [declaration] = declarations

    expect(declaration?.path.endsWith(path.join('.tool', 'agents', 'qa-boot.md'))).toBe(true)
  })

  it('supports custom linkSymbol and ext for subagent output names', async () => {
    const plugin = new TestSubAgentOutputPlugin({
      subagents: {
        sourceScopes: ['project'],
        linkSymbol: '_',
        ext: '.markdown'
      }
    })
    const declarations = await plugin.declareOutputFiles(createWriteContext([createSubAgentPrompt()]))
    const [declaration] = declarations

    expect(declaration?.path.endsWith(path.join('.tool', 'agents', 'qa_boot.markdown'))).toBe(true)
  })

  it('supports subagents.transformFrontMatter declaratively', async () => {
    const plugin = new TestSubAgentOutputPlugin({
      subagents: {
        sourceScopes: ['project'],
        transformFrontMatter: () => ({role: 'qa'})
      }
    })
    const declarations = await plugin.declareOutputFiles(createWriteContext([createSubAgentPrompt()]))
    const [declaration] = declarations
    if (declaration == null) throw new Error('Expected one subagent declaration')

    const content = await plugin.convertContent(declaration, createWriteContext([createSubAgentPrompt()]))
    expect(String(content)).toContain('role:')
    expect(String(content)).toContain('subagent content')
  })
})
