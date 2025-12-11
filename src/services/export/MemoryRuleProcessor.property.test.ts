/**
 * Property-based tests for MemoryRuleProcessor
 * **Feature: ref-dist-memory-sync, Property 3: Content Round-Trip Consistency**
 */

import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { FrontMatterType } from '../../core/types'
import { MemoryRuleProcessor } from './MemoryRuleProcessor'

/**
 * Extract content after front matter
 * Front matter is delimited by --- at start and end, followed by an empty line
 * Format: ---\n{content}\n---\n\n{actual content}
 */
function extractContentAfterFrontMatter(content: string): string {
    const lines = content.split('\n')
    let inFrontMatter = false
    let frontMatterEndIndex = -1

    for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim() === '---') {
            if (!inFrontMatter) {
                inFrontMatter = true
            } else {
                frontMatterEndIndex = i
                break
            }
        }
    }

    if (frontMatterEndIndex === -1) {
        return content
    }

    // Skip the empty line after the closing ---
    const contentStartIndex = frontMatterEndIndex + 2
    if (contentStartIndex >= lines.length) {
        return ''
    }

    return lines.slice(contentStartIndex).join('\n')
}

describe('MemoryRuleProcessor properties', () => {
    /**
     * **Feature: ref-dist-memory-sync, Property 3: Content Round-Trip Consistency**
     * **Validates: Requirements 4.1, 4.3**
     *
     * For any AGENTS.md content processed through the memory-based sync,
     * the generated rule file content (excluding front matter) SHALL be
     * identical to the original source content
     */
    it('should preserve content after front matter processing', () => {
        const processor = new MemoryRuleProcessor()

        fc.assert(
            fc.property(
                fc.string({ minLength: 0, maxLength: 1000 }),
                fc.string({ minLength: 1, maxLength: 50 }).filter(s => !s.includes('/') && !s.includes('\\')),
                fc.array(fc.string({ minLength: 1, maxLength: 20 }).filter(s => !s.includes('/') && !s.includes('\\')), { minLength: 1, maxLength: 5 }),
                fc.constantFrom(
                    FrontMatterType.KIRO_ALWAYS,
                    FrontMatterType.KIRO_FILE_MATCH,
                    FrontMatterType.QODER_ALWAYS,
                    FrontMatterType.QODER_GLOB,
                ),
                (content, projectName, pathSegments, frontMatterType) => {
                    const relativePath = pathSegments.join('/')

                    const processed = processor.processRule({
                        content,
                        projectName,
                        relativePath,
                        frontMatterType,
                    })

                    const extractedContent = extractContentAfterFrontMatter(processed.content)

                    expect(extractedContent).toBe(content)
                },
            ),
            { numRuns: 100 },
        )
    })

    it('should preserve content with BOM', () => {
        const processor = new MemoryRuleProcessor()

        fc.assert(
            fc.property(
                fc.string({ minLength: 0, maxLength: 1000 }),
                fc.string({ minLength: 1, maxLength: 50 }).filter(s => !s.includes('/') && !s.includes('\\')),
                fc.string({ minLength: 1, maxLength: 20 }).filter(s => !s.includes('/') && !s.includes('\\')),
                (content, projectName, relativePath) => {
                    const contentWithBom = '\uFEFF' + content

                    const processed = processor.processRule({
                        content: contentWithBom,
                        projectName,
                        relativePath,
                        frontMatterType: FrontMatterType.KIRO_ALWAYS,
                    })

                    const extractedContent = extractContentAfterFrontMatter(processed.content)

                    expect(extractedContent).toBe(content)
                    expect(extractedContent).not.toContain('\uFEFF')
                },
            ),
            { numRuns: 100 },
        )
    })

    it('should preserve multiline content structure', () => {
        const processor = new MemoryRuleProcessor()

        fc.assert(
            fc.property(
                fc.array(fc.string({ minLength: 0, maxLength: 100 }), { minLength: 1, maxLength: 20 }),
                fc.string({ minLength: 1, maxLength: 50 }).filter(s => !s.includes('/') && !s.includes('\\')),
                fc.string({ minLength: 1, maxLength: 20 }).filter(s => !s.includes('/') && !s.includes('\\')),
                (lines, projectName, relativePath) => {
                    const content = lines.join('\n')

                    const processed = processor.processRule({
                        content,
                        projectName,
                        relativePath,
                        frontMatterType: FrontMatterType.QODER_ALWAYS,
                    })

                    const extractedContent = extractContentAfterFrontMatter(processed.content)

                    expect(extractedContent).toBe(content)
                    expect(extractedContent.split('\n').length).toBe(lines.length)
                },
            ),
            { numRuns: 100 },
        )
    })

    it('should preserve special characters', () => {
        const processor = new MemoryRuleProcessor()

        fc.assert(
            fc.property(
                fc.string({ minLength: 0, maxLength: 500 }),
                fc.string({ minLength: 1, maxLength: 50 }).filter(s => !s.includes('/') && !s.includes('\\')),
                fc.string({ minLength: 1, maxLength: 20 }).filter(s => !s.includes('/') && !s.includes('\\')),
                (content, projectName, relativePath) => {
                    const processed = processor.processRule({
                        content,
                        projectName,
                        relativePath,
                        frontMatterType: FrontMatterType.KIRO_ALWAYS,
                    })

                    const extractedContent = extractContentAfterFrontMatter(processed.content)

                    expect(extractedContent).toBe(content)
                },
            ),
            { numRuns: 100 },
        )
    })

    it('should preserve empty content', () => {
        const processor = new MemoryRuleProcessor()

        fc.assert(
            fc.property(
                fc.string({ minLength: 1, maxLength: 50 }).filter(s => !s.includes('/') && !s.includes('\\')),
                fc.string({ minLength: 1, maxLength: 20 }).filter(s => !s.includes('/') && !s.includes('\\')),
                fc.constantFrom(
                    FrontMatterType.KIRO_ALWAYS,
                    FrontMatterType.QODER_ALWAYS,
                ),
                (projectName, relativePath, frontMatterType) => {
                    const content = ''

                    const processed = processor.processRule({
                        content,
                        projectName,
                        relativePath,
                        frontMatterType,
                    })

                    const extractedContent = extractContentAfterFrontMatter(processed.content)

                    expect(extractedContent).toBe(content)
                },
            ),
            { numRuns: 100 },
        )
    })

    it('should preserve content with markdown formatting', () => {
        const processor = new MemoryRuleProcessor()

        fc.assert(
            fc.property(
                fc.string({ minLength: 1, maxLength: 50 }).filter(s => !s.includes('/') && !s.includes('\\')),
                fc.string({ minLength: 1, maxLength: 20 }).filter(s => !s.includes('/') && !s.includes('\\')),
                (projectName, relativePath) => {
                    const content = `# Heading

## Subheading

- List item 1
- List item 2

\`\`\`typescript
const x = 42;
\`\`\`

**Bold** and *italic* text.`

                    const processed = processor.processRule({
                        content,
                        projectName,
                        relativePath,
                        frontMatterType: FrontMatterType.KIRO_ALWAYS,
                    })

                    const extractedContent = extractContentAfterFrontMatter(processed.content)

                    expect(extractedContent).toBe(content)
                },
            ),
            { numRuns: 100 },
        )
    })
})
