/**
 * Backward compatibility tests for MDX metadata extraction.
 *
 * Tests that the compiler correctly handles:
 * - YAML-only files (Requirement 10.1)
 * - Export-only files (Requirement 10.2)
 * - Mixed format files (Requirement 10.3)
 *
 * @see Requirements 10.1, 10.2, 10.3
 */

import type { MdxjsEsm } from './types'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { registerBuiltInComponents } from '../components'
import { clearComponents } from './component-registry'
import { parseExports } from './export-parser'
import { mdxToMd } from './mdx-to-md'
import { parseMdx } from './parser'

describe('backward compatibility', () => {
  beforeEach(() => {
    registerBuiltInComponents()
  })

  afterEach(() => {
    clearComponents()
  })

  describe('yAML-only files (Requirement 10.1)', () => {
    it('should parse YAML-only MDX file and return yaml source', async () => {
      const content = `---
name: test-skill
description: A test skill
keywords:
  - test
  - example
---

# Test Skill

This is a test skill content.`

      const result = await mdxToMd(content, { extractMetadata: true })

      expect(result.content).toContain('# Test Skill')
      expect(result.content).toContain('This is a test skill content.')
      // YAML-only files should have source 'yaml'
      expect(result.metadata.source).toBe('yaml')
      // Fields should be empty since we don't parse YAML in export-parser
      // YAML is handled separately by parseMarkdown
      expect(result.metadata.fields).toEqual({})
    })

    it('should handle YAML-only file with complex front matter', async () => {
      const content = `---
name: complex-skill
description: A complex skill
enabled: true
priority: 10
config:
  debug: true
  timeout: 5000
tags:
  - typescript
  - testing
---

# Complex Skill Content`

      const result = await mdxToMd(content, { extractMetadata: true })

      expect(result.content).toContain('# Complex Skill Content')
      expect(result.metadata.source).toBe('yaml')
    })

    it('should handle YAML-only file with empty content', async () => {
      const content = `---
name: empty-content
description: Skill with empty content
---`

      const result = await mdxToMd(content, { extractMetadata: true })

      // Note: mdxToMd doesn't strip YAML front matter from content
      // YAML parsing is handled at the plugin level via parseMarkdown
      // The compiler sees YAML as regular content (remark-frontmatter not used in mdxToMd)
      expect(result.metadata.source).toBe('yaml')
    })
  })

  describe('export-only files (Requirement 10.2)', () => {
    it('should parse export-only MDX file and return export source', async () => {
      const content = `export const name = "test-skill"
export const description = "A test skill"
export const keywords = ["test", "example"]

# Test Skill

This is a test skill content.`

      const result = await mdxToMd(content, { extractMetadata: true })

      expect(result.content).toContain('# Test Skill')
      expect(result.content).toContain('This is a test skill content.')
      // Export-only files should have source 'export'
      expect(result.metadata.source).toBe('export')
      expect(result.metadata.fields).toEqual({
        name: 'test-skill',
        description: 'A test skill',
        keywords: ['test', 'example'],
      })
    })

    it('should handle export-only file with metadata object', async () => {
      const content = `export const metadata = {
  name: "metadata-skill",
  description: "Skill using metadata object",
  enabled: true
}

# Metadata Skill Content`

      const result = await mdxToMd(content, { extractMetadata: true })

      expect(result.content).toContain('# Metadata Skill Content')
      expect(result.metadata.source).toBe('export')
      // metadata object should be spread into fields
      expect(result.metadata.fields).toEqual({
        name: 'metadata-skill',
        description: 'Skill using metadata object',
        enabled: true,
      })
    })

    it('should handle export-only file with various literal types', async () => {
      const content = `export const name = "type-test"
export const count = 42
export const enabled = true
export const disabled = false
export const nothing = null
export const tags = ["a", "b", "c"]
export const config = { key: "value", nested: { deep: true } }

# Type Test Content`

      const result = await mdxToMd(content, { extractMetadata: true })

      expect(result.metadata.source).toBe('export')
      expect(result.metadata.fields).toEqual({
        name: 'type-test',
        count: 42,
        enabled: true,
        disabled: false,
        nothing: null,
        tags: ['a', 'b', 'c'],
        config: { key: 'value', nested: { deep: true } },
      })
    })

    it('should remove export statements from output', async () => {
      const content = `export const name = "test"
export const description = "desc"

# Content

Some text here.`

      const result = await mdxToMd(content, { extractMetadata: true })

      // Export statements should not appear in output
      expect(result.content).not.toContain('export const')
      expect(result.content).not.toContain('export const name')
      expect(result.content).toContain('# Content')
      expect(result.content).toContain('Some text here.')
    })
  })

  describe('mixed format files (Requirement 10.3)', () => {
    it('should handle mixed YAML and export with export taking priority', async () => {
      const content = `---
name: yaml-name
description: yaml-description
yamlOnly: true
---

export const name = "export-name"
export const exportOnly = true

# Mixed Content`

      const result = await mdxToMd(content, { extractMetadata: true })

      expect(result.content).toContain('# Mixed Content')
      // Note: mdxToMd alone doesn't parse YAML, so it only sees exports
      // The 'mixed' source detection happens when parseExports is called
      // with yamlFrontMatter option (done at plugin level)
      expect(result.metadata.source).toBe('export')
      // Export fields should be present
      expect(result.metadata.fields).toEqual({
        name: 'export-name',
        exportOnly: true,
      })
    })

    it('should detect mixed source when yamlFrontMatter is provided to parseExports', () => {
      // This tests the actual mixed detection at the parseExports level
      const mdxContent = `export const name = "export-name"
export const exportOnly = true`

      const ast = parseMdx(mdxContent)
      const esmNodes = ast.children.filter((n): n is MdxjsEsm => n.type === 'mdxjsEsm')

      const result = parseExports(esmNodes, {
        yamlFrontMatter: {
          name: 'yaml-name',
          description: 'yaml-description',
          yamlOnly: true,
        },
      })

      // Should detect mixed source
      expect(result.source).toBe('mixed')
      // Export takes priority for 'name'
      expect(result.fields['name']).toBe('export-name')
      // YAML-only fields preserved
      expect(result.fields['description']).toBe('yaml-description')
      expect(result.fields['yamlOnly']).toBe(true)
      // Export-only fields present
      expect(result.fields['exportOnly']).toBe(true)
    })
  })

  describe('parseExports with yamlFrontMatter option', () => {
    it('should merge YAML front matter with export fields', () => {
      const mdxContent = `export const name = "export-name"
export const exportField = "export-value"`

      const ast = parseMdx(mdxContent)
      const esmNodes = ast.children.filter((n): n is MdxjsEsm => n.type === 'mdxjsEsm')

      const result = parseExports(esmNodes, {
        yamlFrontMatter: {
          name: 'yaml-name',
          yamlField: 'yaml-value',
        },
      })

      // Export takes priority over YAML for same key
      expect(result.fields['name']).toBe('export-name')
      // YAML-only fields should be preserved
      expect(result.fields['yamlField']).toBe('yaml-value')
      // Export-only fields should be present
      expect(result.fields['exportField']).toBe('export-value')
      // Source should be 'mixed'
      expect(result.source).toBe('mixed')
    })

    it('should return yaml source when only YAML front matter exists', () => {
      const result = parseExports([], {
        yamlFrontMatter: {
          name: 'yaml-name',
          description: 'yaml-description',
        },
      })

      expect(result.fields).toEqual({
        name: 'yaml-name',
        description: 'yaml-description',
      })
      expect(result.source).toBe('yaml')
    })

    it('should return export source when only exports exist', () => {
      const mdxContent = `export const name = "export-name"`

      const ast = parseMdx(mdxContent)
      const esmNodes = ast.children.filter((n): n is MdxjsEsm => n.type === 'mdxjsEsm')

      const result = parseExports(esmNodes)

      expect(result.fields).toEqual({ name: 'export-name' })
      expect(result.source).toBe('export')
    })

    it('should return yaml source when no exports and no YAML', () => {
      const result = parseExports([])

      expect(result.fields).toEqual({})
      expect(result.source).toBe('yaml')
    })
  })

  describe('edge cases', () => {
    it('should handle file with only whitespace content', async () => {
      const content = `export const name = "whitespace-test"

   

`

      const result = await mdxToMd(content, { extractMetadata: true })

      expect(result.metadata.source).toBe('export')
      expect(result.metadata.fields['name']).toBe('whitespace-test')
    })

    it('should handle export with single quotes', async () => {
      const content = `export const name = 'single-quoted'

# Content`

      const result = await mdxToMd(content, { extractMetadata: true })

      expect(result.metadata.fields['name']).toBe('single-quoted')
    })

    it('should handle export with template literals', async () => {
      const content = `export const name = \`template-literal\`

# Content`

      const result = await mdxToMd(content, { extractMetadata: true })

      expect(result.metadata.fields['name']).toBe('template-literal')
    })

    it('should handle multiline export objects', async () => {
      const content = `export const config = {
  name: "multiline",
  nested: {
    key: "value",
    array: [1, 2, 3]
  }
}

# Content`

      const result = await mdxToMd(content, { extractMetadata: true })

      expect(result.metadata.fields['config']).toEqual({
        name: 'multiline',
        nested: {
          key: 'value',
          array: [1, 2, 3],
        },
      })
    })
  })
})
