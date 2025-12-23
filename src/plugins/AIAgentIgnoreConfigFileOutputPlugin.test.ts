import type {
  AIAgentIgnoreConfigFile,
  CollectedInputContext,
  OutputPluginContext,
  OutputWriteContext,
} from '@/types'
import type { RelativePath } from '@/types/FileSystemTypes'
import fs from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FilePathKind } from '@/types'
import { AIAgentIgnoreConfigFileOutputPlugin } from './AIAgentIgnoreConfigFileOutputPlugin'

vi.mock('node:fs')

describe('aIAgentIgnoreConfigFileOutputPlugin', () => {
  let plugin: AIAgentIgnoreConfigFileOutputPlugin
  const mockWorkspaceDir = '/workspace'

  beforeEach(() => {
    plugin = new AIAgentIgnoreConfigFileOutputPlugin()
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.mkdirSync).mockReturnValue(void 0)
    vi.mocked(fs.writeFileSync).mockReturnValue(void 0)
    vi.clearAllMocks()
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

  function createMockIgnoreFiles(): AIAgentIgnoreConfigFile[] {
    return [
      { fileName: '.qoderignore', content: 'qoder patterns' },
      { fileName: '.cursorignore', content: 'cursor patterns' },
      { fileName: '.warpindexignore', content: 'warp patterns' },
    ]
  }

  function createMockOutputPluginContext(
    ignoreFiles: AIAgentIgnoreConfigFile[] = [],
  ): OutputPluginContext {
    return {
      collectedInputContext: {
        workspace: {
          directory: createMockRelativePath('.', mockWorkspaceDir),
          projects: [
            {
              name: 'test-project',
              dirFromWorkspacePath: createMockRelativePath('project1', mockWorkspaceDir),
            },
          ],
        },
        ideConfigFiles: [],
        aiAgentIgnoreConfigFiles: ignoreFiles,
      } as CollectedInputContext,
    }
  }

  function createMockOutputWriteContext(
    ignoreFiles: AIAgentIgnoreConfigFile[] = [],
    dryRun = false,
  ): OutputWriteContext {
    return {
      collectedInputContext: {
        workspace: {
          directory: createMockRelativePath('.', mockWorkspaceDir),
          projects: [
            {
              name: 'test-project',
              dirFromWorkspacePath: createMockRelativePath('project1', mockWorkspaceDir),
            },
          ],
        },
        ideConfigFiles: [],
        aiAgentIgnoreConfigFiles: ignoreFiles,
      } as CollectedInputContext,
      dryRun,
    }
  }

  describe('registerProjectOutputDirs', () => {
    it('should return empty array', async () => {
      const ignoreFiles = createMockIgnoreFiles()
      const ctx = createMockOutputPluginContext(ignoreFiles)

      const results = await plugin.registerProjectOutputDirs(ctx)

      expect(results).toHaveLength(0)
    })
  })

  describe('registerProjectOutputFiles', () => {
    it('should register all ignore files for each project regardless of aiAgentIgnoreConfigFiles', async () => {
      // Even with ignore files provided, should register all known ignore file types
      const ignoreFiles = createMockIgnoreFiles()
      const ctx = createMockOutputPluginContext(ignoreFiles)

      const results = await plugin.registerProjectOutputFiles(ctx)

      expect(results).toHaveLength(3)
      expect(results.map((r) => r.path)).toEqual([
        path.join('project1', '.qoderignore'),
        path.join('project1', '.cursorignore'),
        path.join('project1', '.warpindexignore'),
      ])
    })

    it('should register all ignore files even when aiAgentIgnoreConfigFiles is empty', async () => {
      // This is the key fix: cleanup should work even without collected ignore files
      const ctx = createMockOutputPluginContext([])

      const results = await plugin.registerProjectOutputFiles(ctx)

      // Should still register all known ignore file types for cleanup
      expect(results).toHaveLength(3)
      expect(results.map((r) => r.path)).toEqual([
        path.join('project1', '.qoderignore'),
        path.join('project1', '.cursorignore'),
        path.join('project1', '.warpindexignore'),
      ])
    })

    it('should register files for multiple projects', async () => {
      const ignoreFiles = createMockIgnoreFiles()
      const ctx: OutputPluginContext = {
        collectedInputContext: {
          workspace: {
            directory: createMockRelativePath('.', mockWorkspaceDir),
            projects: [
              {
                name: 'project-1',
                dirFromWorkspacePath: createMockRelativePath('project1', mockWorkspaceDir),
              },
              {
                name: 'project-2',
                dirFromWorkspacePath: createMockRelativePath('project2', mockWorkspaceDir),
              },
            ],
          },
          ideConfigFiles: [],
          aiAgentIgnoreConfigFiles: ignoreFiles,
        } as CollectedInputContext,
      }

      const results = await plugin.registerProjectOutputFiles(ctx)

      expect(results).toHaveLength(6)
      expect(results.map((r) => r.path)).toContain(path.join('project1', '.qoderignore'))
      expect(results.map((r) => r.path)).toContain(path.join('project2', '.qoderignore'))
    })

    it('should skip shadow source project since their ignore files are protected source files', async () => {
      const ignoreFiles = createMockIgnoreFiles()
      const ctx: OutputPluginContext = {
        collectedInputContext: {
          workspace: {
            directory: createMockRelativePath('.', mockWorkspaceDir),
            projects: [
              {
                name: 'regular-project',
                dirFromWorkspacePath: createMockRelativePath('project1', mockWorkspaceDir),
              },
              {
                name: 'prompt-source-project',
                // Prompt source project (e.g., aindex) - should be skipped for cleanup
                // to protect source files
                isPromptSourceProject: true,
                dirFromWorkspacePath: createMockRelativePath('prompt-source-project', mockWorkspaceDir),
              },
            ],
          },
          ideConfigFiles: [],
          aiAgentIgnoreConfigFiles: ignoreFiles,
        } as CollectedInputContext,
      }

      const results = await plugin.registerProjectOutputFiles(ctx)

      // Should only register files for regular project, NOT prompt source project
      // because prompt source project files are source files that should be protected
      expect(results).toHaveLength(3)
      expect(results.map((r) => r.path)).toContain(path.join('project1', '.qoderignore'))
      expect(results.map((r) => r.path)).not.toContain(path.join('prompt-source-project', '.qoderignore'))
    })
  })

  describe('canWrite', () => {
    it('should return true when ignore files exist', async () => {
      const ignoreFiles = createMockIgnoreFiles()
      const ctx = createMockOutputWriteContext(ignoreFiles)

      const result = await plugin.canWrite(ctx)

      expect(result).toBe(true)
    })

    it('should return false when no ignore files exist', async () => {
      const ctx = createMockOutputWriteContext([])

      const result = await plugin.canWrite(ctx)

      expect(result).toBe(false)
    })
  })

  describe('writeProjectOutputs', () => {
    it('should write ignore files to project directories', async () => {
      const ignoreFiles = createMockIgnoreFiles()
      const ctx = createMockOutputWriteContext(ignoreFiles)

      const results = await plugin.writeProjectOutputs(ctx)

      expect(results.files).toHaveLength(3)
      expect(results.files.every((r) => r.success)).toBe(true)
      expect(vi.mocked(fs.writeFileSync)).toHaveBeenCalledTimes(3)
    })

    it('should write files to correct project paths', async () => {
      const ignoreFiles = createMockIgnoreFiles()
      const ctx = createMockOutputWriteContext(ignoreFiles)

      await plugin.writeProjectOutputs(ctx)

      expect(vi.mocked(fs.writeFileSync)).toHaveBeenNthCalledWith(
        1,
        path.join(mockWorkspaceDir, 'project1', '.qoderignore'),
        'qoder patterns',
        'utf-8',
      )
      expect(vi.mocked(fs.writeFileSync)).toHaveBeenNthCalledWith(
        2,
        path.join(mockWorkspaceDir, 'project1', '.cursorignore'),
        'cursor patterns',
        'utf-8',
      )
      expect(vi.mocked(fs.writeFileSync)).toHaveBeenNthCalledWith(
        3,
        path.join(mockWorkspaceDir, 'project1', '.warpindexignore'),
        'warp patterns',
        'utf-8',
      )
    })

    it('should not ensure directory exists (files written to project root)', async () => {
      const ignoreFiles = createMockIgnoreFiles()
      const ctx = createMockOutputWriteContext(ignoreFiles)

      await plugin.writeProjectOutputs(ctx)

      // ensureDirectory should not be called since files are written to project root
      expect(vi.mocked(fs.mkdirSync)).not.toHaveBeenCalled()
    })

    it('should support dry-run mode', async () => {
      const ignoreFiles = createMockIgnoreFiles()
      const ctx = createMockOutputWriteContext(ignoreFiles, true)

      const results = await plugin.writeProjectOutputs(ctx)

      expect(results.files).toHaveLength(3)
      expect(results.files.every((r) => r.success && r.skipped === false)).toBe(true)
      expect(vi.mocked(fs.writeFileSync)).not.toHaveBeenCalled()
    })

    it('should handle write errors gracefully', async () => {
      const ignoreFiles = createMockIgnoreFiles()
      const ctx = createMockOutputWriteContext(ignoreFiles)

      vi.mocked(fs.writeFileSync).mockImplementation((filePath: string) => {
        if ((filePath).includes('.cursorignore')) {
          throw new Error('Permission denied')
        }
      })

      const results = await plugin.writeProjectOutputs(ctx)

      expect(results.files).toHaveLength(3)
      expect(results.files[0].success).toBe(true)
      expect(results.files[1].success).toBe(false)
      expect(results.files[1].error).toBeDefined()
      expect(results.files[2].success).toBe(true)
    })

    it('should return empty results when no ignore files exist', async () => {
      const ctx = createMockOutputWriteContext([])

      const results = await plugin.writeProjectOutputs(ctx)

      expect(results.files).toHaveLength(0)
      expect(results.dirs).toHaveLength(0)
      expect(vi.mocked(fs.writeFileSync)).not.toHaveBeenCalled()
    })

    it('should skip projects without dirFromWorkspacePath', async () => {
      const ignoreFiles = createMockIgnoreFiles()
      const ctx: OutputWriteContext = {
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
          aiAgentIgnoreConfigFiles: ignoreFiles,
        } as CollectedInputContext,
        dryRun: false,
      }

      const results = await plugin.writeProjectOutputs(ctx)

      expect(results.files).toHaveLength(0)
      expect(vi.mocked(fs.writeFileSync)).not.toHaveBeenCalled()
    })

    it('should write files for multiple projects', async () => {
      const ignoreFiles = createMockIgnoreFiles()
      const ctx: OutputWriteContext = {
        collectedInputContext: {
          workspace: {
            directory: createMockRelativePath('.', mockWorkspaceDir),
            projects: [
              {
                name: 'project-1',
                dirFromWorkspacePath: createMockRelativePath('project1', mockWorkspaceDir),
              },
              {
                name: 'project-2',
                dirFromWorkspacePath: createMockRelativePath('project2', mockWorkspaceDir),
              },
            ],
          },
          ideConfigFiles: [],
          aiAgentIgnoreConfigFiles: ignoreFiles,
        } as CollectedInputContext,
        dryRun: false,
      }

      const results = await plugin.writeProjectOutputs(ctx)

      expect(results.files).toHaveLength(6)
      expect(vi.mocked(fs.writeFileSync)).toHaveBeenCalledTimes(6)
    })
  })
})
