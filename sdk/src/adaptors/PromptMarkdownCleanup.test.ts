import type {
  OutputCleanContext,
  OutputAdaptor,
  ProjectChildrenMemoryPrompt,
  ProjectRootMemoryPrompt
} from './adaptor-core'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import glob from 'fast-glob'
import {describe, expect, it} from 'vitest'
import {mergeConfig} from '../config'
import {collectDeletionTargets} from '../runtime/cleanup'
import {AgentsOutputAdaptor} from './AgentsOutputAdaptor'
import {ClaudeCodeCLIOutputAdaptor} from './ClaudeCodeCLIOutputAdaptor'
import {CursorOutputAdaptor} from './CursorOutputAdaptor'
import {GeminiCLIOutputAdaptor} from './GeminiCLIOutputAdaptor'
import {KiroCLIOutputAdaptor} from './KiroCLIOutputAdaptor'
import {FilePathKind, PromptKind} from './adaptor-core'

interface CleanupTestCase {
  readonly name: string
  readonly fileName: string
  readonly createPlugin: () => OutputAdaptor
}

const TEST_CASES: readonly CleanupTestCase[] = [
  {
    name: 'AgentsOutputAdaptor',
    fileName: 'AGENTS.md',
    createPlugin: () => new AgentsOutputAdaptor()
  },
  {
    name: 'ClaudeCodeCLIOutputAdaptor',
    fileName: 'CLAUDE.md',
    createPlugin: () => new ClaudeCodeCLIOutputAdaptor()
  },
  {
    name: 'GeminiCLIOutputAdaptor',
    fileName: 'GEMINI.md',
    createPlugin: () => new GeminiCLIOutputAdaptor()
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
            childMemoryPrompts: [
              createChildPrompt(
                workspaceDir,
                'aindex',
                'commands',
                'prompt-source child'
              )
            ]
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
            childMemoryPrompts: [
              createChildPrompt(
                workspaceDir,
                'project-a',
                'commands',
                'project child'
              )
            ]
          }
        ]
      }
    }
  } as OutputCleanContext
}

describe.each(TEST_CASES)('$name cleanup', ({fileName, createPlugin}) => {
  it('cleans workspace, prompt-source, and non-prompt project markdown outputs', async () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), `tnmsc-${fileName.toLowerCase()}-cleanup-`)
    )
    const workspaceDir = path.join(tempDir, 'workspace')
    const workspaceFile = path.join(workspaceDir, fileName)
    const promptSourceRootFile = path.join(workspaceDir, 'aindex', fileName)
    const promptSourceChildFile = path.join(
      workspaceDir,
      'aindex',
      'commands',
      fileName
    )
    const projectRootFile = path.join(workspaceDir, 'project-a', fileName)
    const projectChildFile = path.join(
      workspaceDir,
      'project-a',
      'commands',
      fileName
    )
    const manualProjectChildFile = path.join(
      workspaceDir,
      'project-a',
      'docs',
      fileName
    )

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
      const result = await collectDeletionTargets(
        [createPlugin()],
        createCleanContext(workspaceDir)
      )
      const normalizedFilesToDelete = result.filesToDelete.map(target =>
        target.replaceAll('\\', '/'))

      expect(normalizedFilesToDelete).toEqual(
        expect.arrayContaining([
          workspaceFile.replaceAll('\\', '/'),
          promptSourceRootFile.replaceAll('\\', '/'),
          promptSourceChildFile.replaceAll('\\', '/'),
          projectRootFile.replaceAll('\\', '/'),
          projectChildFile.replaceAll('\\', '/'),
          manualProjectChildFile.replaceAll('\\', '/')
        ])
      )
    } finally {
      fs.rmSync(tempDir, {recursive: true, force: true})
    }
  })
})

