import type { InputPluginContext } from '@/types'
import fs from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AIAgentIgnoreConfigFileInputPlugin } from './AIAgentIgnoreConfigFileInputPlugin'

vi.mock('node:fs')

describe('aIAgentIgnoreConfigFileInputPlugin', () => {
  let plugin: AIAgentIgnoreConfigFileInputPlugin
  const mockWorkspaceDir = '/workspace'
  const mockShadowSourceProjectDir = '/workspace/aindex'

  beforeEach(() => {
    plugin = new AIAgentIgnoreConfigFileInputPlugin()
    vi.clearAllMocks()
  })

  function createMockInputPluginContext(
    shadowSourceProjectDir: string = mockShadowSourceProjectDir,
  ): InputPluginContext {
    return {
      userConfigOptions: {
        workspaceDir: mockWorkspaceDir,
        shadowSourceProjectDir,
      },
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      } as any,
      fs,
      path,
      dependencyContext: {
        workspace: {
          directory: { pathKind: 0, path: mockWorkspaceDir, basePath: mockWorkspaceDir },
          projects: [
            {
              name: 'project1',
              dirFromWorkspacePath: {
                pathKind: 0,
                path: 'project1',
                basePath: mockWorkspaceDir,
              },
            },
          ],
        },
      },
    } as any
  }

  describe('collect', () => {
    it('should read all ignore files when they exist', () => {
      const ctx = createMockInputPluginContext()

      vi.mocked(fs.existsSync).mockImplementation((filePath: string) => {
        const fileName = path.basename(filePath)
        return ['.qoderignore', '.cursorignore', '.warpindexignore'].includes(fileName)
      })

      vi.mocked(fs.statSync).mockReturnValue({
        isFile: () => true,
        isDirectory: () => false,
      } as any)

      vi.mocked(fs.readFileSync).mockImplementation((filePath: string) => {
        const fileName = path.basename(filePath)
        if (fileName === '.qoderignore') {
          return 'qoder ignore content'
        }
        if (fileName === '.cursorignore') {
          return 'cursor ignore content'
        }
        if (fileName === '.warpindexignore') {
          return 'warp ignore content'
        }
        return ''
      })

      const result = plugin.collect(ctx)

      expect(result.aiAgentIgnoreConfigFiles).toBeDefined()
      expect(result.aiAgentIgnoreConfigFiles).toHaveLength(3)
      expect(result.aiAgentIgnoreConfigFiles).toContainEqual({
        fileName: '.qoderignore',
        content: 'qoder ignore content',
      })
      expect(result.aiAgentIgnoreConfigFiles).toContainEqual({
        fileName: '.cursorignore',
        content: 'cursor ignore content',
      })
      expect(result.aiAgentIgnoreConfigFiles).toContainEqual({
        fileName: '.warpindexignore',
        content: 'warp ignore content',
      })
    })

    it('should read only existing ignore files', () => {
      const ctx = createMockInputPluginContext()

      vi.mocked(fs.existsSync).mockImplementation((filePath: string) => {
        const fileName = path.basename(filePath)
        return fileName === '.cursorignore'
      })

      vi.mocked(fs.statSync).mockReturnValue({
        isFile: () => true,
        isDirectory: () => false,
      } as any)

      vi.mocked(fs.readFileSync).mockReturnValue('cursor ignore content')

      const result = plugin.collect(ctx)

      expect(result.aiAgentIgnoreConfigFiles).toHaveLength(1)
      expect(result.aiAgentIgnoreConfigFiles?.[0]).toEqual({
        fileName: '.cursorignore',
        content: 'cursor ignore content',
      })
    })

    it('should return empty array when no ignore files exist', () => {
      const ctx = createMockInputPluginContext()

      vi.mocked(fs.existsSync).mockReturnValue(false)

      const result = plugin.collect(ctx)

      expect(result.aiAgentIgnoreConfigFiles).toHaveLength(0)
    })

    it('should skip directories and only read files', () => {
      const ctx = createMockInputPluginContext()

      vi.mocked(fs.existsSync).mockReturnValue(true)

      vi.mocked(fs.statSync).mockImplementation((filePath: string) => {
        const fileName = path.basename(filePath)
        return {
          isFile: () => fileName !== '.qoderignore',
          isDirectory: () => fileName === '.qoderignore',
        } as any
      })

      vi.mocked(fs.readFileSync).mockReturnValue('content')

      const result = plugin.collect(ctx)

      expect(result.aiAgentIgnoreConfigFiles).toHaveLength(2)
      expect(result.aiAgentIgnoreConfigFiles?.map((f) => f.fileName)).toEqual([
        '.cursorignore',
        '.warpindexignore',
      ])
    })

    it('should handle read errors gracefully', () => {
      const ctx = createMockInputPluginContext()

      vi.mocked(fs.existsSync).mockReturnValue(true)

      vi.mocked(fs.statSync).mockReturnValue({
        isFile: () => true,
        isDirectory: () => false,
      } as any)

      vi.mocked(fs.readFileSync).mockImplementation((filePath: string) => {
        const fileName = path.basename(filePath)
        if (fileName === '.cursorignore') {
          throw new Error('Permission denied')
        }
        return 'content'
      })

      const result = plugin.collect(ctx)

      expect(result.aiAgentIgnoreConfigFiles).toHaveLength(2)
      expect(result.aiAgentIgnoreConfigFiles?.map((f) => f.fileName)).toEqual([
        '.qoderignore',
        '.warpindexignore',
      ])
      expect(ctx.logger.warn).toHaveBeenCalled()
    })

    it('should log debug message when reading ignore files', () => {
      const ctx = createMockInputPluginContext()

      vi.mocked(fs.existsSync).mockReturnValue(true)

      vi.mocked(fs.statSync).mockReturnValue({
        isFile: () => true,
        isDirectory: () => false,
      } as any)

      vi.mocked(fs.readFileSync).mockReturnValue('content')

      plugin.collect(ctx)

      expect(ctx.logger.debug).toHaveBeenCalledTimes(3)
    })

    it('should support custom shadowSourceProjectDir', () => {
      const customDir = '/custom/shadow/project'
      const ctx = createMockInputPluginContext(customDir)

      vi.mocked(fs.existsSync).mockReturnValue(true)

      vi.mocked(fs.statSync).mockReturnValue({
        isFile: () => true,
        isDirectory: () => false,
      } as any)

      vi.mocked(fs.readFileSync).mockReturnValue('content')

      plugin.collect(ctx)

      // Verify that existsSync was called with paths under custom directory
      const existsCallPaths = vi.mocked(fs.existsSync).mock.calls.map((call) => call[0])
      expect(existsCallPaths.some((p) => (p as string).startsWith(customDir))).toBe(true)
    })

    it('should read ignore files with multiline content', () => {
      const ctx = createMockInputPluginContext()

      vi.mocked(fs.existsSync).mockReturnValue(true)

      vi.mocked(fs.statSync).mockReturnValue({
        isFile: () => true,
        isDirectory: () => false,
      } as any)

      const multilineContent = `# Ignore patterns
*.log
node_modules/
.env
dist/`

      vi.mocked(fs.readFileSync).mockReturnValue(multilineContent)

      const result = plugin.collect(ctx)

      expect(result.aiAgentIgnoreConfigFiles?.[0].content).toBe(multilineContent)
    })
  })
})
