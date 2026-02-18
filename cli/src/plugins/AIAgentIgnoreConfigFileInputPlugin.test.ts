import type {InputPluginContext} from '@/types'
import fs from 'node:fs'
import path from 'node:path'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import {AIAgentIgnoreConfigFileInputPlugin} from './AIAgentIgnoreConfigFileInputPlugin'

vi.mock('node:fs')

describe('aIAgentIgnoreConfigFileInputPlugin', () => {
  let plugin: AIAgentIgnoreConfigFileInputPlugin
  const mockWorkspaceDir = '/workspace'

  beforeEach(() => {
    plugin = new AIAgentIgnoreConfigFileInputPlugin()
    vi.clearAllMocks()
  })

  function createMockInputPluginContext(): InputPluginContext {
    return {
      userConfigOptions: {
        workspaceDir: mockWorkspaceDir,
        shadowSourceProject: {
          name: 'tnmsc-shadow',
          skill: {src: 'src/skills', dist: 'dist/skills'},
          fastCommand: {src: 'src/commands', dist: 'dist/commands'},
          subAgent: {src: 'src/agents', dist: 'dist/agents'},
          rule: {src: 'src/rules', dist: 'dist/rules'},
          globalMemory: {src: 'app/global.cn.mdx', dist: 'dist/global.mdx'},
          workspaceMemory: {src: 'app/workspace.cn.mdx', dist: 'dist/app/workspace.mdx'},
          project: {src: 'app', dist: 'dist/app'}
        }
      },
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
      } as any,
      fs,
      path,
      dependencyContext: {
        workspace: {
          directory: {pathKind: 0, path: mockWorkspaceDir, basePath: mockWorkspaceDir},
          projects: [
            {
              name: 'project1',
              dirFromWorkspacePath: {
                pathKind: 0,
                path: 'project1',
                basePath: mockWorkspaceDir
              }
            }
          ]
        }
      }
    } as any
  }

  describe('collect', () => {
    it('should read all ignore files when they exist', () => {
      const ctx = createMockInputPluginContext()

      vi.mocked(fs.existsSync).mockImplementation((filePath: any) => {
        const fileName = path.basename(String(filePath))
        return ['.qoderignore', '.cursorignore', '.warpindexignore', '.aiignore', '.codeignore', '.traeignore'].includes(fileName)
      })

      vi.mocked(fs.statSync).mockReturnValue({
        isFile: () => true,
        isDirectory: () => false
      } as any)

      vi.mocked(fs.readFileSync).mockImplementation((filePath: any) => {
        const fileName = path.basename(String(filePath))
        if (fileName === '.qoderignore') return 'qoder ignore content'
        if (fileName === '.cursorignore') return 'cursor ignore content'
        if (fileName === '.warpindexignore') return 'warp ignore content'
        if (fileName === '.aiignore') return 'ai ignore content'
        if (fileName === '.codeignore') return 'windsurf code ignore content'
        if (fileName === '.traeignore') return 'trae ignore content'
        return ''
      })

      const result = plugin.collect(ctx)

      expect(result.aiAgentIgnoreConfigFiles).toBeDefined()
      expect(result.aiAgentIgnoreConfigFiles).toHaveLength(6)
      expect(result.aiAgentIgnoreConfigFiles).toContainEqual({
        fileName: '.qoderignore',
        content: 'qoder ignore content'
      })
      expect(result.aiAgentIgnoreConfigFiles).toContainEqual({
        fileName: '.cursorignore',
        content: 'cursor ignore content'
      })
      expect(result.aiAgentIgnoreConfigFiles).toContainEqual({
        fileName: '.warpindexignore',
        content: 'warp ignore content'
      })
      expect(result.aiAgentIgnoreConfigFiles).toContainEqual({
        fileName: '.aiignore',
        content: 'ai ignore content'
      })
      expect(result.aiAgentIgnoreConfigFiles).toContainEqual({
        fileName: '.codeignore',
        content: 'windsurf code ignore content'
      })
      expect(result.aiAgentIgnoreConfigFiles).toContainEqual({
        fileName: '.traeignore',
        content: 'trae ignore content'
      })
    })

    it('should read only existing ignore files', () => {
      const ctx = createMockInputPluginContext()

      vi.mocked(fs.existsSync).mockImplementation((filePath: any) => {
        const fileName = path.basename(String(filePath))
        return fileName === '.cursorignore'
      })

      vi.mocked(fs.statSync).mockReturnValue({
        isFile: () => true,
        isDirectory: () => false
      } as any)

      vi.mocked(fs.readFileSync).mockReturnValue('cursor ignore content')

      const result = plugin.collect(ctx)

      expect(result.aiAgentIgnoreConfigFiles).toHaveLength(1)
      expect(result.aiAgentIgnoreConfigFiles?.[0]).toEqual({
        fileName: '.cursorignore',
        content: 'cursor ignore content'
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

      vi.mocked(fs.statSync).mockImplementation((filePath: any) => {
        const fileName = path.basename(String(filePath))
        return {
          isFile: () => fileName !== '.qoderignore',
          isDirectory: () => fileName === '.qoderignore'
        } as any
      })

      vi.mocked(fs.readFileSync).mockReturnValue('content')

      const result = plugin.collect(ctx)

      expect(result.aiAgentIgnoreConfigFiles).toHaveLength(6)
      expect(result.aiAgentIgnoreConfigFiles?.map(f => f.fileName)).toEqual([
        '.cursorignore',
        '.kiroignore',
        '.warpindexignore',
        '.aiignore',
        '.codeignore',
        '.traeignore'
      ])
    })

    it('should handle read errors gracefully', () => {
      const ctx = createMockInputPluginContext()

      vi.mocked(fs.existsSync).mockReturnValue(true)

      vi.mocked(fs.statSync).mockReturnValue({
        isFile: () => true,
        isDirectory: () => false
      } as any)

      vi.mocked(fs.readFileSync).mockImplementation((filePath: any) => {
        const fileName = path.basename(String(filePath))
        if (fileName === '.cursorignore') throw new Error('Permission denied')
        return 'content'
      })

      const result = plugin.collect(ctx)

      expect(result.aiAgentIgnoreConfigFiles).toHaveLength(6)
      expect(result.aiAgentIgnoreConfigFiles?.map(f => f.fileName)).toEqual([
        '.qoderignore',
        '.kiroignore',
        '.warpindexignore',
        '.aiignore',
        '.codeignore',
        '.traeignore'
      ])
      expect(ctx.logger.warn).toHaveBeenCalled()
    })

    it('should log debug message when reading ignore files', () => {
      const ctx = createMockInputPluginContext()

      vi.mocked(fs.existsSync).mockReturnValue(true)

      vi.mocked(fs.statSync).mockReturnValue({
        isFile: () => true,
        isDirectory: () => false
      } as any)

      vi.mocked(fs.readFileSync).mockReturnValue('content')

      plugin.collect(ctx)

      expect(ctx.logger.debug).toHaveBeenCalledTimes(7)
    })

    it('should support custom shadow project dir via name', () => {
      const ctx = createMockInputPluginContext()

      vi.mocked(fs.existsSync).mockReturnValue(true)

      vi.mocked(fs.statSync).mockReturnValue({
        isFile: () => true,
        isDirectory: () => false
      } as any)

      vi.mocked(fs.readFileSync).mockReturnValue('content')

      plugin.collect(ctx)

      const shadowProjectDir = path.join(mockWorkspaceDir, 'tnmsc-shadow')
      const normalizedCustomDir = path.normalize(shadowProjectDir)
      const existsCallPaths = vi.mocked(fs.existsSync).mock.calls.map(call => path.normalize(call[0] as string))
      expect(existsCallPaths.some(p => p.startsWith(normalizedCustomDir))).toBe(true)
    })

    it('should read .codeignore file for Windsurf support', () => {
      const ctx = createMockInputPluginContext()

      vi.mocked(fs.existsSync).mockImplementation((filePath: any) => {
        const fileName = path.basename(String(filePath))
        return fileName === '.codeignore'
      })

      vi.mocked(fs.statSync).mockReturnValue({
        isFile: () => true,
        isDirectory: () => false
      } as any)

      vi.mocked(fs.readFileSync).mockReturnValue('windsurf specific ignore patterns')

      const result = plugin.collect(ctx)

      expect(result.aiAgentIgnoreConfigFiles).toHaveLength(1)
      expect(result.aiAgentIgnoreConfigFiles?.[0]).toEqual({
        fileName: '.codeignore',
        content: 'windsurf specific ignore patterns'
      })
    })

    it('should read ignore files with multiline content', () => {
      const ctx = createMockInputPluginContext()

      vi.mocked(fs.existsSync).mockReturnValue(true)

      vi.mocked(fs.statSync).mockReturnValue({
        isFile: () => true,
        isDirectory: () => false
      } as any)

      const multilineContent = `# Ignore patterns
*.log
node_modules/
.env
dist/`

      vi.mocked(fs.readFileSync).mockReturnValue(multilineContent)

      const result = plugin.collect(ctx)

      expect(result.aiAgentIgnoreConfigFiles?.[0]?.content).toBe(multilineContent)
    })
  })
})
