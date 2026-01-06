import type { ILogger } from '@/log'
import { Buffer } from 'node:buffer'
import { describe, expect, it, vi } from 'vitest'
import { PromptKind } from '@/types'
import {
  SKILL_RESOURCE_BINARY_EXTENSIONS,
  SKILL_RESOURCE_TEXT_EXTENSIONS,
} from '@/types/InputTypes'
import { SkillInputPlugin } from './SkillInputPlugin'

describe('skillInputPlugin', () => {
  const createMockLogger = (): ILogger => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })

  describe('isBinaryResourceExtension', () => {
    const plugin = new SkillInputPlugin()

    it('should return true for binary extensions', () => {
      const binaryExtensions = ['.docx', '.pdf', '.png', '.jpg', '.zip', '.exe']
      for (const ext of binaryExtensions) {
        expect(plugin.isBinaryResourceExtension(ext)).toBe(true)
      }
    })

    it('should return false for text extensions', () => {
      const textExtensions = ['.kt', '.java', '.py', '.ts', '.txt']
      for (const ext of textExtensions) {
        expect(plugin.isBinaryResourceExtension(ext)).toBe(false)
      }
    })

    it('should be case-insensitive', () => {
      expect(plugin.isBinaryResourceExtension('.PNG')).toBe(true)
      expect(plugin.isBinaryResourceExtension('.Docx')).toBe(true)
    })
  })

  describe('getResourceCategory', () => {
    const plugin = new SkillInputPlugin()

    it('should categorize image files', () => {
      expect(plugin.getResourceCategory('.png')).toBe('image')
      expect(plugin.getResourceCategory('.jpg')).toBe('image')
      expect(plugin.getResourceCategory('.gif')).toBe('image')
      expect(plugin.getResourceCategory('.svg')).toBe('image')
      expect(plugin.getResourceCategory('.webp')).toBe('image')
    })

    it('should categorize code files', () => {
      expect(plugin.getResourceCategory('.kt')).toBe('code')
      expect(plugin.getResourceCategory('.java')).toBe('code')
      expect(plugin.getResourceCategory('.py')).toBe('code')
      expect(plugin.getResourceCategory('.ts')).toBe('code')
      expect(plugin.getResourceCategory('.go')).toBe('code')
      expect(plugin.getResourceCategory('.rs')).toBe('code')
    })

    it('should categorize data files', () => {
      expect(plugin.getResourceCategory('.sql')).toBe('data')
      expect(plugin.getResourceCategory('.json')).toBe('data')
      expect(plugin.getResourceCategory('.xml')).toBe('data')
      expect(plugin.getResourceCategory('.yaml')).toBe('data')
      expect(plugin.getResourceCategory('.csv')).toBe('data')
    })

    it('should categorize document files', () => {
      expect(plugin.getResourceCategory('.txt')).toBe('document')
      expect(plugin.getResourceCategory('.docx')).toBe('document')
      expect(plugin.getResourceCategory('.pdf')).toBe('document')
    })

    it('should categorize config files', () => {
      expect(plugin.getResourceCategory('.ini')).toBe('config')
      expect(plugin.getResourceCategory('.conf')).toBe('config')
      expect(plugin.getResourceCategory('.env')).toBe('config')
      expect(plugin.getResourceCategory('.gitignore')).toBe('config')
    })

    it('should categorize script files', () => {
      expect(plugin.getResourceCategory('.sh')).toBe('script')
      expect(plugin.getResourceCategory('.bash')).toBe('script')
      expect(plugin.getResourceCategory('.ps1')).toBe('script')
      expect(plugin.getResourceCategory('.bat')).toBe('script')
    })

    it('should categorize binary files', () => {
      expect(plugin.getResourceCategory('.exe')).toBe('binary')
      expect(plugin.getResourceCategory('.dll')).toBe('binary')
      expect(plugin.getResourceCategory('.wasm')).toBe('binary')
      expect(plugin.getResourceCategory('.zip')).toBe('binary')
    })

    it('should return other for unknown extensions', () => {
      expect(plugin.getResourceCategory('.xyz')).toBe('other')
      expect(plugin.getResourceCategory('.unknown')).toBe('other')
    })
  })

  describe('getMimeType', () => {
    const plugin = new SkillInputPlugin()

    it('should return correct MIME types for known extensions', () => {
      expect(plugin.getMimeType('.ts')).toBe('text/typescript')
      expect(plugin.getMimeType('.js')).toBe('text/javascript')
      expect(plugin.getMimeType('.json')).toBe('application/json')
      expect(plugin.getMimeType('.py')).toBe('text/x-python')
      expect(plugin.getMimeType('.pdf')).toBe('application/pdf')
      expect(plugin.getMimeType('.png')).toBe('image/png')
      expect(plugin.getMimeType('.svg')).toBe('image/svg+xml')
    })

    it('should return undefined for unknown extensions', () => {
      expect(plugin.getMimeType('.xyz')).toBeUndefined()
      expect(plugin.getMimeType('.unknown')).toBeUndefined()
    })
  })

  describe('readMcpConfig', () => {
    const plugin = new SkillInputPlugin()

    it('should return undefined when mcp.json does not exist', () => {
      const mockFs = {
        existsSync: vi.fn().mockReturnValue(false),
        statSync: vi.fn(),
        readFileSync: vi.fn(),
      } as unknown as typeof import('node:fs')

      const result = plugin.readMcpConfig('/skill/dir', mockFs, createMockLogger())
      expect(result).toBeUndefined()
    })

    it('should parse valid mcp.json', () => {
      const mcpContent = JSON.stringify({
        mcpServers: {
          'test-server': {
            command: 'uvx',
            args: ['test-package'],
            env: { TEST: 'value' },
          },
        },
      })

      const mockFs = {
        existsSync: vi.fn().mockReturnValue(true),
        statSync: vi.fn().mockReturnValue({ isFile: () => true }),
        readFileSync: vi.fn().mockReturnValue(mcpContent),
      } as unknown as typeof import('node:fs')

      const result = plugin.readMcpConfig('/skill/dir', mockFs, createMockLogger())

      expect(result).toBeDefined()
      expect(result?.type).toBe(PromptKind.SkillMcpConfig)
      expect(result?.mcpServers['test-server']).toEqual({
        command: 'uvx',
        args: ['test-package'],
        env: { TEST: 'value' },
      })
    })

    it('should return undefined for invalid JSON', () => {
      const mockFs = {
        existsSync: vi.fn().mockReturnValue(true),
        statSync: vi.fn().mockReturnValue({ isFile: () => true }),
        readFileSync: vi.fn().mockReturnValue('invalid json'),
      } as unknown as typeof import('node:fs')

      const logger = createMockLogger()
      const result = plugin.readMcpConfig('/skill/dir', mockFs, logger)

      expect(result).toBeUndefined()
      expect(logger.warn).toHaveBeenCalled()
    })

    it('should return undefined when mcpServers field is missing', () => {
      const mockFs = {
        existsSync: vi.fn().mockReturnValue(true),
        statSync: vi.fn().mockReturnValue({ isFile: () => true }),
        readFileSync: vi.fn().mockReturnValue('{}'),
      } as unknown as typeof import('node:fs')

      const logger = createMockLogger()
      const result = plugin.readMcpConfig('/skill/dir', mockFs, logger)

      expect(result).toBeUndefined()
      expect(logger.warn).toHaveBeenCalled()
    })
  })

  describe('scanSkillDirectory', () => {
    const plugin = new SkillInputPlugin()

    it('should scan child docs and resources at root level', () => {
      const mockFs = {
        readdirSync: vi.fn().mockReturnValue([
          { name: 'skill.mdx', isFile: () => true, isDirectory: () => false },
          { name: 'guide.mdx', isFile: () => true, isDirectory: () => false },
          { name: 'mcp.json', isFile: () => true, isDirectory: () => false },
          { name: 'helper.kt', isFile: () => true, isDirectory: () => false },
          { name: 'logo.png', isFile: () => true, isDirectory: () => false },
        ]),
        readFileSync: vi.fn().mockImplementation((filePath: string) => {
          if (filePath.endsWith('.mdx')) return '# Content'
          if (filePath.endsWith('.png')) return Buffer.from('binary')
          return 'code content'
        }),
      } as unknown as typeof import('node:fs')

      const result = plugin.scanSkillDirectory('/skill/dir', mockFs, createMockLogger())

      // Should have 1 child doc (guide.mdx, not skill.mdx)
      expect(result.childDocs).toHaveLength(1)
      expect(result.childDocs[0]?.relativePath).toBe('guide.mdx')
      expect(result.childDocs[0]?.type).toBe(PromptKind.SkillChildDoc)

      // Should have 2 resources (helper.kt, logo.png, not mcp.json)
      expect(result.resources).toHaveLength(2)
      expect(result.resources.map(r => r.fileName)).toContain('helper.kt')
      expect(result.resources.map(r => r.fileName)).toContain('logo.png')
    })

    it('should recursively scan subdirectories', () => {
      const mockFs = {
        readdirSync: vi.fn().mockImplementation((dir: string) => {
          if (dir === '/skill/dir') {
            return [
              { name: 'docs', isFile: () => false, isDirectory: () => true },
              { name: 'assets', isFile: () => false, isDirectory: () => true },
            ]
          }
          if (dir === '/skill/dir/docs') {
            return [
              { name: 'guide.mdx', isFile: () => true, isDirectory: () => false },
              { name: 'api.mdx', isFile: () => true, isDirectory: () => false },
            ]
          }
          if (dir === '/skill/dir/assets') {
            return [
              { name: 'logo.png', isFile: () => true, isDirectory: () => false },
              { name: 'schema.sql', isFile: () => true, isDirectory: () => false },
            ]
          }
          return []
        }),
        readFileSync: vi.fn().mockImplementation((filePath: string) => {
          if (filePath.endsWith('.mdx')) return '# Content'
          if (filePath.endsWith('.png')) return Buffer.from('binary')
          return 'content'
        }),
      } as unknown as typeof import('node:fs')

      const result = plugin.scanSkillDirectory('/skill/dir', mockFs, createMockLogger())

      // Should have 2 child docs from docs/
      expect(result.childDocs).toHaveLength(2)
      expect(result.childDocs.map(d => d.relativePath)).toContain('docs/guide.mdx')
      expect(result.childDocs.map(d => d.relativePath)).toContain('docs/api.mdx')

      // Should have 2 resources from assets/
      expect(result.resources).toHaveLength(2)
      expect(result.resources.map(r => r.relativePath)).toContain('assets/logo.png')
      expect(result.resources.map(r => r.relativePath)).toContain('assets/schema.sql')
    })

    it('should handle binary files with base64 encoding', () => {
      const mockFs = {
        readdirSync: vi.fn().mockReturnValue([
          { name: 'image.png', isFile: () => true, isDirectory: () => false },
        ]),
        readFileSync: vi.fn().mockReturnValue(Buffer.from('binary content')),
      } as unknown as typeof import('node:fs')

      const result = plugin.scanSkillDirectory('/skill/dir', mockFs, createMockLogger())

      expect(result.resources).toHaveLength(1)
      expect(result.resources[0]?.encoding).toBe('base64')
      expect(result.resources[0]?.category).toBe('image')
    })

    it('should handle text files with UTF-8 encoding', () => {
      const mockFs = {
        readdirSync: vi.fn().mockReturnValue([
          { name: 'helper.kt', isFile: () => true, isDirectory: () => false },
        ]),
        readFileSync: vi.fn().mockReturnValue('fun main() {}'),
      } as unknown as typeof import('node:fs')

      const result = plugin.scanSkillDirectory('/skill/dir', mockFs, createMockLogger())

      expect(result.resources).toHaveLength(1)
      expect(result.resources[0]?.encoding).toBe('text')
      expect(result.resources[0]?.category).toBe('code')
      expect(result.resources[0]?.content).toBe('fun main() {}')
    })
  })

  describe('sKILL_RESOURCE_TEXT_EXTENSIONS', () => {
    it('should include common code file extensions', () => {
      const codeExtensions = ['.kt', '.java', '.py', '.ts', '.js', '.go', '.rs', '.c', '.cpp']
      for (const ext of codeExtensions) {
        expect(SKILL_RESOURCE_TEXT_EXTENSIONS).toContain(ext)
      }
    })

    it('should include data file extensions', () => {
      const dataExtensions = ['.sql', '.json', '.xml', '.yaml', '.csv']
      for (const ext of dataExtensions) {
        expect(SKILL_RESOURCE_TEXT_EXTENSIONS).toContain(ext)
      }
    })
  })

  describe('sKILL_RESOURCE_BINARY_EXTENSIONS', () => {
    it('should include document file extensions', () => {
      const docExtensions = ['.docx', '.pdf', '.xlsx', '.pptx']
      for (const ext of docExtensions) {
        expect(SKILL_RESOURCE_BINARY_EXTENSIONS).toContain(ext)
      }
    })

    it('should include image file extensions', () => {
      const imageExtensions = ['.png', '.jpg', '.gif', '.webp']
      for (const ext of imageExtensions) {
        expect(SKILL_RESOURCE_BINARY_EXTENSIONS).toContain(ext)
      }
    })
  })
})
