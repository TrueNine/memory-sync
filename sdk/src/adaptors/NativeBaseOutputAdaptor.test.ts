import type {
  OutputCleanContext,
  OutputWriteContext,
  Project,
  ProjectChildrenMemoryPrompt,
  ProjectIDEConfigFile,
  ProjectRootMemoryPrompt,
  ReadmePrompt
} from './adaptor-core'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {describe, expect, it} from 'vitest'
import {createLogger, FilePathKind, IDEKind, PromptKind} from './adaptor-core'
import {
  NativeAgentsOutputAdaptor,
  NativeGitExcludeOutputAdaptor,
  NativeReadmeMdConfigFileOutputAdaptor
} from './NativeBaseOutputAdaptor'

function createRootPrompt(content: string): ProjectRootMemoryPrompt {
  return {
    type: PromptKind.ProjectRootMemory,
    content,
    length: content.length,
    filePathKind: FilePathKind.Relative,
    dir: {
      pathKind: FilePathKind.Root,
      path: '',
      getDirectoryName: () => ''
    },
    markdownContents: []
  } as ProjectRootMemoryPrompt
}

function createChildPrompt(
  projectRoot: string,
  relativePath: string,
  content: string
): ProjectChildrenMemoryPrompt {
  return {
    type: PromptKind.ProjectChildrenMemory,
    content,
    length: content.length,
    filePathKind: FilePathKind.Relative,
    markdownContents: [],
    dir: {
      pathKind: FilePathKind.Relative,
      path: relativePath,
      basePath: projectRoot,
      getDirectoryName: () => path.basename(relativePath),
      getAbsolutePath: () => path.join(projectRoot, relativePath)
    },
    workingChildDirectoryPath: {
      pathKind: FilePathKind.Relative,
      path: relativePath,
      basePath: projectRoot,
      getDirectoryName: () => path.basename(relativePath),
      getAbsolutePath: () => path.join(projectRoot, relativePath)
    }
  } as ProjectChildrenMemoryPrompt
}

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

function createLoggerContext(name: string) {
  return createLogger(name, 'error')
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
      getDirectoryName: () => path.dirname(sourcePath)
    }
  } as ProjectIDEConfigFile
}

function createReadmePrompt(
  projectRoot: string,
  relativeTarget: string,
  fileKind: ReadmePrompt['fileKind'],
  content: string
): ReadmePrompt {
  return {
    type: PromptKind.Readme,
    content,
    length: content.length,
    dir: {
      pathKind: FilePathKind.Relative,
      path: relativeTarget,
      basePath: projectRoot,
      getDirectoryName: () => relativeTarget,
      getAbsolutePath: () => path.join(projectRoot, relativeTarget)
    },
    projectName: path.basename(projectRoot),
    targetDir: {
      pathKind: FilePathKind.Relative,
      path: relativeTarget,
      basePath: projectRoot,
      getDirectoryName: () => relativeTarget,
      getAbsolutePath: () => path.join(projectRoot, relativeTarget)
    },
    isRoot: relativeTarget === '.',
    fileKind,
    markdownContents: []
  } as ReadmePrompt
}

function createWriteContext(
  workspaceBase: string,
  projects: readonly Project[],
  extra: Record<string, unknown> = {}
): OutputWriteContext {
  return {
    logger: createLoggerContext('NativeBaseOutputAdaptorTest'),
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
      },
      ...extra
    }
  } as unknown as OutputWriteContext
}

function createCleanContext(
  workspaceBase: string,
  projects: readonly Project[],
  extra: Record<string, unknown> = {}
): OutputCleanContext {
  return {
    logger: createLoggerContext('NativeBaseOutputAdaptorTest'),
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
      },
      ...extra
    }
  } as unknown as OutputCleanContext
}

