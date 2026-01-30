import type {CollectedInputContext, FastCommandPrompt, OutputPluginContext, Project, SkillPrompt, SubAgentPrompt} from '@/types'
import type {RelativePath} from '@/types/FileSystemTypes'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {FilePathKind, NamingCaseKind, PromptKind} from '@/types'
import {OpencodeCLIOutputPlugin} from './OpencodeCLIOutputPlugin'

function createMockRelativePath(pathStr: string, basePath: string): RelativePath {
  return {
    pathKind: FilePathKind.Relative,
    path: pathStr,
    basePath,
    getDirectoryName: () => pathStr,
    getAbsolutePath: () => path.join(basePath, pathStr)
  }
}

class TestableOpencodeCLIOutputPlugin extends OpencodeCLIOutputPlugin {
  private mockHomeDir: string | null = null

  public setMockHomeDir(dir: string | null): void {
    this.mockHomeDir = dir
  }

  protected override getHomeDir(): string {
    if (this.mockHomeDir != null) return this.mockHomeDir
    return super.getHomeDir()
  }
}

describe('opencodeCLIOutputPlugin', () => {
  let tempDir: string,
    plugin: TestableOpencodeCLIOutputPlugin,
    mockContext: OutputPluginContext

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opencode-test-'))
    plugin = new TestableOpencodeCLIOutputPlugin()
    plugin.setMockHomeDir(tempDir)

    mockContext = {
      collectedInputContext: {
        workspace: {
          projects: [],
          directory: createMockRelativePath('.', tempDir)
        },
        globalMemory: {
          type: PromptKind.GlobalMemory,
          content: 'Global Memory Content',
          filePathKind: FilePathKind.Absolute,
          dir: createMockRelativePath('.', tempDir),
          markdownContents: []
        },
        fastCommands: [],
        subAgents: [],
        skills: []
      } as unknown as CollectedInputContext,
      logger: {debug: vi.fn(), trace: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn()} as any,
      fs,
      path,
      glob: {} as any
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

  describe('constructor', () => {
    it('should have correct plugin name', () => expect(plugin.name).toBe('OpencodeCLIOutputPlugin'))

    it('should have correct dependencies', () => expect(plugin.dependsOn).toContain('AgentsOutputPlugin'))
  })

  describe('registerGlobalOutputDirs', () => {
    it('should register commands, agents, and skills subdirectories in .config/opencode', async () => {
      const dirs = await plugin.registerGlobalOutputDirs(mockContext)

      const dirPaths = dirs.map(d => d.path)
      expect(dirPaths).toContain('commands')
      expect(dirPaths).toContain('agents')
      expect(dirPaths).toContain('skills')

      const expectedBasePath = path.join(tempDir, '.config/opencode')
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
          filePathKind: FilePathKind.Relative,
          dir: createMockRelativePath('.', tempDir) as any,
          markdownContents: [],
          length: 0,
          yamlFrontMatter: {namingCase: NamingCaseKind.KebabCase}
        },
        childMemoryPrompts: []
      }

      const ctxWithProject = {
        ...mockContext,
        collectedInputContext: {
          ...mockContext.collectedInputContext,
          workspace: {
            ...mockContext.collectedInputContext.workspace,
            projects: [mockProject]
          }
        }
      }

      const dirs = await plugin.registerProjectOutputDirs(ctxWithProject)
      const dirPaths = dirs.map(d => d.path)

      expect(dirPaths.some(p => p.includes(path.join('.config/opencode', 'commands')))).toBe(true)
      expect(dirPaths.some(p => p.includes(path.join('.config/opencode', 'agents')))).toBe(true)
      expect(dirPaths.some(p => p.includes(path.join('.config/opencode', 'skills')))).toBe(true)
    })
  })

  describe('registerGlobalOutputFiles', () => {
    it('should register AGENTS.md in global config dir', async () => {
      const files = await plugin.registerGlobalOutputFiles(mockContext)
      const outputFile = files.find(f => f.path === 'AGENTS.md')

      expect(outputFile).toBeDefined()
      expect(outputFile?.basePath).toBe(path.join(tempDir, '.config/opencode'))
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
        yamlFrontMatter: {namingCase: NamingCaseKind.KebabCase, description: 'desc'}
      }

      const ctxWithCmd = {
        ...mockContext,
        collectedInputContext: {
          ...mockContext.collectedInputContext,
          fastCommands: [mockCmd]
        }
      }

      const files = await plugin.registerGlobalOutputFiles(ctxWithCmd)
      const cmdFile = files.find(f => f.path.includes('test-cmd.md'))

      expect(cmdFile).toBeDefined()
      expect(cmdFile?.path).toContain('commands')
      expect(cmdFile?.basePath).toBe(path.join(tempDir, '.config/opencode'))
    })

    it('should register agents in agents subdirectory', async () => {
      const mockAgent: SubAgentPrompt = {
        type: PromptKind.SubAgent,
        content: 'content',
        filePathKind: FilePathKind.Relative,
        dir: createMockRelativePath('review-agent.md', tempDir),
        markdownContents: [],
        length: 0,
        yamlFrontMatter: {namingCase: NamingCaseKind.KebabCase, name: 'review-agent', description: 'Code review agent'}
      }

      const ctxWithAgent = {
        ...mockContext,
        collectedInputContext: {
          ...mockContext.collectedInputContext,
          subAgents: [mockAgent]
        }
      }

      const files = await plugin.registerGlobalOutputFiles(ctxWithAgent)
      const agentFile = files.find(f => f.path.includes('review-agent.md'))

      expect(agentFile).toBeDefined()
      expect(agentFile?.path).toContain('agents')
      expect(agentFile?.basePath).toBe(path.join(tempDir, '.config/opencode'))
    })

    it('should register skills in skills subdirectory', async () => {
      const mockSkill: SkillPrompt = {
        type: PromptKind.Skill,
        content: 'content',
        filePathKind: FilePathKind.Relative,
        dir: createMockRelativePath('test-skill', tempDir),
        markdownContents: [],
        length: 0,
        yamlFrontMatter: {namingCase: NamingCaseKind.KebabCase, name: 'test-skill', description: 'desc'}
      }

      const ctxWithSkill = {
        ...mockContext,
        collectedInputContext: {
          ...mockContext.collectedInputContext,
          skills: [mockSkill]
        }
      }

      const files = await plugin.registerGlobalOutputFiles(ctxWithSkill)
      const skillFile = files.find(f => f.path.includes('SKILL.md'))

      expect(skillFile).toBeDefined()
      expect(skillFile?.path).toContain('skills')
      expect(skillFile?.basePath).toBe(path.join(tempDir, '.config/opencode'))
    })
  })

  describe('registerProjectOutputFiles', () => {
    it('should return empty array (no project-level AGENTS.md)', async () => {
      const mockProject: Project = {
        name: 'test-project',
        dirFromWorkspacePath: createMockRelativePath('project-a', tempDir),
        childMemoryPrompts: []
      }

      const ctxWithProject = {
        ...mockContext,
        collectedInputContext: {
          ...mockContext.collectedInputContext,
          workspace: {
            ...mockContext.collectedInputContext.workspace,
            projects: [mockProject]
          }
        }
      }

      const files = await plugin.registerProjectOutputFiles(ctxWithProject)
      expect(files).toEqual([])
    })
  })

  describe('skill name normalization', () => {
    it('should normalize skill names to opencode format', async () => {
      const testCases = [
        {input: 'My Skill', expected: 'my-skill'},
        {input: 'Skill__Name', expected: 'skill-name'},
        {input: '-skill-', expected: 'skill'},
        {input: 'UPPER_CASE', expected: 'upper-case'},
        {input: 'tool.name', expected: 'tool-name'},
        {input: 'a'.repeat(70), expected: 'a'.repeat(64)} // truncated to 64 chars
      ]

      for (const {input, expected} of testCases) {
        const mockSkill: SkillPrompt = {
          type: PromptKind.Skill,
          content: 'content',
          filePathKind: FilePathKind.Relative,
          dir: createMockRelativePath(input, tempDir),
          markdownContents: [],
          length: 0,
          yamlFrontMatter: {namingCase: NamingCaseKind.KebabCase, name: input, description: 'desc'}
        }

        const ctxWithSkill = {
          ...mockContext,
          collectedInputContext: {
            ...mockContext.collectedInputContext,
            skills: [mockSkill]
          }
        }

        const files = await plugin.registerGlobalOutputFiles(ctxWithSkill)
        const skillFile = files.find(f => f.path.includes('SKILL.md'))

        expect(skillFile).toBeDefined()
        expect(skillFile?.path).toContain(`skills/${expected}/`)
      }
    })
  })
})
