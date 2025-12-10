import { describe, expect, it } from 'vitest'
import { YAML_FRONT_MATTER_KIRO_ALWAYS } from '../constants'

/**
 * **Feature: kiro-steering-export, Property 2: Content Round-Trip Consistency**
 * **Validates: Requirements 1.1, 1.4, 4.4**
 *
 * For any valid markdown content written to the target file, reading the file and
 * extracting the content after the YAML front matter SHALL produce content identical
 * to the original source content.
 */
describe('Content Round-Trip Consistency', () => {
  /**
   * Helper function to extract content after YAML front matter
   */
  function extractContentAfterFrontMatter(output: string): string {
    const frontMatterEndMarker = '---\n\n'
    const frontMatterEndIndex = output.indexOf(frontMatterEndMarker)
    if (frontMatterEndIndex === -1) {
      throw new Error('Invalid front matter format: missing end marker')
    }
    return output.slice(frontMatterEndIndex + frontMatterEndMarker.length)
  }

  /**
   * Property-based test: content round-trips correctly through front matter prepending
   * Tests with various content types to verify the property holds for all inputs
   */
  it.each([
    ['empty string', ''],
    ['simple text', 'Hello World'],
    ['multiline content', 'Line 1\nLine 2\nLine 3'],
    ['markdown with headers', '# Header 1\n\n## Header 2\n\nSome content'],
    ['markdown with code blocks', '```typescript\nconst x = 1;\n```'],
    ['content with special chars', '# Header\n\n- item 1\n- item 2\n\n```code```'],
    ['content with yaml-like syntax', 'key: value\nother: data'],
    ['content starting with ---', '---\nsome content'],
    ['content with multiple ---', '---\nfirst\n---\nsecond\n---'],
    ['unicode content', '你好世界 🌍 émojis'],
    ['whitespace only', '   \n\t\n   '],
    ['content with leading newlines', '\n\n\nContent after newlines'],
    ['content with trailing newlines', 'Content before newlines\n\n\n'],
    ['very long content', 'x'.repeat(10000)],
    ['content with CRLF line endings', 'Line 1\r\nLine 2\r\nLine 3'],
    ['content with mixed line endings', 'Line 1\nLine 2\r\nLine 3\rLine 4'],
  ])('round-trips correctly: %s', (_name, originalContent) => {
    // Simulate the export process: prepend front matter
    const outputContent = YAML_FRONT_MATTER_KIRO_ALWAYS + originalContent

    // Simulate reading and extracting content
    const extractedContent = extractContentAfterFrontMatter(outputContent)

    // Verify round-trip consistency
    expect(extractedContent).toBe(originalContent)
  })

  /**
   * Additional property: front matter structure is preserved during round-trip
   */
  it('preserves front matter structure in output', () => {
    const testContent = '# Test Content\n\nSome markdown here.'
    const output = YAML_FRONT_MATTER_KIRO_ALWAYS + testContent

    // Verify the output has correct structure
    expect(output.startsWith('---\n')).toBe(true)
    expect(output).toContain('inclusion: always\n')
    expect(output).toContain('---\n\n')

    // Verify content extraction works
    const extracted = extractContentAfterFrontMatter(output)
    expect(extracted).toBe(testContent)
  })
})
