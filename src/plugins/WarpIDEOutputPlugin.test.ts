import type {
  CollectedInputContext,
  GlobalMemoryPrompt,
  OutputPluginContext,
  OutputWriteContext,
  ProjectRootMemoryPrompt,
} from '@/types'
import type { RelativePath } from '@/types/FileSystemTypes'
import fs from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FilePathKind, PromptKind } from '@/types'
import { WarpIDEOutputPlugin } from './WarpIDEOutputPlugin'

// Mock fs module
vi.mock('node:fs')

describe('warpIDEOutputPlugin', () => {
  const mockWorkspaceDir = '/workspace/test'
  let plugin: WarpIDEOutputPlugin

  beforeEach(() => {
    plugin = new WarpIDEOutputPlugin()
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.mkdirSync).mockReturnValue(void 0)
    vi.mocked(fs.writeFileSync).mockReturnValue(void 0)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  function createMockRelativePath(pathStr: string, basePath: string): RelativePath {
    return {
      pathKind: FilePathKind.Relative,
      path: pathStr,
      basePath,
      getDirectoryName: () => path.basename(pathStr),
      getAbsolutePath: () => path.join(basePath, pathStr),
    }
  }

  function createMockRootMemoryPrompt(content: string): ProjectRootMemoryPrompt {
    return {
      type: PromptKind.ProjectRootMemory,
      content,
      dir: createMockRelativePath('.', mockWorkspaceDir),
      markdownContents: [],
      length: content.length,
      filePathKind: FilePathKind.Relative,
    } as ProjectRootMemoryPrompt
  }

  function createMockGlobalMemoryPrompt(content: string): GlobalMemoryPrompt {
    return {
      type: PromptKind.GlobalMemory,
      content,
      dir: createMockRelativePath('.', mockWorkspaceDir),
      markdownContents: [],
      length: content.length,
      filePathKind: FilePathKind.Relative,
      parentDirectoryPath: {
        type: 'UserHome',
        directory: createMockRelativePath('.memory', '/home/user'),
      },
    } as GlobalMemoryPrompt
  }

  function createMockOutputWriteContext(
    collectedInputContext: Partial<CollectedInputContext>,
    dryRun = false,
    registeredPluginNames: readonly string[] = [],
  ): OutputWriteContext {
    return {
      collectedInputContext: {
        workspace: {
          directory: createMockRelativePath('.', mockWorkspaceDir),
          projects: [],
        },
        ideConfigFiles: [],
        ...collectedInputContext,
      } as CollectedInputContext,
      dryRun,
      registeredPluginNames,
    }
  }

  describe('registerProjectOutputFiles', () => {
    it('should register WARP.md for project with rootMemoryPrompt', async () => {
      const projectDir = createMockRelativePath('project1', mockWorkspaceDir)
      const ctx: OutputPluginContext = {
        collectedInputContext: {
          workspace: {
            directory: createMockRelativePath('.', mockWorkspaceDir),
            projects: [
              {
                name: 'test-project',
                dirFromWorkspacePath: projectDir,
                rootMemoryPrompt: createMockRootMemoryPrompt('test content'),
              },
            ],
          },
          ideConfigFiles: [],
        } as CollectedInputContext,
      }

      const results = await plugin.registerProjectOutputFiles(ctx)

      expect(results).toHaveLength(1)
      expect(results[0].path).toBe(path.join('project1', 'WARP.md'))
    })

    it('should register WARP.md for child memory prompts', async () => {
      const projectDir = createMockRelativePath('project1', mockWorkspaceDir)
      const childDir = createMockRelativePath('project1/src', mockWorkspaceDir)

      const ctx: OutputPluginContext = {
        collectedInputContext: {
          workspace: {
            directory: createMockRelativePath('.', mockWorkspaceDir),
            projects: [
              {
                name: 'test-project',
                dirFromWorkspacePath: projectDir,
                childMemoryPrompts: [
                  {
                    type: PromptKind.ProjectChildrenMemory,
                    dir: childDir,
                    content: 'child content',
                    workingChildDirectoryPath: childDir,
                    markdownContents: [],
                    length: 13,
                    filePathKind: FilePathKind.Relative,
                  },
                ],
              },
            ],
          },
          ideConfigFiles: [],
        } as CollectedInputContext,
      }

      const results = await plugin.registerProjectOutputFiles(ctx)

      expect(results).toHaveLength(1)
      expect(results[0].path).toBe(path.join('project1', 'src', 'WARP.md'))
    })

    it('should return empty array when no prompts exist', async () => {
      const ctx: OutputPluginContext = {
        collectedInputContext: {
          workspace: {
            directory: createMockRelativePath('.', mockWorkspaceDir),
            projects: [
              {
                name: 'test-project',
              },
            ],
          },
          ideConfigFiles: [],
        } as CollectedInputContext,
      }

      const results = await plugin.registerProjectOutputFiles(ctx)

      expect(results).toHaveLength(0)
    })
  })

  describe('canWrite', () => {
    it('should return false when AgentsOutputPlugin is registered', async () => {
      const ctx = createMockOutputWriteContext(
        {
          workspace: {
            directory: createMockRelativePath('.', mockWorkspaceDir),
            projects: [
              {
                name: 'test-project',
                dirFromWorkspacePath: createMockRelativePath('project1', mockWorkspaceDir),
                rootMemoryPrompt: createMockRootMemoryPrompt('test content'),
              },
            ] as any,
          } as any,
        },
        false,
        ['AgentsOutputPlugin'],
      )

      const result = await plugin.canWrite(ctx)

      expect(result).toBe(false)
    })

    it('should return true when project has rootMemoryPrompt and AgentsOutputPlugin is not registered', async () => {
      const ctx = createMockOutputWriteContext({
        workspace: {
          directory: createMockRelativePath('.', mockWorkspaceDir),
          projects: [
            {
              name: 'test-project',
              dirFromWorkspacePath: createMockRelativePath('project1', mockWorkspaceDir),
              rootMemoryPrompt: createMockRootMemoryPrompt('test content'),
            },
          ] as any,
        } as any,
      })

      const result = await plugin.canWrite(ctx)

      expect(result).toBe(true)
    })

    it('should return true when project has childMemoryPrompts', async () => {
      const ctx = createMockOutputWriteContext({
        workspace: {
          directory: createMockRelativePath('.', mockWorkspaceDir),
          projects: [
            {
              name: 'test-project',
              dirFromWorkspacePath: createMockRelativePath('project1', mockWorkspaceDir),
              childMemoryPrompts: [
                {
                  type: PromptKind.ProjectChildrenMemory,
                  dir: createMockRelativePath('project1/src', mockWorkspaceDir),
                  content: 'child content',
                  workingChildDirectoryPath: createMockRelativePath('src', mockWorkspaceDir),
                  markdownContents: [],
                  length: 13,
                  filePathKind: FilePathKind.Relative,
                },
              ],
            },
          ] as any,
        } as any,
      })

      const result = await plugin.canWrite(ctx)

      expect(result).toBe(true)
    })

    it('should return false when no outputs exist', async () => {
      const ctx = createMockOutputWriteContext({
        workspace: {
          directory: createMockRelativePath('.', mockWorkspaceDir),
          projects: [
            {
              name: 'test-project',
            },
          ] as any,
        } as any,
      })

      const result = await plugin.canWrite(ctx)

      expect(result).toBe(false)
    })
  })

  describe('writeProjectOutputs', () => {
    it('should write rootMemoryPrompt without globalMemory', async () => {
      const projectDir = createMockRelativePath('project1', mockWorkspaceDir)
      const ctx = createMockOutputWriteContext({
        workspace: {
          directory: createMockRelativePath('.', mockWorkspaceDir),
          projects: [
            {
              name: 'test-project',
              dirFromWorkspacePath: projectDir,
              rootMemoryPrompt: createMockRootMemoryPrompt('# Project Rules\n\nThis is project content.'),
            },
          ] as any,
        } as any,
      })

      const results = await plugin.writeProjectOutputs(ctx)

      expect(results.files).toHaveLength(1)
      expect(results.files[0].success).toBe(true)
      expect(vi.mocked(fs.writeFileSync)).toHaveBeenCalledWith(
        expect.stringContaining('WARP.md'),
        '# Project Rules\n\nThis is project content.',
        'utf-8',
      )
    })

    it('should combine globalMemory with rootMemoryPrompt', async () => {
      const projectDir = createMockRelativePath('project1', mockWorkspaceDir)
      const globalMemory = createMockGlobalMemoryPrompt('# Global Rules\n\nThese are global rules.')
      const rootMemory = createMockRootMemoryPrompt('# Project Rules\n\nThese are project rules.')

      const ctx = createMockOutputWriteContext({
        workspace: {
          directory: createMockRelativePath('.', mockWorkspaceDir),
          projects: [
            {
              name: 'test-project',
              dirFromWorkspacePath: projectDir,
              rootMemoryPrompt: rootMemory,
            },
          ] as any,
        } as any,
        globalMemory,
      })

      const results = await plugin.writeProjectOutputs(ctx)

      expect(results.files).toHaveLength(1)
      expect(results.files[0].success).toBe(true)
      expect(vi.mocked(fs.writeFileSync)).toHaveBeenCalledWith(
        expect.stringContaining('WARP.md'),
        '# Global Rules\n\nThese are global rules.\n\n# Project Rules\n\nThese are project rules.',
        'utf-8',
      )
    })

    it('should prepend globalMemory to the beginning of rootMemoryPrompt', async () => {
      const projectDir = createMockRelativePath('project1', mockWorkspaceDir)
      const globalContent = 'Global content first'
      const projectContent = 'Project content second'
      const globalMemory = createMockGlobalMemoryPrompt(globalContent)
      const rootMemory = createMockRootMemoryPrompt(projectContent)

      const ctx = createMockOutputWriteContext({
        workspace: {
          directory: createMockRelativePath('.', mockWorkspaceDir),
          projects: [
            {
              name: 'test-project',
              dirFromWorkspacePath: projectDir,
              rootMemoryPrompt: rootMemory,
            },
          ] as any,
        } as any,
        globalMemory,
      })

      await plugin.writeProjectOutputs(ctx)

      const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0]
      const writtenContent = writeCall[1] as string

      // Verify global content comes first
      const globalIndex = writtenContent.indexOf(globalContent)
      const projectIndex = writtenContent.indexOf(projectContent)

      expect(globalIndex).toBeGreaterThanOrEqual(0)
      expect(projectIndex).toBeGreaterThan(globalIndex)
      expect(writtenContent).toBe(`${globalContent}\n\n${projectContent}`)
    })

    it('should skip globalMemory if it is empty or whitespace', async () => {
      const projectDir = createMockRelativePath('project1', mockWorkspaceDir)
      const globalMemory = createMockGlobalMemoryPrompt('   \n\n  ')
      const rootMemory = createMockRootMemoryPrompt('# Project Rules')

      const ctx = createMockOutputWriteContext({
        workspace: {
          directory: createMockRelativePath('.', mockWorkspaceDir),
          projects: [
            {
              name: 'test-project',
              dirFromWorkspacePath: projectDir,
              rootMemoryPrompt: rootMemory,
            },
          ] as any,
        } as any,
        globalMemory,
      })

      await plugin.writeProjectOutputs(ctx)

      expect(vi.mocked(fs.writeFileSync)).toHaveBeenCalledWith(
        expect.stringContaining('WARP.md'),
        '# Project Rules',
        'utf-8',
      )
    })

    it('should write multiple projects with globalMemory', async () => {
      const globalMemory = createMockGlobalMemoryPrompt('Global rules')

      const ctx = createMockOutputWriteContext({
        workspace: {
          directory: createMockRelativePath('.', mockWorkspaceDir),
          projects: [
            {
              name: 'project-1',
              dirFromWorkspacePath: createMockRelativePath('project1', mockWorkspaceDir),
              rootMemoryPrompt: createMockRootMemoryPrompt('Project 1 rules'),
            },
            {
              name: 'project-2',
              dirFromWorkspacePath: createMockRelativePath('project2', mockWorkspaceDir),
              rootMemoryPrompt: createMockRootMemoryPrompt('Project 2 rules'),
            },
          ] as any,
        } as any,
        globalMemory,
      })

      const results = await plugin.writeProjectOutputs(ctx)

      expect(results.files).toHaveLength(2)
      expect(results.files[0].success).toBe(true)
      expect(results.files[1].success).toBe(true)

      // Verify both files have global memory prepended
      expect(vi.mocked(fs.writeFileSync)).toHaveBeenCalledTimes(2)
      expect(vi.mocked(fs.writeFileSync)).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('project1'),
        'Global rules\n\nProject 1 rules',
        'utf-8',
      )
      expect(vi.mocked(fs.writeFileSync)).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('project2'),
        'Global rules\n\nProject 2 rules',
        'utf-8',
      )
    })

    it('should not add globalMemory to child prompts', async () => {
      const globalMemory = createMockGlobalMemoryPrompt('Global rules')
      const projectDir = createMockRelativePath('project1', mockWorkspaceDir)
      const childDir = createMockRelativePath('project1/src', mockWorkspaceDir)

      const ctx = createMockOutputWriteContext({
        workspace: {
          directory: createMockRelativePath('.', mockWorkspaceDir),
          projects: [
            {
              name: 'test-project',
              dirFromWorkspacePath: projectDir,
              rootMemoryPrompt: createMockRootMemoryPrompt('Root rules'),
              childMemoryPrompts: [
                {
                  type: PromptKind.ProjectChildrenMemory,
                  dir: childDir,
                  content: 'Child rules',
                  workingChildDirectoryPath: childDir,
                  markdownContents: [],
                  length: 11,
                  filePathKind: FilePathKind.Relative,
                },
              ],
            },
          ] as any,
        } as any,
        globalMemory,
      })

      await plugin.writeProjectOutputs(ctx)

      expect(vi.mocked(fs.writeFileSync)).toHaveBeenCalledTimes(2)

      // Root prompt should have global memory
      expect(vi.mocked(fs.writeFileSync)).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining(path.join('project1', 'WARP.md')),
        'Global rules\n\nRoot rules',
        'utf-8',
      )

      // Child prompt should NOT have global memory
      expect(vi.mocked(fs.writeFileSync)).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining(path.join('project1', 'src', 'WARP.md')),
        'Child rules',
        'utf-8',
      )
    })

    it('should skip project without dirFromWorkspacePath', async () => {
      const ctx = createMockOutputWriteContext({
        workspace: {
          directory: createMockRelativePath('.', mockWorkspaceDir),
          projects: [
            {
              name: 'test-project',
              rootMemoryPrompt: createMockRootMemoryPrompt('content'),
            },
          ] as any,
        } as any,
      })

      const results = await plugin.writeProjectOutputs(ctx)

      expect(results.files).toHaveLength(0)
      expect(vi.mocked(fs.writeFileSync)).not.toHaveBeenCalled()
    })

    it('should support dry-run mode', async () => {
      const projectDir = createMockRelativePath('project1', mockWorkspaceDir)
      const ctx = createMockOutputWriteContext(
        {
          workspace: {
            directory: createMockRelativePath('.', mockWorkspaceDir),
            projects: [
              {
                name: 'test-project',
                dirFromWorkspacePath: projectDir,
                rootMemoryPrompt: createMockRootMemoryPrompt('test content'),
              },
            ] as any,
          } as any,
        },
        true,
      )

      const results = await plugin.writeProjectOutputs(ctx)

      expect(results.files).toHaveLength(1)
      expect(results.files[0].success).toBe(true)
      expect(results.files[0].skipped).toBe(false)
      expect(vi.mocked(fs.writeFileSync)).not.toHaveBeenCalled()
    })
  })
})
