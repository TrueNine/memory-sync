import type {
    CollectedInputContext,
    FastCommandPrompt,
    GlobalMemoryPrompt,
    OutputPluginContext,
    OutputWriteContext,
    ProjectChildrenMemoryPrompt,
    ProjectRootMemoryPrompt,
    SkillPrompt
} from '@/types'
import { FilePathKind, PromptKind } from '@/types'
import type { RelativePath } from '@/types/FileSystemTypes'
import * as deskPaths from '@truenine/desk-paths'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { JetBrainsAIAssistantCodexOutputPlugin } from './JetBrainsAIAssistantCodexOutputPlugin'

function createMockRelativePath(pathStr: string, basePath: string): RelativePath {
  return {
    pathKind: FilePathKind.Relative,
    path: pathStr,
    basePath,
    getDirectoryName: () => path.basename(pathStr),
    getAbsolutePath: () => path.join(basePath, pathStr)
  }
}

function createMockRootPath(pathStr: string): {pathKind: FilePathKind.Root, path: string, getDirectoryName: () => string} {
  return {
    pathKind: FilePathKind.Root,
    path: pathStr,
    getDirectoryName: () => path.basename(pathStr)
  }
}

function createGlobalMemoryPrompt(content: string, basePath: string): GlobalMemoryPrompt {
  return {
    type: PromptKind.GlobalMemory,
    content,
    dir: createMockRelativePath('.', basePath),
    markdownContents: [],
    length: content.length,
    filePathKind: FilePathKind.Relative,
    parentDirectoryPath: {
      type: 'UserHome',
      directory: createMockRelativePath('.memory', basePath)
    }
  } as GlobalMemoryPrompt
}

function createProjectRootMemoryPrompt(content: string, basePath: string): ProjectRootMemoryPrompt {
  return {
    type: PromptKind.ProjectRootMemory,
    content,
    dir: createMockRootPath(path.join(basePath, 'project')),
    markdownContents: [],
    length: content.length,
    filePathKind: FilePathKind.Relative
  } as ProjectRootMemoryPrompt
}

function createProjectChildMemoryPrompt(
  basePath: string,
  dirPath: string,
  content: string
): ProjectChildrenMemoryPrompt {
  return {
    type: PromptKind.ProjectChildrenMemory,
    content,
    dir: createMockRelativePath(dirPath, basePath),
    markdownContents: [],
    length: content.length,
    filePathKind: FilePathKind.Relative,
    workingChildDirectoryPath: createMockRelativePath(dirPath, basePath)
  } as ProjectChildrenMemoryPrompt
}

function createFastCommandPrompt(
  basePath: string,
  series: string | undefined,
  commandName: string,
  content: string,
  rawFrontMatter?: string
): FastCommandPrompt {
  return {
    type: PromptKind.FastCommand,
    series,
    commandName,
    content,
    rawFrontMatter,
    length: content.length,
    filePathKind: FilePathKind.Relative,
    dir: createMockRelativePath('.', basePath),
    markdownContents: []
  } as FastCommandPrompt
}

function createSkillPrompt(basePath: string, name: string, description: string): SkillPrompt {
  return {
    type: PromptKind.Skill,
    yamlFrontMatter: {
      name,
      description,
      displayName: 'Display Name',
      version: '1.2.3',
      author: 'Test Author',
      keywords: ['alpha', 'beta'],
      allowTools: ['toolA', 'toolB']
    },
    content: '# Skill Body',
    length: 12,
    filePathKind: FilePathKind.Relative,
    dir: createMockRelativePath('skill', basePath),
    markdownContents: [],
    childDocs: [
      {
        type: PromptKind.SkillChildDoc,
        dir: createMockRelativePath('references/guide.mdx', basePath),
        content: '# Guide',
        markdownContents: [],
        length: 7,
        filePathKind: FilePathKind.Relative
      }
    ],
    resources: [
      {
        type: PromptKind.SkillResource,
        extension: '.txt',
        fileName: 'notes.txt',
        relativePath: 'assets/notes.txt',
        content: 'resource-content',
        encoding: 'text',
        category: 'document',
        length: 16
      }
    ]
  } as SkillPrompt
}

function createMockOutputContext(
  basePath: string,
  collectedInputContext: Partial<CollectedInputContext>,
  dryRun = false
): OutputWriteContext {
  return {
    collectedInputContext: {
      workspace: {
        directory: createMockRelativePath('.', basePath),
        projects: []
      },
      ideConfigFiles: [],
      ...collectedInputContext
    } as CollectedInputContext,
    dryRun
  }
}

function createJetBrainsCodexDir(basePath: string, ideName: string): string {
  const codexDir = path.join(basePath, 'JetBrains', ideName, 'aia', 'codex')
  fs.mkdirSync(codexDir, {recursive: true})
  return codexDir
}

