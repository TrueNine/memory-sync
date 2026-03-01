import type {
  CollectedInputContext,
  OutputPluginContext,
  OutputWriteContext,
  RelativePath,
  SkillChildDoc,
  SkillPrompt,
  SkillResource,
  SkillYAMLFrontMatter
} from '@truenine/plugin-shared'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {FilePathKind, PromptKind} from '@truenine/plugin-shared'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {GenericSkillsOutputPlugin} from './GenericSkillsOutputPlugin'

vi.mock('node:fs')
vi.mock('node:os')

describe('genericSkillsOutputPlugin', () => {
  const mockWorkspaceDir = '/workspace/test'
  const mockHomeDir = '/home/user'
  let plugin: GenericSkillsOutputPlugin

  beforeEach(() => {
    plugin = new GenericSkillsOutputPlugin()
    vi.mocked(os.homedir).mockReturnValue(mockHomeDir)
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.mkdirSync).mockReturnValue(void 0)
    vi.mocked(fs.writeFileSync).mockReturnValue(void 0)
    vi.mocked(fs.symlinkSync).mockReturnValue(void 0)
    vi.mocked(fs.lstatSync).mockReturnValue({isSymbolicLink: () => false, isDirectory: () => false} as fs.Stats)
  })

  afterEach(() => vi.clearAllMocks())

  function createMockRelativePath(pathStr: string, basePath: string): RelativePath {
    return {
      pathKind: FilePathKind.Relative,
      path: pathStr,
      basePath,
      getDirectoryName: () => path.basename(pathStr),
      getAbsolutePath: () => path.join(basePath, pathStr)
    }
  }

  function createMockSkillPrompt(
    name: string,
    content: string,
    options?: {
      description?: string
      keywords?: readonly string[]
      displayName?: string
      author?: string
      version?: string
      mcpConfig?: {rawContent: string}
      childDocs?: {relativePath: string, content: string}[]
      resources?: {relativePath: string, content: string, encoding: 'text' | 'base64'}[]
    }
  ): SkillPrompt {
    const yamlFrontMatter: SkillYAMLFrontMatter = {
      name,
      description: options?.description ?? `Description for ${name}`,
      namingCase: 0 as any,
      keywords: options?.keywords ?? [],
      displayName: options?.displayName ?? name,
      author: options?.author ?? '',
      version: options?.version ?? ''
    }

    const childDocs: SkillChildDoc[] | undefined = options?.childDocs?.map(d => ({
      type: PromptKind.SkillChildDoc,
      relativePath: d.relativePath,
      content: d.content,
      markdownContents: [],
      dir: createMockRelativePath(d.relativePath, '/shadow/.skills'),
      length: d.content.length,
      filePathKind: FilePathKind.Relative
    }))

    const resources: SkillResource[] | undefined = options?.resources?.map(r => ({
      type: PromptKind.SkillResource,
      relativePath: r.relativePath,
      content: r.content,
      encoding: r.encoding,
      extension: path.extname(r.relativePath),
      fileName: path.basename(r.relativePath),
      category: 'other' as const,
      length: r.content.length
    }))

    return {
      type: PromptKind.Skill,
      content,
      length: content.length,
      filePathKind: FilePathKind.Relative,
      markdownContents: [],
      yamlFrontMatter,
      dir: createMockRelativePath(name, '/shadow/.skills'),
      mcpConfig: options?.mcpConfig != null
        ? {
            type: PromptKind.SkillMcpConfig,
            mcpServers: {},
            rawContent: options.mcpConfig.rawContent
          }
        : void 0,
      childDocs,
      resources
    } as unknown as SkillPrompt
  }

  function createMockOutputWriteContext(
    collectedInputContext: Partial<CollectedInputContext>,
    dryRun = false
  ): OutputWriteContext {
    return {
      collectedInputContext: {
        workspace: {
          directory: createMockRelativePath('.', mockWorkspaceDir),
          projects: []
        },
        ideConfigFiles: [],
        ...collectedInputContext
      } as CollectedInputContext,
      dryRun,
      registeredPluginNames: [],
      logger: {trace: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn()} as any,
      fs,
      path,
      glob: vi.fn() as any
    }
  }

  function createMockOutputPluginContext(
    collectedInputContext: Partial<CollectedInputContext>
  ): OutputPluginContext {
    return {
      collectedInputContext: {
        workspace: {
          directory: createMockRelativePath('.', mockWorkspaceDir),
          projects: []
        },
        ideConfigFiles: [],
        ...collectedInputContext
      } as CollectedInputContext,
      logger: {trace: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn()} as any,
      fs,
      path,
      glob: vi.fn() as any
    }
  }

  describe('canWrite', () => {
    it('should return false when no skills exist', async () => {
      const ctx = createMockOutputWriteContext({
        workspace: {
          directory: createMockRelativePath('.', mockWorkspaceDir),
          projects: [{name: 'test-project', dirFromWorkspacePath: createMockRelativePath('project1', mockWorkspaceDir)}]
        }
      })

      const result = await plugin.canWrite(ctx)
      expect(result).toBe(false)
    })

    it('should return false when no projects exist', async () => {
      const ctx = createMockOutputWriteContext({
        workspace: {
          directory: createMockRelativePath('.', mockWorkspaceDir),
          projects: []
        },
        skills: [createMockSkillPrompt('test-skill', 'content')]
      })

      const result = await plugin.canWrite(ctx)
      expect(result).toBe(false)
    })

    it('should return true when skills and projects exist', async () => {
      const ctx = createMockOutputWriteContext({
        workspace: {
          directory: createMockRelativePath('.', mockWorkspaceDir),
          projects: [{name: 'test-project', dirFromWorkspacePath: createMockRelativePath('project1', mockWorkspaceDir)}]
        },
        skills: [createMockSkillPrompt('test-skill', 'content')]
      })

      const result = await plugin.canWrite(ctx)
      expect(result).toBe(true)
    })
  })

  describe('registerProjectOutputDirs', () => {
    it('should register both .agents/skills and legacy .skills directories for each project', async () => {
      const ctx = createMockOutputPluginContext({
        workspace: {
          directory: createMockRelativePath('.', mockWorkspaceDir),
          projects: [
            {name: 'project1', dirFromWorkspacePath: createMockRelativePath('project1', mockWorkspaceDir)},
            {name: 'project2', dirFromWorkspacePath: createMockRelativePath('project2', mockWorkspaceDir)}
          ]
        },
        skills: [createMockSkillPrompt('test-skill', 'content')]
      })

      const results = await plugin.registerProjectOutputDirs(ctx)

      expect(results).toHaveLength(4) // Each project should register 2 directories: .agents/skills and .skills
      expect(results[0]?.path).toBe(path.join('project1', '.agents', 'skills'))
      expect(results[1]?.path).toBe(path.join('project1', '.skills'))
      expect(results[2]?.path).toBe(path.join('project2', '.agents', 'skills'))
      expect(results[3]?.path).toBe(path.join('project2', '.skills'))
    })

    it('should return empty array when no skills exist', async () => {
      const ctx = createMockOutputPluginContext({
        workspace: {
          directory: createMockRelativePath('.', mockWorkspaceDir),
          projects: [{name: 'project1', dirFromWorkspacePath: createMockRelativePath('project1', mockWorkspaceDir)}]
        }
      })

      const results = await plugin.registerProjectOutputDirs(ctx)
      expect(results).toHaveLength(0)
    })
  })

  describe('registerGlobalOutputDirs', () => {
    it('should return empty array (no global output dirs)', async () => {
      const ctx = createMockOutputPluginContext({
        workspace: {
          directory: createMockRelativePath('.', mockWorkspaceDir),
          projects: [{name: 'project1', dirFromWorkspacePath: createMockRelativePath('project1', mockWorkspaceDir)}]
        },
        skills: [createMockSkillPrompt('test-skill', 'content')]
      })

      const results = await plugin.registerGlobalOutputDirs(ctx)

      expect(results).toHaveLength(0)
    })
  })

  describe('registerGlobalOutputFiles', () => {
    it('should return empty array (no global output files)', async () => {
      const ctx = createMockOutputPluginContext({
        workspace: {
          directory: createMockRelativePath('.', mockWorkspaceDir),
          projects: [{name: 'project1', dirFromWorkspacePath: createMockRelativePath('project1', mockWorkspaceDir)}]
        },
        skills: [createMockSkillPrompt('test-skill', 'content')]
      })

      const results = await plugin.registerGlobalOutputFiles(ctx)

      expect(results).toHaveLength(0)
    })
  })

  describe('registerProjectOutputFiles', () => {
    it('should register skill files for each skill in each project', async () => {
      const ctx = createMockOutputPluginContext({
        workspace: {
          directory: createMockRelativePath('.', mockWorkspaceDir),
          projects: [{name: 'project1', dirFromWorkspacePath: createMockRelativePath('project1', mockWorkspaceDir)}]
        },
        skills: [
          createMockSkillPrompt('skill-a', 'content a'),
          createMockSkillPrompt('skill-b', 'content b')
        ]
      })

      const results = await plugin.registerProjectOutputFiles(ctx)

      expect(results).toHaveLength(2) // 2 skills * 1 file each = 2 files
      expect(results[0]?.path).toBe(path.join('.agents', 'skills', 'skill-a', 'SKILL.md'))
      expect(results[1]?.path).toBe(path.join('.agents', 'skills', 'skill-b', 'SKILL.md'))
    })

    it('should register mcp.json when skill has MCP config', async () => {
      const ctx = createMockOutputPluginContext({
        workspace: {
          directory: createMockRelativePath('.', mockWorkspaceDir),
          projects: [{name: 'project1', dirFromWorkspacePath: createMockRelativePath('project1', mockWorkspaceDir)}]
        },
        skills: [createMockSkillPrompt('test-skill', 'content', {mcpConfig: {rawContent: '{}'}})]
      })

      const results = await plugin.registerProjectOutputFiles(ctx)

      expect(results).toHaveLength(2)
      expect(results[0]?.path).toBe(path.join('.agents', 'skills', 'test-skill', 'SKILL.md'))
      expect(results[1]?.path).toBe(path.join('.agents', 'skills', 'test-skill', 'mcp.json'))
    })

    it('should register child docs', async () => {
      const ctx = createMockOutputPluginContext({
        workspace: {
          directory: createMockRelativePath('.', mockWorkspaceDir),
          projects: [{name: 'project1', dirFromWorkspacePath: createMockRelativePath('project1', mockWorkspaceDir)}]
        },
        skills: [createMockSkillPrompt('test-skill', 'content', {
          childDocs: [{relativePath: 'doc1.mdx', content: 'doc content'}]
        })]
      })

      const results = await plugin.registerProjectOutputFiles(ctx)

      expect(results).toHaveLength(2)
      expect(results[0]?.path).toBe(path.join('.agents', 'skills', 'test-skill', 'SKILL.md'))
      expect(results[1]?.path).toBe(path.join('.agents', 'skills', 'test-skill', 'doc1.md'))
    })

    it('should register resources', async () => {
      const ctx = createMockOutputPluginContext({
        workspace: {
          directory: createMockRelativePath('.', mockWorkspaceDir),
          projects: [{name: 'project1', dirFromWorkspacePath: createMockRelativePath('project1', mockWorkspaceDir)}]
        },
        skills: [createMockSkillPrompt('test-skill', 'content', {
          resources: [{relativePath: 'resource.json', content: '{}', encoding: 'text'}]
        })]
      })

      const results = await plugin.registerProjectOutputFiles(ctx)

      expect(results).toHaveLength(2)
      expect(results[0]?.path).toBe(path.join('.agents', 'skills', 'test-skill', 'SKILL.md'))
      expect(results[1]?.path).toBe(path.join('.agents', 'skills', 'test-skill', 'resource.json'))
    })
  })

  describe('writeProjectOutputs', () => {
    it('should write skill files directly to project directory', async () => {
      const ctx = createMockOutputWriteContext({
        workspace: {
          directory: createMockRelativePath('.', mockWorkspaceDir),
          projects: [
            {name: 'project1', dirFromWorkspacePath: createMockRelativePath('project1', mockWorkspaceDir)},
            {name: 'project2', dirFromWorkspacePath: createMockRelativePath('project2', mockWorkspaceDir)}
          ]
        },
        skills: [createMockSkillPrompt('test-skill', 'content')]
      })

      const results = await plugin.writeProjectOutputs(ctx)

      expect(results.files).toHaveLength(2) // 2 projects * 1 skill = 2 files
      expect(results.files[0]?.success).toBe(true)
      expect(results.files[1]?.success).toBe(true)

      expect(vi.mocked(fs.writeFileSync)).toHaveBeenCalled() // Verify files are written (not symlinks created)
      expect(vi.mocked(fs.symlinkSync)).not.toHaveBeenCalled()

      const writeCalls = vi.mocked(fs.writeFileSync).mock.calls // Verify correct paths
      expect(writeCalls[0]?.[0]).toContain(path.join('project1', '.agents', 'skills', 'test-skill', 'SKILL.md'))
      expect(writeCalls[1]?.[0]).toContain(path.join('project2', '.agents', 'skills', 'test-skill', 'SKILL.md'))
    })

    it('should support dry-run mode', async () => {
      const ctx = createMockOutputWriteContext(
        {
          workspace: {
            directory: createMockRelativePath('.', mockWorkspaceDir),
            projects: [{name: 'project1', dirFromWorkspacePath: createMockRelativePath('project1', mockWorkspaceDir)}]
          },
          skills: [createMockSkillPrompt('test-skill', 'content')]
        },
        true
      )

      const results = await plugin.writeProjectOutputs(ctx)

      expect(results.files).toHaveLength(1)
      expect(results.files[0]?.success).toBe(true)
      expect(vi.mocked(fs.writeFileSync)).not.toHaveBeenCalled()
    })

    it('should skip project without dirFromWorkspacePath', async () => {
      const ctx = createMockOutputWriteContext({
        workspace: {
          directory: createMockRelativePath('.', mockWorkspaceDir),
          projects: [{name: 'project1'}]
        },
        skills: [createMockSkillPrompt('test-skill', 'content')]
      })

      const results = await plugin.writeProjectOutputs(ctx)

      expect(results.files).toHaveLength(0)
    })

    it('should return empty results when no skills exist', async () => {
      const ctx = createMockOutputWriteContext({
        workspace: {
          directory: createMockRelativePath('.', mockWorkspaceDir),
          projects: [{name: 'project1', dirFromWorkspacePath: createMockRelativePath('project1', mockWorkspaceDir)}]
        }
      })

      const results = await plugin.writeProjectOutputs(ctx)

      expect(results.files).toHaveLength(0)
      expect(results.dirs).toHaveLength(0)
    })

    it('should write skill with front matter', async () => {
      const ctx = createMockOutputWriteContext({
        workspace: {
          directory: createMockRelativePath('.', mockWorkspaceDir),
          projects: [{name: 'project1', dirFromWorkspacePath: createMockRelativePath('project1', mockWorkspaceDir)}]
        },
        skills: [createMockSkillPrompt('test-skill', '# Skill Content', {
          description: 'A test skill',
          keywords: ['test', 'demo']
        })]
      })

      await plugin.writeProjectOutputs(ctx)

      const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0]
      expect(writeCall).toBeDefined()
      expect(writeCall?.[0]).toContain(path.join('project1', '.agents', 'skills', 'test-skill', 'SKILL.md'))

      const writtenContent = writeCall?.[1] as string
      expect(writtenContent).toContain('name: test-skill')
      expect(writtenContent).toContain('description: A test skill')
      expect(writtenContent).toContain('# Skill Content')
    })
  })

  describe('writeGlobalOutputs', () => {
    it('should return empty results (no global output)', async () => {
      const ctx = createMockOutputWriteContext({
        workspace: {
          directory: createMockRelativePath('.', mockWorkspaceDir),
          projects: [{name: 'project1', dirFromWorkspacePath: createMockRelativePath('project1', mockWorkspaceDir)}]
        },
        skills: [createMockSkillPrompt('test-skill', 'content')]
      })

      const results = await plugin.writeGlobalOutputs(ctx)

      expect(results.files).toHaveLength(0)
      expect(results.dirs).toHaveLength(0)
      expect(vi.mocked(fs.writeFileSync)).not.toHaveBeenCalled()
    })
  })
})
