/**
 * Unit tests for the mdxToMd function.
 *
 * Tests the main MDX to Markdown conversion functionality
 * as specified in Requirements 1, 4, 5, and 6.
 */

import type {UndefinedNamespaceError} from '@/errors'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import {registerBuiltInComponents} from '@/components'
import {clearComponents} from './component-registry'
import {mdxToMd} from './mdx-to-md'

describe('mdxToMd', () => {
  beforeEach(() => { // Re-register built-in components before each test
    registerBuiltInComponents()
  })

  afterEach(() => { // Clean up after each test
    clearComponents()
  })

  describe('basic markdown passthrough', () => {
    it('should pass through plain markdown unchanged', async () => {
      const input = '# Hello World'
      const result = await mdxToMd(input)
      expect(result).toBe('# Hello World')
    })

    it('should handle multiple paragraphs', async () => {
      const input = `First paragraph

Second paragraph`
      const result = await mdxToMd(input)
      expect(result).toContain('First paragraph')
      expect(result).toContain('Second paragraph')
    })

    it('should preserve markdown formatting', async () => {
      const input = '**bold** and *italic*'
      const result = await mdxToMd(input)
      expect(result).toContain('**bold**')
      expect(result).toContain('*italic*')
    })
  })

  describe('import statement handling (Requirement 1)', () => {
    it('should skip import statements', async () => {
      const input = `import { Component } from './component'

# Hello World`
      const result = await mdxToMd(input)
      expect(result).not.toContain('import')
      expect(result).toContain('# Hello World')
    })

    it('should skip multiple import statements', async () => {
      const input = `import { A } from './a'
import { B } from './b'
import C from './c'

# Content`
      const result = await mdxToMd(input)
      expect(result).not.toContain('import')
      expect(result).toContain('# Content')
    })

    it('should produce clean output without import artifacts', async () => {
      const input = `import Something from 'somewhere'

# Title

Some content here.`
      const result = await mdxToMd(input)
      expect(result).not.toMatch(/import/i) // Should not have any import-related text
      expect(result).not.toMatch(/from/i)
      expect(result).toContain('# Title') // Should have the actual content
      expect(result).toContain('Some content here.')
    })
  })

  describe('expression evaluation (Requirement 6)', () => {
    it('should evaluate simple variable expressions', async () => {
      const input = 'Hello {name}!'
      const result = await mdxToMd(input, {scope: {name: 'World'}})
      expect(result).toContain('Hello World!')
    })

    it('should evaluate expressions in headings', async () => {
      const input = '# {title}'
      const result = await mdxToMd(input, {scope: {title: 'My Title'}})
      expect(result).toContain('# My Title')
    })

    it('should evaluate complex expressions', async () => {
      const input = 'Result: {a + b}'
      const result = await mdxToMd(input, {scope: {a: 1, b: 2}})
      expect(result).toContain('Result: 3')
    })

    it('should evaluate property access expressions', async () => {
      const input = 'Name: {user.name}'
      const result = await mdxToMd(input, {scope: {user: {name: 'John'}}})
      expect(result).toContain('Name: John')
    })

    it('reports exact location for text expression failures', async () => {
      const input = `# Title

never leave placeholders or "{TODO}" markers`

      await expect(mdxToMd(input, {filePath: '/tmp/example.mdx'})).rejects.toMatchObject({
        filePath: '/tmp/example.mdx',
        line: 3,
        column: 30
      })

      try {
        await mdxToMd(input, {filePath: '/tmp/example.mdx'})
      }
      catch (error) {
        const diagnosticError = error as UndefinedNamespaceError
        expect(diagnosticError.snippet).toBe('{TODO}')
        expect(diagnosticError.sourceLine).toBe('never leave placeholders or "{TODO}" markers')
        expect(diagnosticError.codeFrame).toContain('3 | never leave placeholders or "{TODO}" markers')
      }
    })
  })

  describe('global scope (Requirement 4)', () => {
    it('should have access to globalScope.profile', async () => {
      const input = 'Name: {profile.name}'
      const result = await mdxToMd(input, {
        globalScope: {
          profile: {name: 'TestUser'},
          tool: {},
          env: {},
          os: {}
        }
      })
      expect(result).toContain('Name: TestUser')
    })

    it('should have access to globalScope.tool', async () => {
      const input = 'Search: {tool.websearch}'
      const result = await mdxToMd(input, {
        globalScope: {
          profile: {},
          tool: {websearch: 'websearch'},
          env: {},
          os: {}
        }
      })
      expect(result).toContain('Search: websearch')
    })

    it('should allow user scope to override globalScope', async () => {
      const input = 'Name: {profile.name}'
      const result = await mdxToMd(input, {
        globalScope: {
          profile: {name: 'GlobalName'},
          tool: {},
          env: {},
          os: {}
        },
        scope: {profile: {name: 'OverriddenName'}}
      })
      expect(result).toContain('Name: OverriddenName')
    })
  })

  describe('built-in Md component (Requirement 3)', () => {
    it('should process Md component and pass through content', async () => {
      const input = `<Md>
# Hello World
</Md>`
      const result = await mdxToMd(input)
      expect(result).toContain('# Hello World')
    })

    it('should handle Md component with when condition true', async () => {
      const input = `<Md when={show}>
# Conditional Content
</Md>`
      const result = await mdxToMd(input, {scope: {show: true}})
      expect(result).toContain('# Conditional Content')
    })

    it('should handle Md component with when condition false', async () => {
      const input = `<Md when={show}>
# Conditional Content
</Md>`
      const result = await mdxToMd(input, {scope: {show: false}})
      expect(result).not.toContain('# Conditional Content')
    })

    it('should handle empty Md component', async () => {
      const input = '<Md></Md>'
      const result = await mdxToMd(input)
      expect(result).toBe('')
    })

    it('reports exact location for JSX attribute expression failures', async () => {
      const input = `<Md when={missingFlag}>
# Conditional Content
</Md>`

      try {
        await mdxToMd(input, {filePath: '/tmp/md-component.mdx'})
      }
      catch (error) {
        const diagnosticError = error as UndefinedNamespaceError
        expect(diagnosticError.filePath).toBe('/tmp/md-component.mdx')
        expect(diagnosticError.line).toBe(1)
        expect(diagnosticError.column).toBeGreaterThan(0)
        expect(diagnosticError.message).toContain('node: mdxJsxAttributeValueExpression')
      }
    })
  })

  describe('unknown JSX handling (Requirement 2.3, 2.4)', () => {
    it('should skip unknown JSX elements gracefully', async () => {
      const input = `<UnknownComponent>
Content inside
</UnknownComponent>

# After unknown`
      const result = await mdxToMd(input)
      expect(result).toContain('# After unknown') // Should not throw, should skip the unknown component
    })

    it('should handle HTML-like elements', async () => {
      const input = '<div>Some content</div>'
      const result = await mdxToMd(input)
      expect(typeof result).toBe('string') // Should either convert or skip gracefully
    })
  })

  describe('processing context (Requirement 5)', () => {
    it('should support basePath option', async () => {
      const input = '# Test'
      const result = await mdxToMd(input, {basePath: '/some/path'}) // basePath is passed through to context
      expect(result).toContain('# Test')
    })
  })

  describe('link text simplification', () => {
    it('should simplify file path link text to basename', async () => {
      const input = '[a/b/c.md](./a/b/c.md)'
      const result = await mdxToMd(input)
      expect(result).toContain('[c.md]')
      expect(result).toContain('(./a/b/c.md)')
    })

    it('should simplify deep nested path', async () => {
      const input = '[src/components/Button.tsx](./src/components/Button.tsx)'
      const result = await mdxToMd(input)
      expect(result).toContain('[Button.tsx]')
    })

    it('should not simplify non-path link text', async () => {
      const input = '[Click here](./file.md)'
      const result = await mdxToMd(input)
      expect(result).toContain('[Click here]')
    })

    it('should not simplify text without extension', async () => {
      const input = '[a/b/c](./path)'
      const result = await mdxToMd(input)
      expect(result).toContain('[a/b/c]')
    })

    it('should handle multiple links with path text', async () => {
      const input = '[docs/api.md](./docs/api.md) and [src/index.ts](./src/index.ts)'
      const result = await mdxToMd(input)
      expect(result).toContain('[api.md]')
      expect(result).toContain('[index.ts]')
    })

    it('should preserve URL in link while simplifying text', async () => {
      const input = '[path/to/file.js](https://example.com/path/to/file.js)'
      const result = await mdxToMd(input)
      expect(result).toContain('[file.js]')
      expect(result).toContain('(https://example.com/path/to/file.js)')
    })
  })

  describe('yAML frontmatter preservation', () => {
    it('should preserve YAML frontmatter in output when extractMetadata is false', async () => {
      const input = `---
title: Test Document
tags:
  - a
  - b
---

# Hello World`
      const result = await mdxToMd(input)
      expect(result).toContain('---')
      expect(result).toContain('title: Test Document')
      expect(result).toContain('# Hello World')
    })

    it('should not convert frontmatter delimiters to thematic breaks', async () => {
      const input = `---
name: test
description: A test description
---

# Content`
      const result = await mdxToMd(input)
      expect(result).not.toContain('***')
      expect(result).toContain('---') // Should contain proper frontmatter
      expect(result).toContain('name: test')
    })

    it('should handle frontmatter with complex values', async () => {
      const input = `---
argument-hint: "locale [en_US or zh_CN]"
allowed-tools: Read, Write, Edit
description: Test description
---

# Title`
      const result = await mdxToMd(input)
      expect(result).toContain('argument-hint:')
      expect(result).toContain('allowed-tools:')
      expect(result).toContain('# Title')
    })

    it('should remove frontmatter from content when extractMetadata is true', async () => {
      const input = `---
name: test-skill
description: A test skill
---

# Content`
      const result = await mdxToMd(input, {extractMetadata: true})
      expect(result.content).not.toContain('---') // Content should NOT contain frontmatter
      expect(result.content).not.toContain('name: test-skill')
      expect(result.content).toContain('# Content')
      expect(result.metadata.fields).toEqual({ // Metadata should contain frontmatter fields
        name: 'test-skill',
        description: 'A test skill'
      })
      expect(result.metadata.source).toBe('yaml')
    })

    it('should merge YAML and export when extractMetadata is true', async () => {
      const input = `---
name: yaml-name
yamlField: yaml-value
---

export const name = "export-name"
export const exportField = "export-value"

# Content`
      const result = await mdxToMd(input, {extractMetadata: true})
      expect(result.content).not.toContain('---') // Content should be clean
      expect(result.content).not.toContain('export const')
      expect(result.content).toContain('# Content')
      expect(result.metadata.fields).toEqual({ // Metadata should be merged (export takes priority)
        name: 'export-name', // export wins over yaml for 'name'
        yamlField: 'yaml-value',
        exportField: 'export-value'
      })
      expect(result.metadata.source).toBe('mixed')
    })
  })
})
