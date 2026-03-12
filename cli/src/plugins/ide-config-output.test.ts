import type {OutputWriteContext, Project, ProjectIDEConfigFile} from './plugin-core'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {describe, expect, it} from 'vitest'
import {EditorConfigOutputPlugin} from './EditorConfigOutputPlugin'
import {JetBrainsIDECodeStyleConfigOutputPlugin} from './JetBrainsIDECodeStyleConfigOutputPlugin'
import {createLogger, FilePathKind, IDEKind} from './plugin-core'
import {VisualStudioCodeIDEConfigOutputPlugin} from './VisualStudioCodeIDEConfigOutputPlugin'

function createProject(workspaceBase: string, name: string, promptSource = false): Project {
  return {
    name,
    isPromptSourceProject: promptSource,
    dirFromWorkspacePath: {
      pathKind: FilePathKind.Relative,
      path: name,
      basePath: workspaceBase,
      getDirectoryName: () => name,
      getAbsolutePath: () => path.join(workspaceBase, name)
    }
  } as Project
}

function createConfigFile(type: IDEKind, sourcePath: string, content: string): ProjectIDEConfigFile {
  return {
    type,
    content,
    length: content.length,
    filePathKind: FilePathKind.Absolute,
    dir: {
      pathKind: FilePathKind.Absolute,
      path: sourcePath,
      getDirectoryName: () => path.basename(sourcePath)
    }
  } as ProjectIDEConfigFile
}

function createWriteContext(workspaceBase: string): OutputWriteContext {
  return {
    logger: createLogger('IdeConfigOutputPluginTest', 'error'),
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
          createProject(workspaceBase, 'aindex', true),
          createProject(workspaceBase, 'memory-sync')
        ]
      },
      editorConfigFiles: [
        createConfigFile(IDEKind.EditorConfig, path.join(workspaceBase, 'aindex', 'public', '.editorconfig'), 'root = true\n')
      ],
      vscodeConfigFiles: [
        createConfigFile(IDEKind.VSCode, path.join(workspaceBase, 'aindex', 'public', '.vscode', 'settings.json'), '{}\n'),
        createConfigFile(IDEKind.VSCode, path.join(workspaceBase, 'aindex', 'public', '.vscode', 'extensions.json'), '{}\n')
      ],
      jetbrainsConfigFiles: [
        createConfigFile(IDEKind.IntellijIDEA, path.join(workspaceBase, 'aindex', 'public', '.idea', '.gitignore'), '/workspace.xml\n'),
        createConfigFile(IDEKind.IntellijIDEA, path.join(workspaceBase, 'aindex', 'public', '.idea', 'codeStyles', 'Project.xml'), '<project />\n'),
        createConfigFile(IDEKind.IntellijIDEA, path.join(workspaceBase, 'aindex', 'public', '.idea', 'codeStyles', 'codeStyleConfig.xml'), '<component />\n')
      ]
    }
  } as OutputWriteContext
}

describe('ide config output plugins', () => {
  it('skips the prompt source project for editorconfig output', async () => {
    const workspaceBase = path.resolve('tmp/ide-output-editorconfig')
    const plugin = new EditorConfigOutputPlugin()
    const declarations = await plugin.declareOutputFiles(createWriteContext(workspaceBase))
    const paths = declarations.map(declaration => declaration.path)

    expect(paths).toEqual([path.join(workspaceBase, 'memory-sync', '.editorconfig')])
  })

  it('skips the prompt source project for vscode output', async () => {
    const workspaceBase = path.resolve('tmp/ide-output-vscode')
    const plugin = new VisualStudioCodeIDEConfigOutputPlugin()
    const declarations = await plugin.declareOutputFiles(createWriteContext(workspaceBase))
    const paths = declarations.map(declaration => declaration.path)

    expect(paths).toEqual([
      path.join(workspaceBase, 'memory-sync', '.vscode', 'settings.json'),
      path.join(workspaceBase, 'memory-sync', '.vscode', 'extensions.json')
    ])
  })

  it('skips the prompt source project for jetbrains output', async () => {
    const workspaceBase = path.resolve('tmp/ide-output-jetbrains')
    const plugin = new JetBrainsIDECodeStyleConfigOutputPlugin()
    const declarations = await plugin.declareOutputFiles(createWriteContext(workspaceBase))
    const paths = declarations.map(declaration => declaration.path)

    expect(paths).toEqual([
      path.join(workspaceBase, 'memory-sync', '.idea', '.gitignore'),
      path.join(workspaceBase, 'memory-sync', '.idea', 'codeStyles', 'Project.xml'),
      path.join(workspaceBase, 'memory-sync', '.idea', 'codeStyles', 'codeStyleConfig.xml'),
      path.join(workspaceBase, 'memory-sync', '.editorconfig')
    ])
  })
})
