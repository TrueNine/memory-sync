import type {
  OutputWriteContext,
  Project,
  ProjectIDEConfigFile
} from './adaptor-core'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {describe, expect, it} from 'vitest'
import {createLogger, FilePathKind, IDEKind} from './adaptor-core'
import {JetBrainsIDECodeStyleConfigOutputAdaptor} from './JetBrainsIDECodeStyleConfigOutputAdaptor'
import {ReadmeMdConfigFileOutputAdaptor} from './ReadmeMdConfigFileOutputAdaptor'
import {VisualStudioCodeIDEConfigOutputAdaptor} from './VisualStudioCodeIDEConfigOutputAdaptor'
import {ZedIDEConfigOutputAdaptor} from './ZedIDEConfigOutputAdaptor'

function createProject(
  workspaceBase: string,
  name: string,
  promptSource = false
): Project {
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

function createConfigFile(
  type: IDEKind,
  sourcePath: string,
  content: string
): ProjectIDEConfigFile {
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
    logger: createLogger('IdeConfigOutputAdaptorTest', 'error'),
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
        createConfigFile(
          IDEKind.EditorConfig,
          path.join(workspaceBase, 'aindex', 'public', '.editorconfig'),
          'root = true\n'
        )
      ],
      vscodeConfigFiles: [
        createConfigFile(
          IDEKind.VSCode,
          path.join(
            workspaceBase,
            'aindex',
            'public',
            '.vscode',
            'settings.json'
          ),
          '{}\n'
        ),
        createConfigFile(
          IDEKind.VSCode,
          path.join(
            workspaceBase,
            'aindex',
            'public',
            '.vscode',
            'extensions.json'
          ),
          '{}\n'
        )
      ],
      zedConfigFiles: [
        createConfigFile(
          IDEKind.Zed,
          path.join(workspaceBase, 'aindex', 'public', '.zed', 'settings.json'),
          '{"tab_size": 2}\n'
        )
      ],
      jetbrainsConfigFiles: [
        createConfigFile(
          IDEKind.IntellijIDEA,
          path.join(workspaceBase, 'aindex', 'public', '.idea', '.gitignore'),
          '/workspace.xml\n'
        ),
        createConfigFile(
          IDEKind.IntellijIDEA,
          path.join(
            workspaceBase,
            'aindex',
            'public',
            '.idea',
            'codeStyles',
            'Project.xml'
          ),
          '<project />\n'
        ),
        createConfigFile(
          IDEKind.IntellijIDEA,
          path.join(
            workspaceBase,
            'aindex',
            'public',
            '.idea',
            'codeStyles',
            'codeStyleConfig.xml'
          ),
          '<component />\n'
        )
      ]
    }
  } as unknown as OutputWriteContext
}

describe('ide config output plugins', () => {
  it('includes the prompt source project for editorconfig output via the readme plugin', async () => {
    const workspaceBase = path.resolve('tmp/ide-output-editorconfig')
    const plugin = new ReadmeMdConfigFileOutputAdaptor()
    const ctx = createWriteContext(workspaceBase)
    const declarations = await plugin.declareOutputFiles(ctx)
    const cleanup = await plugin.declareCleanupPaths(ctx)
    const paths = declarations.map(declaration => declaration.path)

    expect(paths).toEqual([
      path.join(workspaceBase, 'aindex', '.editorconfig'),
      path.join(workspaceBase, 'memory-sync', '.editorconfig')
    ])
    expect(cleanup.delete).toEqual(expect.arrayContaining([
      {
        kind: 'file',
        label: 'delete.project',
        path: path.join(workspaceBase, 'aindex', '.editorconfig'),
        scope: 'project'
      },
      {
        kind: 'file',
        label: 'delete.project',
        path: path.join(workspaceBase, 'memory-sync', '.editorconfig'),
        scope: 'project'
      }
    ]))
  })

  it('includes the prompt source project for vscode output', async () => {
    const workspaceBase = path.resolve('tmp/ide-output-vscode')
    const plugin = new VisualStudioCodeIDEConfigOutputAdaptor()
    const declarations = await plugin.declareOutputFiles(
      createWriteContext(workspaceBase)
    )
    const paths = declarations.map(declaration => declaration.path)

    expect(paths).toEqual([
      path.join(workspaceBase, 'aindex', '.vscode', 'settings.json'),
      path.join(workspaceBase, 'aindex', '.vscode', 'extensions.json'),
      path.join(workspaceBase, 'memory-sync', '.vscode', 'settings.json'),
      path.join(workspaceBase, 'memory-sync', '.vscode', 'extensions.json')
    ])
  })

  it('includes the prompt source project for zed output and cleanup', async () => {
    const workspaceBase = path.resolve('tmp/ide-output-zed')
    const plugin = new ZedIDEConfigOutputAdaptor()
    const ctx = createWriteContext(workspaceBase)
    const declarations = await plugin.declareOutputFiles(ctx)
    const cleanup = await plugin.declareCleanupPaths(ctx)

    expect(declarations.map(declaration => declaration.path)).toEqual([
      path.join(workspaceBase, 'aindex', '.zed', 'settings.json'),
      path.join(workspaceBase, 'memory-sync', '.zed', 'settings.json')
    ])
    expect(cleanup.delete).toEqual([
      {
        kind: 'file',
        label: 'delete.project',
        path: path.join(workspaceBase, 'aindex', '.zed', 'settings.json'),
        scope: 'project'
      },
      {
        kind: 'file',
        label: 'delete.project',
        path: path.join(workspaceBase, 'memory-sync', '.zed', 'settings.json'),
        scope: 'project'
      }
    ])
  })

  it('includes the prompt source project for jetbrains output', async () => {
    const workspaceBase = path.resolve('tmp/ide-output-jetbrains')
    const plugin = new JetBrainsIDECodeStyleConfigOutputAdaptor()
    const declarations = await plugin.declareOutputFiles(
      createWriteContext(workspaceBase)
    )
    const paths = declarations.map(declaration => declaration.path)

    expect(paths).toEqual([
      path.join(workspaceBase, 'aindex', '.idea', '.gitignore'),
      path.join(workspaceBase, 'aindex', '.idea', 'codeStyles', 'Project.xml'),
      path.join(
        workspaceBase,
        'aindex',
        '.idea',
        'codeStyles',
        'codeStyleConfig.xml'
      ),
      path.join(workspaceBase, 'aindex', '.editorconfig'),
      path.join(workspaceBase, 'memory-sync', '.idea', '.gitignore'),
      path.join(
        workspaceBase,
        'memory-sync',
        '.idea',
        'codeStyles',
        'Project.xml'
      ),
      path.join(
        workspaceBase,
        'memory-sync',
        '.idea',
        'codeStyles',
        'codeStyleConfig.xml'
      ),
      path.join(workspaceBase, 'memory-sync', '.editorconfig')
    ])
  })
})
