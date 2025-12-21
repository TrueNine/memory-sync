import type { OutputWriteContext } from '@/types'
import type { RelativePath } from '@/types/FileSystemTypes'
import { describe, expect, it } from 'vitest'
import { FilePathKind, PromptKind } from '@/types'
import { AbstractOutputPlugin } from './AbstractOutputPlugin'

// Create a concrete test implementation
class TestOutputPlugin extends AbstractOutputPlugin {
  constructor() {
    super('TestOutputPlugin', {
      outputFileName: 'TEST.md',
    })
  }

  // Expose protected methods for testing
  public testExtractGlobalMemoryContent(ctx: OutputWriteContext) {
    return this.extractGlobalMemoryContent(ctx)
  }

  public testCombineGlobalWithContent(
    globalContent: string | undefined,
    projectContent: string,
    options?: any,
  ) {
    return this.combineGlobalWithContent(globalContent, projectContent, options)
  }
}

function createMockRelativePath(pathStr: string, basePath: string): RelativePath {
  return {
    pathKind: FilePathKind.Relative,
    path: pathStr,
    basePath,
    getDirectoryName: () => pathStr,
    getAbsolutePath: () => `${basePath}/${pathStr}`,
  }
}

function createMockContext(globalContent?: string): OutputWriteContext {
  const hasGlobalContent = globalContent != null && globalContent.trim().length > 0
  return {
    collectedInputContext: {
      workspace: {
        directory: createMockRelativePath('.', '/test'),
        projects: [],
      },
      ideConfigFiles: [],
      globalMemory: hasGlobalContent
        ? {
            type: PromptKind.GlobalMemory,
            content: globalContent,
            dir: createMockRelativePath('.', '/test'),
            markdownContents: [],
            length: (globalContent).length,
            filePathKind: FilePathKind.Relative,
            parentDirectoryPath: {
              type: 'UserHome',
              directory: createMockRelativePath('.memory', '/home/user'),
            },
          } as any
        : (null as any),
    } as any,
    dryRun: false,
  }
}

describe('abstractOutputPlugin', () => {
  describe('extractGlobalMemoryContent', () => {
    it('should extract global memory content when present', () => {
      const plugin = new TestOutputPlugin()
      const ctx = createMockContext('Global content here')

      const result = plugin.testExtractGlobalMemoryContent(ctx)

      expect(result).toBe('Global content here')
    })

    it('should return undefined when global memory is not present', () => {
      const plugin = new TestOutputPlugin()
      const ctx = createMockContext()

      const result = plugin.testExtractGlobalMemoryContent(ctx)

      expect(result).toBeUndefined()
    })

    it('should return undefined when global memory content is undefined', () => {
      const plugin = new TestOutputPlugin()
      const ctx = createMockContext()
      ctx.collectedInputContext.globalMemory = {
        type: PromptKind.GlobalMemory,
        dir: createMockRelativePath('.', '/test'),
        markdownContents: [],
        length: 0,
        filePathKind: FilePathKind.Relative,
        parentDirectoryPath: {
          type: 'UserHome',
          directory: createMockRelativePath('.memory', '/home/user'),
        },
      } as any

      const result = plugin.testExtractGlobalMemoryContent(ctx)

      expect(result).toBeUndefined()
    })
  })

  describe('combineGlobalWithContent', () => {
    it('should combine global and project content with default options', () => {
      const plugin = new TestOutputPlugin()
      const result = plugin.testCombineGlobalWithContent('Global', 'Project')

      expect(result).toBe('Global\n\nProject')
    })

    it('should skip empty global content by default', () => {
      const plugin = new TestOutputPlugin()
      const result = plugin.testCombineGlobalWithContent('', 'Project')

      expect(result).toBe('Project')
    })

    it('should skip whitespace-only global content by default', () => {
      const plugin = new TestOutputPlugin()
      const result = plugin.testCombineGlobalWithContent('   \n\n  ', 'Project')

      expect(result).toBe('Project')
    })

    it('should skip undefined global content by default', () => {
      const plugin = new TestOutputPlugin()
      const result = plugin.testCombineGlobalWithContent(null as any, 'Project')

      expect(result).toBe('Project')
    })

    it('should use custom separator when provided', () => {
      const plugin = new TestOutputPlugin()
      const result = plugin.testCombineGlobalWithContent('Global', 'Project', {
        separator: '\n---\n',
      })

      expect(result).toBe('Global\n---\nProject')
    })

    it('should place global content after when position is "after"', () => {
      const plugin = new TestOutputPlugin()
      const result = plugin.testCombineGlobalWithContent('Global', 'Project', {
        position: 'after',
      })

      expect(result).toBe('Project\n\nGlobal')
    })

    it('should place global content before when position is "before"', () => {
      const plugin = new TestOutputPlugin()
      const result = plugin.testCombineGlobalWithContent('Global', 'Project', {
        position: 'before',
      })

      expect(result).toBe('Global\n\nProject')
    })

    it('should not skip empty content when skipIfEmpty is false', () => {
      const plugin = new TestOutputPlugin()
      const result = plugin.testCombineGlobalWithContent('', 'Project', {
        skipIfEmpty: false,
      })

      expect(result).toBe('\n\nProject')
    })

    it('should not skip whitespace content when skipIfEmpty is false', () => {
      const plugin = new TestOutputPlugin()
      const result = plugin.testCombineGlobalWithContent('   ', 'Project', {
        skipIfEmpty: false,
      })

      expect(result).toBe('   \n\nProject')
    })

    it('should treat undefined as empty string when skipIfEmpty is false', () => {
      const plugin = new TestOutputPlugin()
      const result = plugin.testCombineGlobalWithContent(null as any, 'Project', {
        skipIfEmpty: false,
      })

      expect(result).toBe('\n\nProject')
    })

    it('should combine multiple options correctly', () => {
      const plugin = new TestOutputPlugin()
      const result = plugin.testCombineGlobalWithContent('Global', 'Project', {
        separator: '\n===\n',
        position: 'after',
        skipIfEmpty: true,
      })

      expect(result).toBe('Project\n===\nGlobal')
    })

    it('should handle multi-line content correctly', () => {
      const plugin = new TestOutputPlugin()
      const globalContent = '# Global Rules\n\nThese are global.'
      const projectContent = '# Project Rules\n\nThese are project-specific.'
      const result = plugin.testCombineGlobalWithContent(globalContent, projectContent)

      expect(result).toBe(
        '# Global Rules\n\nThese are global.\n\n# Project Rules\n\nThese are project-specific.',
      )
    })
  })
})