describe('jetBrainsAIAssistantCodexOutputPlugin', () => {
  let tempDir: string,
    plugin: JetBrainsAIAssistantCodexOutputPlugin

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jb-codex-test-'))
    vi.spyOn(deskPaths, 'getPlatformFixedDir').mockReturnValue(tempDir)
    plugin = new JetBrainsAIAssistantCodexOutputPlugin()
  })

  afterEach(() => {
    vi.clearAllMocks()
    if (fs.existsSync(tempDir)) fs.rmSync(tempDir, {recursive: true, force: true})
  })

  describe('registerGlobalOutputDirs', () => {
    it('should register prompts and skill directories for supported IDEs', async () => {
      createJetBrainsCodexDir(tempDir, 'IntelliJIdea2025.3')
      createJetBrainsCodexDir(tempDir, 'WebStorm2025.1')
      createJetBrainsCodexDir(tempDir, 'OtherIDE2025.1')

      const ctx: OutputPluginContext = {
        collectedInputContext: {
          workspace: {directory: createMockRelativePath('.', tempDir), projects: []},
          ideConfigFiles: [],
          skills: [createSkillPrompt(tempDir, 'alpha-skill', 'alpha description')]
        } as CollectedInputContext
      }

      const results = await plugin.registerGlobalOutputDirs(ctx)

      const promptsDirs = results.filter(item => item.path === 'prompts')
      const skillDirs = results.filter(item => item.path.endsWith(path.join('skills', 'alpha-skill')))

      expect(promptsDirs).toHaveLength(2)
      expect(skillDirs).toHaveLength(2)
      expect(results.some(item => item.basePath.includes('OtherIDE'))).toBe(false)
    })
  })

  describe('registerGlobalOutputFiles', () => {
    it('should register AGENTS.md for each supported IDE codex directory', async () => {
      const ideaDir = createJetBrainsCodexDir(tempDir, 'IntelliJIdea2025.3')
      const webstormDir = createJetBrainsCodexDir(tempDir, 'WebStorm2025.1')

      const results = await plugin.registerGlobalOutputFiles()

      expect(results).toHaveLength(2)
      expect(results.map(r => r.getAbsolutePath())).toContain(path.join(ideaDir, 'AGENTS.md'))
      expect(results.map(r => r.getAbsolutePath())).toContain(path.join(webstormDir, 'AGENTS.md'))
    })
  })

  describe('canWrite', () => {
    it('should return false when no outputs exist', async () => {
      const ctx = createMockOutputContext(tempDir, {})

      const result = await plugin.canWrite(ctx)

      expect(result).toBe(false)
    })

    it('should return true when global memory is present', async () => {
      const ctx = createMockOutputContext(tempDir, {
        globalMemory: createGlobalMemoryPrompt('global', tempDir)
      })

      const result = await plugin.canWrite(ctx)

      expect(result).toBe(true)
    })

    it('should return true when project prompts are present', async () => {
      const projectDir = createMockRelativePath('project-a', tempDir)
      const ctx = createMockOutputContext(tempDir, {
        workspace: {
          directory: createMockRelativePath('.', tempDir),
          projects: [
            {
              dirFromWorkspacePath: projectDir,
              rootMemoryPrompt: createProjectRootMemoryPrompt('root', tempDir),
              childMemoryPrompts: [createProjectChildMemoryPrompt(tempDir, 'src', 'child')]
            }
          ]
        }
      })

      const result = await plugin.canWrite(ctx)

      expect(result).toBe(true)
    })
  })

  describe('writeGlobalOutputs', () => {
    it('should not write files during dry-run', async () => {
      const codexDir = createJetBrainsCodexDir(tempDir, 'IntelliJIdea2025.3')
      const ctx = createMockOutputContext(
        tempDir,
        {
          globalMemory: createGlobalMemoryPrompt('global', tempDir),
          fastCommands: [createFastCommandPrompt(tempDir, 'spec', 'build', 'body', 'title: Dry')],
          skills: [createSkillPrompt(tempDir, 'dry-skill', 'dry description')]
        },
        true
      )

      const result = await plugin.writeGlobalOutputs(ctx)

      expect(result.files.length).toBe(3)
      expect(fs.existsSync(path.join(codexDir, 'AGENTS.md'))).toBe(false)
    })

    it('should write global memory, commands, and skills for each IDE', async () => {
      const ideaDir = createJetBrainsCodexDir(tempDir, 'IntelliJIdea2025.3')
      const webstormDir = createJetBrainsCodexDir(tempDir, 'WebStorm2025.1')
      createJetBrainsCodexDir(tempDir, 'OtherIDE2025.1')

      const globalContent = 'GLOBAL MEMORY'
      const fastCommand = createFastCommandPrompt(tempDir, 'spec', 'compile', 'command-body', 'title: Compile')
      const skillName = 'My Skill !!!'
      const skillDescription = 'Line 1\nLine 2'
      const skill = createSkillPrompt(tempDir, skillName, skillDescription)

      const ctx = createMockOutputContext(tempDir, {
        globalMemory: createGlobalMemoryPrompt(globalContent, tempDir),
        fastCommands: [fastCommand],
        skills: [skill]
      })

      const result = await plugin.writeGlobalOutputs(ctx)

      expect(result.files.length).toBeGreaterThan(0)

      const ideaAgents = path.join(ideaDir, 'AGENTS.md')
      const webstormAgents = path.join(webstormDir, 'AGENTS.md')
      expect(fs.readFileSync(ideaAgents, 'utf8')).toBe(globalContent)
      expect(fs.readFileSync(webstormAgents, 'utf8')).toBe(globalContent)

      const commandFile = path.join(ideaDir, 'prompts', 'spec_compile.md')
      const commandContent = fs.readFileSync(commandFile, 'utf8')
      expect(commandContent).toContain('---')
      expect(commandContent).toContain('title: Compile')
      expect(commandContent).toContain('command-body')

      const skillDir = path.join(ideaDir, 'skills', skillName)
      const skillFile = path.join(skillDir, 'SKILL.md')
      const skillContent = fs.readFileSync(skillFile, 'utf8')
      expect(skillContent).toContain('name: my-skill')
      expect(skillContent).toContain('description: Line 1 Line 2')
      expect(skillContent).toContain('allowed-tools: toolA toolB')
      expect(skillContent).toContain('# Skill Body')

      const refFile = path.join(skillDir, 'references', 'guide.md')
      expect(fs.readFileSync(refFile, 'utf8')).toBe('# Guide')

      const resourceFile = path.join(skillDir, 'assets', 'notes.txt')
      expect(fs.readFileSync(resourceFile, 'utf8')).toBe('resource-content')

      const otherAgents = path.join(tempDir, 'JetBrains', 'OtherIDE2025.1', 'aia', 'codex', 'AGENTS.md')
      expect(fs.existsSync(otherAgents)).toBe(false)
    })
  })

  describe('writeProjectOutputs', () => {
    it('should write always and glob rules for project prompts', async () => {
      const projectDir = createMockRelativePath('project-a', tempDir)
      const rootContent = 'ROOT MEMORY'
      const childContent = 'CHILD MEMORY'
      const ctx = createMockOutputContext(tempDir, {
        workspace: {
          directory: createMockRelativePath('.', tempDir),
          projects: [
            {
              dirFromWorkspacePath: projectDir,
              rootMemoryPrompt: createProjectRootMemoryPrompt(rootContent, tempDir),
              childMemoryPrompts: [createProjectChildMemoryPrompt(tempDir, 'src', childContent)]
            }
          ]
        }
      })

      const result = await plugin.writeProjectOutputs(ctx)

      expect(result.files.length).toBe(2)

      const rulesDir = path.join(tempDir, 'project-a', '.aiassistant', 'rules')
      const rootFile = path.join(rulesDir, 'always.md')
      const childFile = path.join(rulesDir, 'glob-src.md')

      const rootWritten = fs.readFileSync(rootFile, 'utf8')
      expect(rootWritten).toContain('\u59CB\u7EC8')
      expect(rootWritten).toContain(rootContent)

      const childWritten = fs.readFileSync(childFile, 'utf8')
      expect(childWritten).toContain('\u6309\u6587\u4EF6\u6A21\u5F0F')
      expect(childWritten).toContain('\u6A21\u5F0F')
      expect(childWritten).toContain('src/**')
      expect(childWritten).toContain(childContent)
    })

    it('should skip writes on dry-run for project prompts', async () => {
      const projectDir = createMockRelativePath('project-a', tempDir)
      const ctx = createMockOutputContext(
        tempDir,
        {
          workspace: {
            directory: createMockRelativePath('.', tempDir),
            projects: [
              {
                dirFromWorkspacePath: projectDir,
                rootMemoryPrompt: createProjectRootMemoryPrompt('root', tempDir),
                childMemoryPrompts: [createProjectChildMemoryPrompt(tempDir, 'src', 'child')]
              }
            ]
          }
        },
        true
      )

      const result = await plugin.writeProjectOutputs(ctx)

      expect(result.files.length).toBe(2)
      expect(fs.existsSync(path.join(tempDir, 'project-a', '.aiassistant', 'rules', 'always.md'))).toBe(false)
    })
  })
})