describe('prompt-source cleanup regression', () => {
  it('allows exact aindex source prompt outputs to be cleaned without protected-path violations', async () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'tnmsc-prompt-source-protected-cleanup-')
    )
    const workspaceDir = path.join(tempDir, 'workspace')
    const aindexDir = path.join(workspaceDir, 'aindex')
    const aindexAppDir = path.join(aindexDir, 'app')
    const agentsFile = path.join(aindexAppDir, 'AGENTS.md')
    const claudeFile = path.join(aindexAppDir, 'CLAUDE.md')
    const geminiFile = path.join(aindexAppDir, 'GEMINI.md')

    fs.mkdirSync(aindexAppDir, {recursive: true})
    fs.writeFileSync(agentsFile, '# agents', 'utf8')
    fs.writeFileSync(claudeFile, '# claude', 'utf8')
    fs.writeFileSync(geminiFile, '# gemini', 'utf8')

    try {
      const result = await collectDeletionTargets(
        [
          new AgentsOutputAdaptor(),
          new ClaudeCodeCLIOutputAdaptor(),
          new GeminiCLIOutputAdaptor()
        ],
        {
          ...createCleanContext(workspaceDir),
          pluginOptions: mergeConfig({workspaceDir}),
          collectedOutputContext: {
            ...createCleanContext(workspaceDir).collectedOutputContext,
            aindexDir,
            workspace: {
              ...createCleanContext(workspaceDir).collectedOutputContext.workspace,
              projects: [
                {
                  name: 'app',
                  isPromptSourceProject: true,
                  dirFromWorkspacePath: {
                    pathKind: FilePathKind.Relative,
                    path: path.join('aindex', 'app'),
                    basePath: workspaceDir,
                    getDirectoryName: () => 'app',
                    getAbsolutePath: () => aindexAppDir
                  },
                  rootMemoryPrompt: createRootPrompt('prompt-source root')
                }
              ]
            }
          }
        }
      )
      const normalizedFilesToDelete = result.filesToDelete.map(target =>
        target.replaceAll('\\', '/'))
      const normalizedViolationTargets = result.violations.map(violation =>
        violation.targetPath.replaceAll('\\', '/'))

      expect(normalizedFilesToDelete).toEqual(
        expect.arrayContaining([
          agentsFile.replaceAll('\\', '/'),
          claudeFile.replaceAll('\\', '/'),
          geminiFile.replaceAll('\\', '/')
        ])
      )
      expect(normalizedViolationTargets).not.toContain(
        agentsFile.replaceAll('\\', '/')
      )
      expect(normalizedViolationTargets).not.toContain(
        claudeFile.replaceAll('\\', '/')
      )
      expect(normalizedViolationTargets).not.toContain(
        geminiFile.replaceAll('\\', '/')
      )
    } finally {
      fs.rmSync(tempDir, {recursive: true, force: true})
    }
  })

  it('keeps aindex prompt-source IDE cleanup targets visible to glob-based cleanup', async () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'tnmsc-prompt-source-ide-cleanup-')
    )
    const workspaceDir = path.join(tempDir, 'workspace')
    const promptSourceCursorCommandsDir = path.join(
      workspaceDir,
      'aindex',
      '.cursor',
      'commands'
    )
    const promptSourceCursorSkillDir = path.join(
      workspaceDir,
      'aindex',
      '.cursor',
      'skills-cursor',
      'ship-it'
    )
    const promptSourceKiroStreeningDir = path.join(
      workspaceDir,
      'aindex',
      '.kiro',
      'streening'
    )
    const promptSourceKiroSpecsDir = path.join(
      workspaceDir,
      'aindex',
      '.kiro',
      'specs'
    )

    fs.mkdirSync(promptSourceCursorCommandsDir, {recursive: true})
    fs.mkdirSync(promptSourceCursorSkillDir, {recursive: true})
    fs.mkdirSync(promptSourceKiroStreeningDir, {recursive: true})
    fs.mkdirSync(promptSourceKiroSpecsDir, {recursive: true})
    fs.writeFileSync(
      path.join(promptSourceCursorCommandsDir, 'build.md'),
      '# build',
      'utf8'
    )
    fs.writeFileSync(
      path.join(promptSourceCursorSkillDir, 'SKILL.md'),
      '# ship it',
      'utf8'
    )
    fs.writeFileSync(
      path.join(promptSourceKiroStreeningDir, 'project.json'),
      '{}',
      'utf8'
    )
    fs.writeFileSync(
      path.join(promptSourceKiroSpecsDir, 'plan.md'),
      '# plan',
      'utf8'
    )

    try {
      const result = await collectDeletionTargets(
        [
          new AgentsOutputAdaptor(),
          new CursorOutputAdaptor(),
          new KiroCLIOutputAdaptor()
        ],
        createCleanContext(workspaceDir)
      )
      const normalizedDirsToDelete = result.dirsToDelete.map(target =>
        target.replaceAll('\\', '/'))

      expect(normalizedDirsToDelete).toEqual(
        expect.arrayContaining([
          promptSourceCursorCommandsDir.replaceAll('\\', '/'),
          promptSourceCursorSkillDir.replaceAll('\\', '/'),
          promptSourceKiroStreeningDir.replaceAll('\\', '/'),
          promptSourceKiroSpecsDir.replaceAll('\\', '/')
        ])
      )
      expect(result.violations).toEqual([])
    } finally {
      fs.rmSync(tempDir, {recursive: true, force: true})
    }
  })
})

describe('claudeCodeCLIOutputAdaptor cleanup', () => {
  it('keeps project-scope .claude cleanup directories registered', async () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'tnmsc-claude-cleanup-')
    )
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
      const result = await collectDeletionTargets(
        [new ClaudeCodeCLIOutputAdaptor()],
        createCleanContext(workspaceDir)
      )
      const normalizedDirsToDelete = result.dirsToDelete.map(target =>
        target.replaceAll('\\', '/'))

      expect(normalizedDirsToDelete).toEqual(
        expect.arrayContaining(
          projectClaudeDirs.map(target => target.replaceAll('\\', '/'))
        )
      )
    } finally {
      fs.rmSync(tempDir, {recursive: true, force: true})
    }
  })
})
