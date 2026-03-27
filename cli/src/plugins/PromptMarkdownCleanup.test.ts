import type {OutputCleanContext, OutputPlugin, ProjectChildrenMemoryPrompt, ProjectRootMemoryPrompt} from './plugin-core'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import glob from 'fast-glob'
import {describe, expect, it} from 'vitest'
import {collectDeletionTargets} from '../commands/CleanupUtils'
import {AgentsOutputPlugin} from './AgentsOutputPlugin'
import {ClaudeCodeCLIOutputPlugin} from './ClaudeCodeCLIOutputPlugin'
import {GeminiCLIOutputPlugin} from './GeminiCLIOutputPlugin'
import {FilePathKind, PromptKind} from './plugin-core'

interface CleanupTestCase {
  readonly name: string
  readonly fileName: string
  readonly createPlugin: () => OutputPlugin
}

const TEST_CASES: readonly CleanupTestCase[] = [
  {
    name: 'AgentsOutputPlugin',
    fileName: 'AGENTS.md',
    createPlugin: () => new AgentsOutputPlugin()
  },
  {
    name: 'ClaudeCodeCLIOutputPlugin',
    fileName: 'CLAUDE.md',
    createPlugin: () => new ClaudeCodeCLIOutputPlugin()
  },
  {
    name: 'GeminiCLIOutputPlugin',
    fileName: 'GEMINI.md',
    createPlugin: () => new GeminiCLIOutputPlugin()
  }
]

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
  workspaceDir: string,
  projectName: string,
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
      basePath: path.join(workspaceDir, projectName),
      getDirectoryName: () => path.basename(relativePath),
      getAbsolutePath: () => path.join(workspaceDir, projectName, relativePath)
    },
    workingChildDirectoryPath: {
      pathKind: FilePathKind.Relative,
      path: relativePath,
      basePath: path.join(workspaceDir, projectName),
      getDirectoryName: () => path.basename(relativePath),
      getAbsolutePath: () => path.join(workspaceDir, projectName, relativePath)
    }
  } as ProjectChildrenMemoryPrompt
}

function createCleanContext(workspaceDir: string): OutputCleanContext {
  return {
    logger: {
      trace: () => {},
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
      fatal: () => {}
    },
    fs,
    path,
    glob,
    dryRun: true,
    collectedOutputContext: {
      workspace: {
        directory: {
          pathKind: FilePathKind.Absolute,
          path: workspaceDir,
          getDirectoryName: () => path.basename(workspaceDir),
          getAbsolutePath: () => workspaceDir
        },
        projects: [
          {
            name: '__workspace__',
            isWorkspaceRootProject: true,
            rootMemoryPrompt: createRootPrompt('workspace root')
          },
          {
            name: 'aindex',
            isPromptSourceProject: true,
            dirFromWorkspacePath: {
              pathKind: FilePathKind.Relative,
              path: 'aindex',
              basePath: workspaceDir,
              getDirectoryName: () => 'aindex',
              getAbsolutePath: () => path.join(workspaceDir, 'aindex')
            },
            rootMemoryPrompt: createRootPrompt('prompt-source root'),
            childMemoryPrompts: [createChildPrompt(workspaceDir, 'aindex', 'commands', 'prompt-source child')]
          },
          {
            name: 'project-a',
            dirFromWorkspacePath: {
              pathKind: FilePathKind.Relative,
              path: 'project-a',
              basePath: workspaceDir,
              getDirectoryName: () => 'project-a',
              getAbsolutePath: () => path.join(workspaceDir, 'project-a')
            },
            rootMemoryPrompt: createRootPrompt('project root'),
            childMemoryPrompts: [createChildPrompt(workspaceDir, 'project-a', 'commands', 'project child')]
          }
        ]
      }
    }
  } as OutputCleanContext
}

describe.each(TEST_CASES)('$name cleanup', ({fileName, createPlugin}) => {
  it('cleans workspace and non-prompt project markdown outputs without touching prompt-source paths', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `tnmsc-${fileName.toLowerCase()}-cleanup-`))
    const workspaceDir = path.join(tempDir, 'workspace')
    const workspaceFile = path.join(workspaceDir, fileName)
    const promptSourceRootFile = path.join(workspaceDir, 'aindex', fileName)
    const promptSourceChildFile = path.join(workspaceDir, 'aindex', 'commands', fileName)
    const projectRootFile = path.join(workspaceDir, 'project-a', fileName)
    const projectChildFile = path.join(workspaceDir, 'project-a', 'commands', fileName)
    const manualProjectChildFile = path.join(workspaceDir, 'project-a', 'docs', fileName)

    fs.mkdirSync(path.dirname(promptSourceChildFile), {recursive: true})
    fs.mkdirSync(path.dirname(manualProjectChildFile), {recursive: true})
    fs.mkdirSync(path.dirname(projectChildFile), {recursive: true})
    fs.writeFileSync(workspaceFile, '# workspace', 'utf8')
    fs.writeFileSync(promptSourceRootFile, '# prompt-source root', 'utf8')
    fs.writeFileSync(promptSourceChildFile, '# prompt-source child', 'utf8')
    fs.writeFileSync(projectRootFile, '# project root', 'utf8')
    fs.writeFileSync(projectChildFile, '# project child', 'utf8')
    fs.writeFileSync(manualProjectChildFile, '# manual child', 'utf8')

    try {
      const result = await collectDeletionTargets([createPlugin()], createCleanContext(workspaceDir))
      const normalizedFilesToDelete = result.filesToDelete.map(target => target.replaceAll('\\', '/'))

      expect(normalizedFilesToDelete).toEqual(expect.arrayContaining([
        workspaceFile.replaceAll('\\', '/'),
        projectRootFile.replaceAll('\\', '/'),
        projectChildFile.replaceAll('\\', '/')
      ]))
      expect(normalizedFilesToDelete).not.toContain(manualProjectChildFile.replaceAll('\\', '/'))
      expect(normalizedFilesToDelete).not.toContain(promptSourceRootFile.replaceAll('\\', '/'))
      expect(normalizedFilesToDelete).not.toContain(promptSourceChildFile.replaceAll('\\', '/'))
    }
    finally {
      fs.rmSync(tempDir, {recursive: true, force: true})
    }
  })
})

describe('claudeCodeCLIOutputPlugin cleanup', () => {
  it('keeps project-scope .claude cleanup directories registered', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-claude-cleanup-'))
    const workspaceDir = path.join(tempDir, 'workspace')
    const projectClaudeDirs = [
      path.join(workspaceDir, 'project-a', '.claude', 'rules'),
      path.join(workspaceDir, 'project-a', '.claude', 'commands'),
      path.join(workspaceDir, 'project-a', '.claude', 'agents'),
      path.join(workspaceDir, 'project-a', '.claude', 'skills')
    ]

    for (const directory of projectClaudeDirs) {
      fs.mkdirSync(directory, {recursive: true})
    }

    try {
      const result = await collectDeletionTargets([new ClaudeCodeCLIOutputPlugin()], createCleanContext(workspaceDir))
      const normalizedDirsToDelete = result.dirsToDelete.map(target => target.replaceAll('\\', '/'))

      expect(normalizedDirsToDelete).toEqual(expect.arrayContaining(
        projectClaudeDirs.map(target => target.replaceAll('\\', '/'))
      ))
    }
    finally {
      fs.rmSync(tempDir, {recursive: true, force: true})
    }
  })
})
