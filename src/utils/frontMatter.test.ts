/**
 * Unit tests for front matter generation utilities
 */

import { describe, expect, it } from 'vitest'
import { addFrontMatter, FrontMatterType, generateFrontMatter, removeBom } from './frontMatter'

describe('generateFrontMatter', () => {
  describe('KIRO_ALWAYS type', () => {
    it('should generate correct front matter', () => {
      const result = generateFrontMatter({ type: FrontMatterType.KIRO_ALWAYS })

      expect(result).toBe(`---
inclusion: always
---

`)
    })
  })

  describe('KIRO_FILE_MATCH type', () => {
    it('should generate correct front matter with pattern', () => {
      const result = generateFrontMatter({
        type: FrontMatterType.KIRO_FILE_MATCH,
        pattern: 'src/**',
      })

      expect(result).toContain('inclusion: fileMatch')
      expect(result).toContain('fileMatchPattern:')
      expect(result).toContain('src/**')
    })

    it('should throw error when pattern is missing', () => {
      expect(() => {
        generateFrontMatter({ type: FrontMatterType.KIRO_FILE_MATCH })
      }).toThrow('Pattern is required for KIRO_FILE_MATCH type')
    })
  })

  describe('QODER_ALWAYS type', () => {
    it('should generate correct front matter', () => {
      const result = generateFrontMatter({ type: FrontMatterType.QODER_ALWAYS })

      expect(result).toBe(`---
trigger: always_on
alwaysApply: true
---

`)
    })
  })

  describe('QODER_GLOB type', () => {
    it('should generate correct front matter with pattern', () => {
      const result = generateFrontMatter({
        type: FrontMatterType.QODER_GLOB,
        pattern: 'src/api/**',
      })

      expect(result).toBe(`---
trigger: glob
glob: src/api/**
---

`)
    })

    it('should throw error when pattern is missing', () => {
      expect(() => {
        generateFrontMatter({ type: FrontMatterType.QODER_GLOB })
      }).toThrow('Pattern is required for QODER_GLOB type')
    })
  })
})

describe('removeBom', () => {
  it('should remove BOM from start of content', () => {
    const content = '\uFEFFHello World'
    const result = removeBom(content)

    expect(result).toBe('Hello World')
  })

  it('should not modify content without BOM', () => {
    const content = 'Hello World'
    const result = removeBom(content)

    expect(result).toBe('Hello World')
  })

  it('should handle empty string', () => {
    const result = removeBom('')

    expect(result).toBe('')
  })

  it('should only remove BOM from the start', () => {
    const content = 'Hello\uFEFFWorld'
    const result = removeBom(content)

    expect(result).toBe('Hello\uFEFFWorld')
  })

  it('should handle content with only BOM', () => {
    const content = '\uFEFF'
    const result = removeBom(content)

    expect(result).toBe('')
  })
})

describe('addFrontMatter', () => {
  it('should prepend front matter to content', () => {
    const content = 'Hello World'
    const frontMatter = '---\nkey: value\n---\n\n'
    const result = addFrontMatter(content, frontMatter)

    expect(result).toBe('---\nkey: value\n---\n\nHello World')
  })

  it('should remove BOM before adding front matter', () => {
    const content = '\uFEFFHello World'
    const frontMatter = '---\nkey: value\n---\n\n'
    const result = addFrontMatter(content, frontMatter)

    expect(result).toBe('---\nkey: value\n---\n\nHello World')
    expect(result).not.toContain('\uFEFF')
  })

  it('should handle empty content', () => {
    const content = ''
    const frontMatter = '---\nkey: value\n---\n\n'
    const result = addFrontMatter(content, frontMatter)

    expect(result).toBe('---\nkey: value\n---\n\n')
  })

  it('should handle empty front matter', () => {
    const content = 'Hello World'
    const frontMatter = ''
    const result = addFrontMatter(content, frontMatter)

    expect(result).toBe('Hello World')
  })

  it('should work with generated front matter', () => {
    const content = 'Test content'
    const frontMatter = generateFrontMatter({ type: FrontMatterType.KIRO_ALWAYS })
    const result = addFrontMatter(content, frontMatter)

    expect(result).toContain('---')
    expect(result).toContain('inclusion: always')
    expect(result).toContain('Test content')
  })
})
