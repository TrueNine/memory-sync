import { describe, expect, it } from 'vitest'
import { YAML_FRONT_MATTER_KIRO_ALWAYS } from './index'

/**
 * **Feature: kiro-steering-export, Property 1: YAML Front Matter Format Correctness**
 * **Validates: Requirements 1.2, 4.1, 4.2, 4.3**
 *
 * For any valid markdown content, when the Kiro_Steering_Exporter generates output, the result SHALL:
 * - Start with `---` on its own line
 * - Contain `inclusion: always` on its own line
 * - End the front matter with `---` followed by a blank line
 * - Preserve the original content after the front matter
 */
describe('YAML Front Matter Format Correctness', () => {
  it('YAML_FRONT_MATTER_KIRO_ALWAYS has correct structure', () => {
    // Verify starts with ---
    expect(YAML_FRONT_MATTER_KIRO_ALWAYS.startsWith('---\n')).toBe(true)

    // Verify contains inclusion: always
    expect(YAML_FRONT_MATTER_KIRO_ALWAYS).toContain('inclusion: always\n')

    // Verify ends with --- followed by blank line
    expect(YAML_FRONT_MATTER_KIRO_ALWAYS).toContain('---\n\n')

    // Verify the exact format
    expect(YAML_FRONT_MATTER_KIRO_ALWAYS).toBe(`---
inclusion: always
---

`)
  })

  /**
   * Property-based test: generated output preserves original content after front matter
   * Tests with various content types to verify the property holds for all inputs
   */
  it.each([
    ['empty string', ''],
    ['simple text', 'Hello World'],
    ['multiline content', 'Line 1\nLine 2\nLine 3'],
    ['content with special chars', '# Header\n\n- item 1\n- item 2\n\n```code```'],
    ['content with yaml-like syntax', 'key: value\nother: data'],
    ['content starting with ---', '---\nsome content'],
    ['unicode content', '你好世界 🌍 émojis'],
    ['whitespace only', '   \n\t\n   '],
    ['very long content', 'x'.repeat(10000)],
  ])('preserves original content: %s', (_name, content) => {
    const output = YAML_FRONT_MATTER_KIRO_ALWAYS + content

    // Verify format requirements
    expect(output.startsWith('---\n')).toBe(true)
    expect(output).toContain('inclusion: always\n')
    expect(output).toContain('---\n\n')

    // Verify original content is preserved after front matter
    const frontMatterEndIndex = output.indexOf('---\n\n') + 5
    const extractedContent = output.slice(frontMatterEndIndex)
    expect(extractedContent).toBe(content)
  })
})
