import type {ILogger} from 'memory-sync-cli/src/log'
import {Buffer} from 'node:buffer'
import * as path from 'node:path'
import {describe, expect, it, vi} from 'vitest'
import {PromptKind} from 'memory-sync-cli/src/types'
import {SkillInputPlugin} from './SkillInputPlugin'

describe('skillInputPlugin', () => {
  const createMockLogger = (): ILogger => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  })

  describe('readMcpConfig', () => {
    const plugin = new SkillInputPlugin()

    it('should return undefined when mcp.json does not exist', () => {
      const mockFs = {
        existsSync: vi.fn().mockReturnValue(false),
        statSync: vi.fn(),
        readFileSync: vi.fn()
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
            env: {TEST: 'value'}
          }
        }
      })

      const mockFs = {
        existsSync: vi.fn().mockReturnValue(true),
        statSync: vi.fn().mockReturnValue({isFile: () => true}),
        readFileSync: vi.fn().mockReturnValue(mcpContent)
      } as unknown as typeof import('node:fs')

      const result = plugin.readMcpConfig('/skill/dir', mockFs, createMockLogger())

      expect(result).toBeDefined()
      expect(result?.type).toBe(PromptKind.SkillMcpConfig)
      expect(result?.mcpServers['test-server']).toEqual({
        command: 'uvx',
        args: ['test-package'],
        env: {TEST: 'value'}
      })
    })

    it('should return undefined for invalid JSON', () => {
      const mockFs = {
        existsSync: vi.fn().mockReturnValue(true),
        statSync: vi.fn().mockReturnValue({isFile: () => true}),
        readFileSync: vi.fn().mockReturnValue('invalid json')
      } as unknown as typeof import('node:fs')

      const logger = createMockLogger()
      const result = plugin.readMcpConfig('/skill/dir', mockFs, logger)

      expect(result).toBeUndefined()
      expect(logger.warn).toHaveBeenCalled()
    })

    it('should return undefined when mcpServers field is missing', () => {
      const mockFs = {
        existsSync: vi.fn().mockReturnValue(true),
        statSync: vi.fn().mockReturnValue({isFile: () => true}),
        readFileSync: vi.fn().mockReturnValue('{}')
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
          {name: 'skill.mdx', isFile: () => true, isDirectory: () => false},
          {name: 'guide.mdx', isFile: () => true, isDirectory: () => false},
          {name: 'mcp.json', isFile: () => true, isDirectory: () => false},
          {name: 'helper.kt', isFile: () => true, isDirectory: () => false},
          {name: 'logo.png', isFile: () => true, isDirectory: () => false}
        ]),
        readFileSync: vi.fn().mockImplementation((filePath: string) => {
          if (filePath.endsWith('.mdx')) return '# Content'
          if (filePath.endsWith('.png')) return Buffer.from('binary')
          return 'code content'
        })
      } as unknown as typeof import('node:fs')

      const result = plugin.scanSkillDirectory('/skill/dir', mockFs, createMockLogger())

      expect(result.childDocs).toHaveLength(1) // Should have 1 child doc (guide.mdx, not skill.mdx)
      expect(result.childDocs[0]?.relativePath).toBe('guide.mdx')
      expect(result.childDocs[0]?.type).toBe(PromptKind.SkillChildDoc)

      expect(result.resources).toHaveLength(2) // Should have 2 resources (helper.kt, logo.png, not mcp.json)
      expect(result.resources.map(r => r.fileName)).toContain('helper.kt')
      expect(result.resources.map(r => r.fileName)).toContain('logo.png')
    })

    it('should recursively scan subdirectories', () => {
      const skillDir = path.normalize('/skill/dir')
      const docsDir = path.join(skillDir, 'docs')
      const assetsDir = path.join(skillDir, 'assets')

      const mockFs = {
        readdirSync: vi.fn().mockImplementation((dir: string) => {
          const normalizedDir = path.normalize(dir)
          if (normalizedDir === skillDir) {
            return [
              {name: 'docs', isFile: () => false, isDirectory: () => true},
              {name: 'assets', isFile: () => false, isDirectory: () => true}
            ]
          }
          if (normalizedDir === docsDir) {
            return [
              {name: 'guide.mdx', isFile: () => true, isDirectory: () => false},
              {name: 'api.mdx', isFile: () => true, isDirectory: () => false}
            ]
          }
          if (normalizedDir === assetsDir) {
            return [
              {name: 'logo.png', isFile: () => true, isDirectory: () => false},
              {name: 'schema.sql', isFile: () => true, isDirectory: () => false}
            ]
          }
          return []
        }),
        readFileSync: vi.fn().mockImplementation((filePath: string) => {
          if (filePath.endsWith('.mdx')) return '# Content'
          if (filePath.endsWith('.png')) return Buffer.from('binary')
          return 'content'
        })
      } as unknown as typeof import('node:fs')

      const result = plugin.scanSkillDirectory(skillDir, mockFs, createMockLogger())

      expect(result.childDocs).toHaveLength(2) // Should have 2 child docs from docs/
      const childDocPaths = result.childDocs.map(d => d.relativePath.replaceAll('\\', '/')) // Normalize paths for cross-platform comparison
      expect(childDocPaths).toContain('docs/guide.mdx')
      expect(childDocPaths).toContain('docs/api.mdx')

      expect(result.resources).toHaveLength(2) // Should have 2 resources from assets/
      const resourcePaths = result.resources.map(r => r.relativePath.replaceAll('\\', '/'))
      expect(resourcePaths).toContain('assets/logo.png')
      expect(resourcePaths).toContain('assets/schema.sql')
    })

    it('should handle binary files with base64 encoding', () => {
      const mockFs = {
        readdirSync: vi.fn().mockReturnValue([
          {name: 'image.png', isFile: () => true, isDirectory: () => false}
        ]),
        readFileSync: vi.fn().mockReturnValue(Buffer.from('binary content'))
      } as unknown as typeof import('node:fs')

      const result = plugin.scanSkillDirectory('/skill/dir', mockFs, createMockLogger())

      expect(result.resources).toHaveLength(1)
      expect(result.resources[0]?.encoding).toBe('base64')
      expect(result.resources[0]?.category).toBe('image')
    })

    it('should handle text files with UTF-8 encoding', () => {
      const mockFs = {
        readdirSync: vi.fn().mockReturnValue([
          {name: 'helper.kt', isFile: () => true, isDirectory: () => false}
        ]),
        readFileSync: vi.fn().mockReturnValue('fun main() {}')
      } as unknown as typeof import('node:fs')

      const result = plugin.scanSkillDirectory('/skill/dir', mockFs, createMockLogger())

      expect(result.resources).toHaveLength(1)
      expect(result.resources[0]?.encoding).toBe('text')
      expect(result.resources[0]?.category).toBe('code')
      expect(result.resources[0]?.content).toBe('fun main() {}')
    })
  })

  describe('.mdx to .md URL transformation in skills', () => {
    const plugin = new SkillInputPlugin()

    it('should transform .mdx links to .md in child doc content', () => {
      const mockFs = {
        readdirSync: vi.fn().mockReturnValue([
          {name: 'guide.mdx', isFile: () => true, isDirectory: () => false}
        ]),
        readFileSync: vi.fn().mockReturnValue('See [other doc](./other.mdx) for details')
      } as unknown as typeof import('node:fs')

      const result = plugin.scanSkillDirectory('/skill/dir', mockFs, createMockLogger())

      expect(result.childDocs).toHaveLength(1)
      expect(result.childDocs[0]?.content).toContain('./other.md')
      expect(result.childDocs[0]?.content).not.toContain('.mdx')
    })

    it('should transform .mdx links with anchors', () => {
      const mockFs = {
        readdirSync: vi.fn().mockReturnValue([
          {name: 'guide.mdx', isFile: () => true, isDirectory: () => false}
        ]),
        readFileSync: vi.fn().mockReturnValue('[Section](./doc.mdx#section)')
      } as unknown as typeof import('node:fs')

      const result = plugin.scanSkillDirectory('/skill/dir', mockFs, createMockLogger())

      expect(result.childDocs[0]?.content).toContain('./doc.md#section')
    })

    it('should not transform external URLs', () => {
      const mockFs = {
        readdirSync: vi.fn().mockReturnValue([
          {name: 'guide.mdx', isFile: () => true, isDirectory: () => false}
        ]),
        readFileSync: vi.fn().mockReturnValue('[External](https://example.com/file.mdx)')
      } as unknown as typeof import('node:fs')

      const result = plugin.scanSkillDirectory('/skill/dir', mockFs, createMockLogger())

      expect(result.childDocs[0]?.content).toContain('https://example.com/file.mdx')
    })

    it('should transform multiple .mdx links in same content', () => {
      const mockFs = {
        readdirSync: vi.fn().mockReturnValue([
          {name: 'guide.mdx', isFile: () => true, isDirectory: () => false}
        ]),
        readFileSync: vi.fn().mockReturnValue('[First](./a.mdx) and [Second](./b.mdx)')
      } as unknown as typeof import('node:fs')

      const result = plugin.scanSkillDirectory('/skill/dir', mockFs, createMockLogger())

      expect(result.childDocs[0]?.content).toContain('./a.md')
      expect(result.childDocs[0]?.content).toContain('./b.md')
      expect(result.childDocs[0]?.content).not.toContain('.mdx')
    })

    it('should transform image references with .mdx extension', () => {
      const mockFs = {
        readdirSync: vi.fn().mockReturnValue([
          {name: 'guide.mdx', isFile: () => true, isDirectory: () => false}
        ]),
        readFileSync: vi.fn().mockReturnValue('![Diagram](./diagram.mdx)')
      } as unknown as typeof import('node:fs')

      const result = plugin.scanSkillDirectory('/skill/dir', mockFs, createMockLogger())

      expect(result.childDocs[0]?.content).toContain('./diagram.md')
    })

    it('should preserve non-.mdx links unchanged', () => {
      const mockFs = {
        readdirSync: vi.fn().mockReturnValue([
          {name: 'guide.mdx', isFile: () => true, isDirectory: () => false}
        ]),
        readFileSync: vi.fn().mockReturnValue('[Link](./file.md) and [Other](./doc.txt)')
      } as unknown as typeof import('node:fs')

      const result = plugin.scanSkillDirectory('/skill/dir', mockFs, createMockLogger())

      expect(result.childDocs[0]?.content).toContain('./file.md')
      expect(result.childDocs[0]?.content).toContain('./doc.txt')
    })

    it('should transform .mdx in link text when it looks like a path', () => {
      const mockFs = {
        readdirSync: vi.fn().mockReturnValue([
          {name: 'guide.mdx', isFile: () => true, isDirectory: () => false}
        ]),
        readFileSync: vi.fn().mockReturnValue('[example.mdx](./example.mdx)')
      } as unknown as typeof import('node:fs')

      const result = plugin.scanSkillDirectory('/skill/dir', mockFs, createMockLogger())

      expect(result.childDocs[0]?.content).toBe('[example.md](./example.md)')
    })

    it('should transform .mdx in link text for table markdown links', () => {
      const mockFs = {
        readdirSync: vi.fn().mockReturnValue([
          {name: 'guide.mdx', isFile: () => true, isDirectory: () => false}
        ]),
        readFileSync: vi.fn().mockReturnValue('| [examples/example_figma.mdx](examples/example_figma.mdx) |')
      } as unknown as typeof import('node:fs')

      const result = plugin.scanSkillDirectory('/skill/dir', mockFs, createMockLogger())

      expect(result.childDocs[0]?.content).toBe('| [examples/example_figma.md](examples/example_figma.md) |')
    })
  })
})
