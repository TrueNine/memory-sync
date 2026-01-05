/**
 * Unit tests for the mdxToMd function.
 *
 * Tests the main MDX to Markdown conversion functionality
 * as specified in Requirements 1, 4, 5, and 6.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { registerBuiltInComponents } from '../components'
import { clearComponents } from './component-registry'
import { mdxToMd } from './mdx-to-md'

describe('mdxToMd', () => {
  // Re-register built-in components before each test
  beforeEach(() => {
    registerBuiltInComponents()
  })

  // Clean up after each test
  afterEach(() => {
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
      // Should not have any import-related text
      expect(result).not.toMatch(/import/i)
      expect(result).not.toMatch(/from/i)
      // Should have the actual content
      expect(result).toContain('# Title')
      expect(result).toContain('Some content here.')
    })
  })

  describe('expression evaluation (Requirement 6)', () => {
    it('should evaluate simple variable expressions', async () => {
      const input = 'Hello {name}!'
      const result = await mdxToMd(input, { scope: { name: 'World' } })
      expect(result).toContain('Hello World!')
    })

    it('should evaluate expressions in headings', async () => {
      const input = '# {title}'
      const result = await mdxToMd(input, { scope: { title: 'My Title' } })
      expect(result).toContain('# My Title')
    })

    it('should evaluate complex expressions', async () => {
      const input = 'Result: {a + b}'
      const result = await mdxToMd(input, { scope: { a: 1, b: 2 } })
      expect(result).toContain('Result: 3')
    })

    it('should evaluate property access expressions', async () => {
      const input = 'Name: {user.name}'
      const result = await mdxToMd(input, { scope: { user: { name: 'John' } } })
      expect(result).toContain('Name: John')
    })
  })

  describe('global scope (Requirement 4)', () => {
    it('should have access to globalScope.profile', async () => {
      const input = 'Name: {profile.name}'
      const result = await mdxToMd(input, {
        globalScope: {
          profile: { name: 'TestUser' },
          tool: {},
          env: {},
          os: {},
        },
      })
      expect(result).toContain('Name: TestUser')
    })

    it('should have access to globalScope.tool', async () => {
      const input = 'Search: {tool.websearch}'
      const result = await mdxToMd(input, {
        globalScope: {
          profile: {},
          tool: { websearch: 'websearch' },
          env: {},
          os: {},
        },
      })
      expect(result).toContain('Search: websearch')
    })

    it('should allow user scope to override globalScope', async () => {
      const input = 'Name: {profile.name}'
      const result = await mdxToMd(input, {
        globalScope: {
          profile: { name: 'GlobalName' },
          tool: {},
          env: {},
          os: {},
        },
        scope: { profile: { name: 'OverriddenName' } },
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

    it('should handle Md component with if condition true', async () => {
      const input = `<Md if={show}>
# Conditional Content
</Md>`
      const result = await mdxToMd(input, { scope: { show: true } })
      expect(result).toContain('# Conditional Content')
    })

    it('should handle Md component with if condition false', async () => {
      const input = `<Md if={show}>
# Conditional Content
</Md>`
      const result = await mdxToMd(input, { scope: { show: false } })
      expect(result).not.toContain('# Conditional Content')
    })

    it('should handle empty Md component', async () => {
      const input = '<Md></Md>'
      const result = await mdxToMd(input)
      expect(result).toBe('')
    })
  })

  describe('unknown JSX handling (Requirement 2.3, 2.4)', () => {
    it('should skip unknown JSX elements gracefully', async () => {
      const input = `<UnknownComponent>
Content inside
</UnknownComponent>

# After unknown`
      const result = await mdxToMd(input)
      // Should not throw, should skip the unknown component
      expect(result).toContain('# After unknown')
    })

    it('should handle HTML-like elements', async () => {
      const input = '<div>Some content</div>'
      const result = await mdxToMd(input)
      // Should either convert or skip gracefully
      expect(typeof result).toBe('string')
    })
  })

  describe('processing context (Requirement 5)', () => {
    it('should support basePath option', async () => {
      const input = '# Test'
      // basePath is passed through to context
      const result = await mdxToMd(input, { basePath: '/some/path' })
      expect(result).toContain('# Test')
    })
  })
})
