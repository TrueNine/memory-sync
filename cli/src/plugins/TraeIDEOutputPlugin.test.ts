import type {OutputWriteContext, ProjectChildrenMemoryPrompt} from './plugin-core'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {describe, expect, it} from 'vitest'
import {createLogger, FilePathKind, PromptKind} from './plugin-core'
import {TraeIDEOutputPlugin} from './TraeIDEOutputPlugin'

function createChildPrompt(relativePath: string, content: string): ProjectChildrenMemoryPrompt {
  return {
    type: PromptKind.ProjectChildrenMemory,
    content,
    length: content.length,
    filePathKind: FilePathKind.Relative,
    markdownContents: [],
    dir: {
      pathKind: FilePathKind.Relative,
      path: relativePath,
      basePath: path.resolve('tmp/dist/app'),
      getDirectoryName: () => path.basename(relativePath),
      getAbsolutePath: () => path.resolve('tmp/dist/app', relativePath)
    },
    workingChildDirectoryPath: {
      pathKind: FilePathKind.Relative,
      path: relativePath,
      basePath: path.resolve('tmp/workspace/project'),
      getDirectoryName: () => path.basename(relativePath),
      getAbsolutePath: () => path.resolve('tmp/workspace/project', relativePath)
    }
  } as ProjectChildrenMemoryPrompt
}

describe('traeIDEOutputPlugin steering rule output', () => {
  it('emits project-relative glob and injects output-dir scope guard', async () => {
    const plugin = new TraeIDEOutputPlugin()
    const workspaceBase = path.resolve('tmp/trae-plugin-test')
    const ctx = {
      logger: createLogger('TraeIDEOutputPlugin', 'error'),
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
          projects: [
            {
              name: 'project-a',
              dirFromWorkspacePath: {
                pathKind: FilePathKind.Relative,
                path: 'project-a',
                basePath: workspaceBase,
                getDirectoryName: () => 'project-a',
                getAbsolutePath: () => path.join(workspaceBase, 'project-a')
              },
              childMemoryPrompts: [createChildPrompt('commands', 'Rule body')]
            }
          ]
        }
      }
    } as OutputWriteContext

    const declarations = await plugin.declareOutputFiles(ctx)
    const steering = declarations.find(d => d.source != null && (d.source as {kind?: string}).kind === 'steeringRule')
    expect(steering).toBeDefined()

    const {content} = steering!.source as {content: string}
    expect(content).toContain('globs: commands/**')
    expect(content).toContain('Scope guard: this rule is for the project-root path "commands/" only.')
    expect(content).toContain('Do not apply this rule to generated output paths such as "dist/commands/"')
  })
})
