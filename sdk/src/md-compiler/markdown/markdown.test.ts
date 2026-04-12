import {describe, expect, it} from 'vitest'
import {
  buildFrontMatter,
  buildMarkdownWithFrontMatter,
  buildMarkdownWithRawFrontMatter,
  buildRawFrontMatter,
  parseMarkdown
} from './index'

describe('markdown', () => {
  describe('parseMarkdown', () => {
    it('should parse markdown with YAML front matter', () => {
      const content = `---
title: Test
tags:
  - a
  - b
---
# Hello World`
      const result = parseMarkdown(content)
      expect(result.yamlFrontMatter).toEqual({title: 'Test', tags: ['a', 'b']})
      expect(result.rawFrontMatter).toBe('title: Test\ntags:\n  - a\n  - b')
      expect(result.contentWithoutFrontMatter).toBe('# Hello World')
    })

    it('should handle markdown without front matter', () => {
      const content = '# Hello World\n\nSome content'
      const result = parseMarkdown(content)
      expect(result.yamlFrontMatter).toBeUndefined()
      expect(result.rawFrontMatter).toBeUndefined()
      expect(result.contentWithoutFrontMatter).toBe(content)
    })
  })

  describe('buildFrontMatter', () => {
    it('should build front matter with simple values', () => {
      const result = buildFrontMatter({name: 'test', description: 'A test'})
      expect(result.startsWith('---\n')).toBe(true)
      expect(result.endsWith('\n---')).toBe(true)
      const parsed = parseMarkdown(`${result}\n`)
      expect(parsed.yamlFrontMatter).toEqual({name: 'test', description: 'A test'})
    })

    it('should build front matter with array values', () => {
      const result = buildFrontMatter({keywords: ['a', 'b', 'c']})
      expect(result).toContain('keywords:')
      expect(result).toContain('- a')
      expect(result).toContain('- b')
      expect(result).toContain('- c')
    })

    it('should filter out undefined and null values', () => {
      const result = buildFrontMatter({name: 'test', description: null, author: null})
      expect(result).toContain('name: test')
      expect(result).not.toContain('description')
      expect(result).not.toContain('author')
    })

    it('should return empty front matter for empty object', () => {
      const result = buildFrontMatter({})
      expect(result).toBe('---\n---')
    })

    it('should handle nested objects', () => {
      const result = buildFrontMatter({
        metadata: {version: '1.0', author: 'Test'}
      })
      const parsed = parseMarkdown(`${result}\n`)
      expect(parsed.yamlFrontMatter).toEqual({
        metadata: {version: '1.0', author: 'Test'}
      })
    })
  })

  describe('buildMarkdownWithFrontMatter', () => {
    it('should combine front matter with content and a blank separator by default', () => {
      const result = buildMarkdownWithFrontMatter({title: 'Test'}, '# Hello World')
      expect(result).toBe('---\ntitle: Test\n---\n\n# Hello World')
    })

    it('should support disabling the blank separator after front matter', () => {
      const result = buildMarkdownWithFrontMatter({title: 'Test'}, '# Hello World', {blankLineAfter: false})
      expect(result).toBe('---\ntitle: Test\n---\n# Hello World')
    })

    it('should return content only when front matter is null', () => {
      const result = buildMarkdownWithFrontMatter(null, '# Hello World')
      expect(result).toBe('# Hello World')
    })

    it('should return content only when front matter is undefined', () => {
      const emptyFrontMatter: Record<string, unknown> | null = null
      const result = buildMarkdownWithFrontMatter(emptyFrontMatter, '# Hello World')
      expect(result).toBe('# Hello World')
    })

    it('should return content only when front matter is empty object', () => {
      const result = buildMarkdownWithFrontMatter({}, '# Hello World')
      expect(result).toBe('# Hello World')
    })
  })

  describe('buildRawFrontMatter', () => {
    it('should build raw YAML without delimiters', () => {
      const result = buildRawFrontMatter({name: 'test', value: 42})
      expect(result).toBe('name: test\nvalue: 42')
      expect(result).not.toContain('---')
    })

    it('should return empty string for empty object', () => {
      const result = buildRawFrontMatter({})
      expect(result).toBe('')
    })

    it('should filter out null values', () => {
      const result = buildRawFrontMatter({name: 'test', empty: null})
      expect(result).toBe('name: test')
    })
  })

  describe('buildMarkdownWithRawFrontMatter', () => {
    it('should default to a blank separator after raw front matter', () => {
      const result = buildMarkdownWithRawFrontMatter('title: Test', '# Hello World')
      expect(result).toBe('---\ntitle: Test\n---\n\n# Hello World')
    })

    it('should support disabling the blank separator after raw front matter', () => {
      const result = buildMarkdownWithRawFrontMatter('title: Test', '# Hello World', {blankLineAfter: false})
      expect(result).toBe('---\ntitle: Test\n---\n# Hello World')
    })
  })

  describe('roundtrip', () => {
    it('should parse what was built', () => {
      const original = {title: 'Test', tags: ['a', 'b']}
      const markdown = buildMarkdownWithFrontMatter(original, '# Content')
      const parsed = parseMarkdown(markdown)
      expect(parsed.yamlFrontMatter).toEqual(original)
      expect(parsed.contentWithoutFrontMatter).toBe('# Content')
    })

    it('should parse markdown with a blank line after front matter without leaking a leading blank line', () => {
      const content = `---
title: Test
---

# Hello World`
      const parsed = parseMarkdown(content)
      expect(parsed.yamlFrontMatter).toEqual({title: 'Test'})
      expect(parsed.contentWithoutFrontMatter).toBe('# Hello World')
    })

    it('should still parse markdown with the legacy single-line separator', () => {
      const content = `---
title: Test
---
# Hello World`
      const parsed = parseMarkdown(content)
      expect(parsed.yamlFrontMatter).toEqual({title: 'Test'})
      expect(parsed.contentWithoutFrontMatter).toBe('# Hello World')
    })
  })
})