describe('native base output adaptor bridge', () => {
  it('keeps agents output behavior through the native planner contract', async () => {
    const plugin = new NativeAgentsOutputAdaptor()
    const workspaceBase = path.resolve('tmp/native-agents-plugin')
    const projectRoot = path.join(workspaceBase, 'project-a')
    const projects = [
      {
        name: '__workspace__',
        isWorkspaceRootProject: true,
        rootMemoryPrompt: createRootPrompt('workspace root')
      } as Project,
      {
        ...createProject(workspaceBase, 'aindex', true),
        rootMemoryPrompt: createRootPrompt('prompt-source root'),
        childMemoryPrompts: [createChildPrompt(path.join(workspaceBase, 'aindex'), 'commands', 'prompt-source child')]
      } as Project,
      {
        ...createProject(workspaceBase, 'project-a'),
        rootMemoryPrompt: createRootPrompt('project root'),
        childMemoryPrompts: [createChildPrompt(projectRoot, 'commands', 'project child')]
      } as Project
    ]
    const ctx = createWriteContext(workspaceBase, projects)

    const declarations = await plugin.declareOutputFiles(ctx)
    const outputPaths = declarations.map(declaration => declaration.path)
    const workspaceDeclaration = declarations.find(declaration => declaration.path === path.join(workspaceBase, 'AGENTS.md'))
    const projectDeclaration = declarations.find(declaration => declaration.path === path.join(projectRoot, 'AGENTS.md'))

    expect(outputPaths).toContain(path.join(workspaceBase, 'AGENTS.md'))
    expect(outputPaths).toContain(path.join(projectRoot, 'AGENTS.md'))
    expect(outputPaths).toContain(path.join(projectRoot, 'commands', 'AGENTS.md'))
    expect(outputPaths).not.toContain(path.join(workspaceBase, 'aindex', 'AGENTS.md'))

    if (workspaceDeclaration == null || projectDeclaration == null) {
      throw new Error('Expected native AGENTS.md declarations were not emitted')
    }

    await expect(plugin.convertContent(workspaceDeclaration, ctx)).resolves.toBe('workspace root')
    await expect(plugin.convertContent(projectDeclaration, ctx)).resolves.toBe('project root')
  })

  it('keeps git exclude output and cleanup behavior through the native planner contract', async () => {
    const workspaceBase = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-native-git-exclude-'))
    const projectDir = path.join(workspaceBase, 'packages', 'app')
    fs.mkdirSync(path.join(workspaceBase, '.git', 'info'), {recursive: true})
    fs.mkdirSync(path.join(projectDir, '.git', 'info'), {recursive: true})

    try {
      const plugin = new NativeGitExcludeOutputAdaptor()
      const projects = [
        {
          name: '__workspace__',
          isWorkspaceRootProject: true
        } as Project,
        createProject(workspaceBase, 'packages/app')
      ]
      const writeCtx = createWriteContext(workspaceBase, projects, {
        globalGitIgnore: 'dist/\n# comment\n',
        shadowGitExclude: '.idea/\n'
      })
      const cleanCtx = createCleanContext(workspaceBase, projects)
      const outputDeclarations = await plugin.declareOutputFiles(writeCtx)
      const cleanupDeclarations = await plugin.declareCleanupPaths(cleanCtx)

      expect(outputDeclarations).toEqual(expect.arrayContaining([
        expect.objectContaining({
          path: path.join(workspaceBase, '.git', 'info', 'exclude'),
          source: {content: 'dist/\n.idea/\n'}
        }),
        expect.objectContaining({
          path: path.join(projectDir, '.git', 'info', 'exclude'),
          source: {content: 'dist/\n.idea/\n'}
        })
      ]))
      expect(cleanupDeclarations.delete).toEqual(expect.arrayContaining([
        expect.objectContaining({path: path.join(workspaceBase, '.git', 'info', 'exclude')}),
        expect.objectContaining({path: path.join(projectDir, '.git', 'info', 'exclude')})
      ]))
    } finally {
      fs.rmSync(workspaceBase, {recursive: true, force: true})
    }
  })

  it('keeps readme and editorconfig output behavior through the native planner contract', async () => {
    const plugin = new NativeReadmeMdConfigFileOutputAdaptor()
    const workspaceBase = path.resolve('tmp/native-readme-plugin')
    const projects = [
      createProject(workspaceBase, 'aindex', true),
      createProject(workspaceBase, 'memory-sync')
    ]
    const memorySyncRoot = path.join(workspaceBase, 'memory-sync')
    const ctx = createWriteContext(workspaceBase, projects, {
      readmePrompts: [
        createReadmePrompt(memorySyncRoot, '.', 'Readme', '# README\n'),
        createReadmePrompt(memorySyncRoot, '.', 'CodeOfConduct', '# COC\n')
      ],
      editorConfigFiles: [
        createConfigFile(
          IDEKind.EditorConfig,
          path.join(workspaceBase, 'aindex', 'public', '.editorconfig'),
          'root = true\n'
        )
      ]
    })

    const declarations = await plugin.declareOutputFiles(ctx)
    const outputPaths = declarations.map(declaration => declaration.path)

    expect(outputPaths).toContain(path.join(memorySyncRoot, 'README.md'))
    expect(outputPaths).toContain(path.join(memorySyncRoot, 'CODE_OF_CONDUCT.md'))
    expect(outputPaths).toContain(path.join(workspaceBase, 'aindex', '.editorconfig'))
    expect(outputPaths).toContain(path.join(memorySyncRoot, '.editorconfig'))
  })
})
