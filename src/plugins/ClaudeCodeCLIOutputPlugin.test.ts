import type {CollectedInputContext, FastCommandPrompt, OutputPluginContext, Project, SkillPrompt, SubAgentPrompt} from '@/types'
import type {RelativePath, RootPath} from '@/types/FileSystemTypes'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {FilePathKind, NamingCaseKind, PromptKind} from '@/types'
import {ClaudeCodeCLIOutputPlugin} from './ClaudeCodeCLIOutputPlugin'

function createMockRelativePath(pathStr: string, basePath: string): RelativePath { // Helper to create mock RelativePath
  return {
    pathKind: FilePathKind.Relative,
    path: pathStr,
    basePath,
    getDirectoryName: () => pathStr,
    getAbsolutePath: () => path.join(basePath, pathStr),
  }
}

class TestableClaudeCodeCLIOutputPlugin extends ClaudeCodeCLIOutputPlugin { // Testable subclass to mock home dir
  private mockHomeDir: string | null = null

  public setMockHomeDir(dir: string | null): void {
    this.mockHomeDir = dir
  }

  protected override getHomeDir(): string {
    if (this.mockHomeDir != null) return this.mockHomeDir
    return super.getHomeDir()
  }
}

describe('claudeCodeCLIOutputPlugin', () => {
  let tempDir: string,
    plugin: TestableClaudeCodeCLIOutputPlugin,
    mockContext: OutputPluginContext

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-test-'))
    plugin = new TestableClaudeCodeCLIOutputPlugin()
    plugin.setMockHomeDir(tempDir)

    mockContext = {
      collectedInputContext: {
        workspace: {
          projects: [],
          directory: createMockRelativePath('.', tempDir),
        },
        globalMemory: {
          type: PromptKind.GlobalMemory,
          content: 'Global Memory Content',
          filePathKind: FilePathKind.Absolute,
          dir: createMockRelativePath('.', tempDir),
          markdownContents: [],
        },
        fastCommands: [],
        subAgents: [],
        skills: [],
      } as unknown as CollectedInputContext,
      logger: {debug: vi.fn(), trace: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn()} as any,
      fs,
      path,
      glob: {} as any,
    }
  })

  afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, {recursive: true, force: true})
      }
      catch {
      } // ignore cleanup errors
    }
  })

  describe('registerGlobalOutputDirs', () => {
    it('should register commands, agents, and skills subdirectories in .claude', async () => {
      const dirs = await plugin.registerGlobalOutputDirs(mockContext)

      const dirPaths = dirs.map(d => d.path)
      expect(dirPaths).toContain('commands')
      expect(dirPaths).toContain('agents')
      expect(dirPaths).toContain('skills')

      const expectedBasePath = path.join(tempDir, '.claude')
      dirs.forEach(d => expect(d.basePath).toBe(expectedBasePath))
    })
  })

  describe('registerProjectOutputDirs', () => {
    it('should register project cleanup directories', async () => {
      const mockProject: Project = {
        name: 'test-project',
        dirFromWorkspacePath: createMockRelativePath('project-a', tempDir),
        rootMemoryPrompt: {
          type: PromptKind.ProjectRootMemory,
          content: 'content',
          filePathKind: FilePathKind.Root,
          dir: createMockRelativePath('.', tempDir) as unknown as RootPath,
          markdownContents: [],
          length: 0,
          yamlFrontMatter: {namingCase: NamingCaseKind.KebabCase},
        },
        childMemoryPrompts: [],
        sourceFiles: [],
      }

      const ctxWithProject = {
        ...mockContext,
        collectedInputContext: {
          ...mockContext.collectedInputContext,
          workspace: {
            ...mockContext.collectedInputContext.workspace,
            projects: [mockProject],
          },
        },
      }

      const dirs = await plugin.registerProjectOutputDirs(ctxWithProject)
      const dirPaths = dirs.map(d => d.path) // (Or possibly more if logic changed, but based on code, it loops subdirs) // Expect 3 dirs: .claude/commands, .claude/agents, .claude/skills

      expect(dirPaths.some(p => p.includes(path.join('.claude', 'commands')))).toBe(true)
      expect(dirPaths.some(p => p.includes(path.join('.claude', 'agents')))).toBe(true)
      expect(dirPaths.some(p => p.includes(path.join('.claude', 'skills')))).toBe(true)
    })
  })

  describe('registerGlobalOutputFiles', () => {
    it('should register CLAUDE.md in global config dir', async () => {
      const files = await plugin.registerGlobalOutputFiles(mockContext)
      const outputFile = files.find(f => f.path === 'CLAUDE.md')
      expect(outputFile).toBeDefined()
      expect(outputFile?.basePath).toBe(path.join(tempDir, '.claude'))
    })

    it('should register fast commands in commands subdirectory', async () => {
      const mockCmd: FastCommandPrompt = {
        type: PromptKind.FastCommand,
        commandName: 'test-cmd',
        content: 'content',
        filePathKind: FilePathKind.Relative,
        dir: createMockRelativePath('test-cmd', tempDir),
        markdownContents: [],
        length: 0,
        yamlFrontMatter: {namingCase: NamingCaseKind.KebabCase, description: 'desc'},
      }

      const ctxWithCmd = {
        ...mockContext,
        collectedInputContext: {
          ...mockContext.collectedInputContext,
          fastCommands: [mockCmd],
        },
      }

      const files = await plugin.registerGlobalOutputFiles(ctxWithCmd)
      const cmdFile = files.find(f => f.path.includes('test-cmd.md'))

      expect(cmdFile).toBeDefined()
      expect(cmdFile?.path).toContain('commands')
      expect(cmdFile?.basePath).toBe(path.join(tempDir, '.claude'))
    })

    it('should register sub agents in agents subdirectory', async () => {
      const mockAgent: SubAgentPrompt = {
        type: PromptKind.SubAgent,
        content: 'content',
        filePathKind: FilePathKind.Relative,
        dir: createMockRelativePath('test-agent.md', tempDir),
        markdownContents: [],
        length: 0,
        yamlFrontMatter: {namingCase: NamingCaseKind.KebabCase, name: 'agent', description: 'desc'},
      }

      const ctxWithAgent = {
        ...mockContext,
        collectedInputContext: {
          ...mockContext.collectedInputContext,
          subAgents: [mockAgent],
        },
      }

      const files = await plugin.registerGlobalOutputFiles(ctxWithAgent)
      const agentFile = files.find(f => f.path.includes('test-agent.md'))

      expect(agentFile).toBeDefined()
      expect(agentFile?.path).toContain('agents')
      expect(agentFile?.basePath).toBe(path.join(tempDir, '.claude'))
    })

    it('should register skills in skills subdirectory', async () => {
      const mockSkill: SkillPrompt = {
        type: PromptKind.Skill,
        content: 'content',
        filePathKind: FilePathKind.Relative,
        dir: createMockRelativePath('test-skill', tempDir),
        markdownContents: [],
        length: 0,
        yamlFrontMatter: {namingCase: NamingCaseKind.KebabCase, name: 'test-skill', description: 'desc'},
      }

      const ctxWithSkill = {
        ...mockContext,
        collectedInputContext: {
          ...mockContext.collectedInputContext,
          skills: [mockSkill],
        },
      }

      const files = await plugin.registerGlobalOutputFiles(ctxWithSkill)
      const skillFile = files.find(f => f.path.includes('SKILL.md'))

      expect(skillFile).toBeDefined()
      expect(skillFile?.path).toContain('skills')
      expect(skillFile?.basePath).toBe(path.join(tempDir, '.claude'))
    })
  })

  describe('registerProjectOutputFiles', () => {
    it('should only register project CLAUDE.md files', async () => {
      const mockProject: Project = {
        name: 'test-project',
        dirFromWorkspacePath: createMockRelativePath('project-a', tempDir),
        rootMemoryPrompt: {
          type: PromptKind.ProjectRootMemory,
          content: 'content',
          filePathKind: FilePathKind.Root,
          dir: createMockRelativePath('.', tempDir) as unknown as RootPath,
          markdownContents: [],
          length: 0,
          yamlFrontMatter: {namingCase: NamingCaseKind.KebabCase},
        },
        childMemoryPrompts: [],
        sourceFiles: [],
      }

      const ctxWithProject = {
        ...mockContext,
        collectedInputContext: {
          ...mockContext.collectedInputContext,
          workspace: {
            ...mockContext.collectedInputContext.workspace,
            projects: [mockProject],
          },
        },
      }

      const files = await plugin.registerProjectOutputFiles(ctxWithProject)

      expect(files).toHaveLength(1)
      expect(files[0].path).toBe(path.join('project-a', 'CLAUDE.md'))
      expect(files[0].basePath).toBe(tempDir)
    })
  })
})
