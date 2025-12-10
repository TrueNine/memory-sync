/**
 * Property-based tests for code block transformation capability
 * **Feature: plugin-architecture, Property 14: Code block extraction round trip**
 */

import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import {
  extractCodeBlocks,
  reassembleCodeBlocks,
} from './codeBlockTransform'

/**
 * Generate a valid language identifier (alphanumeric with hyphens)
 */
const languageArb = fc.stringMatching(/^[a-z][a-z0-9-]*$/, { minLength: 1, maxLength: 15 })

/**
 * Generate code block content that doesn't contain fence markers
 * Excludes content that would break the code block structure
 */
const codeContentArb = fc.string({ minLength: 0, maxLength: 200 })
  .filter((s) => !s.includes('```') && !s.includes('~~~'))
  .map((s) => s.replace(/\r/g, ''))

/**
 * Generate a fence style (``` or ~~~)
 */
const fenceArb = fc.constantFrom('```', '~~~')

/**
 * Generate a complete code block with fence, language, and content
 */
const codeBlockArb = fc.tuple(fenceArb, languageArb, codeContentArb)
  .map(([fence, lang, content]) => `${fence}${lang}\n${content}\n${fence}`)

/**
 * Generate surrounding text that doesn't contain fence markers
 */
const surroundingTextArb = fc.string({ minLength: 0, maxLength: 100 })
  .filter((s) => !s.includes('```') && !s.includes('~~~'))
  .map((s) => s.replace(/\r/g, ''))

/**
 * Generate markdown content with code blocks
 */
const markdownWithCodeBlocksArb = fc.tuple(
  surroundingTextArb,
  fc.array(codeBlockArb, { minLength: 1, maxLength: 3 }),
  surroundingTextArb,
).map(([before, blocks, after]) => {
  const parts = [before]
  for (const block of blocks) {
    parts.push(block)
  }
  parts.push(after)
  return parts.join('\n')
})

describe('codeBlockTransform capability properties', () => {
  describe('Property 14: Code block extraction round trip', () => {
    it('should extract and reassemble code blocks preserving structure', () => {
      /**
       * **Feature: plugin-architecture, Property 14: Code block extraction round trip**
       * **Validates: Requirements 4.7, 4.8**
       *
       * For any markdown content with code blocks, extracting then reassembling
       * should preserve the code block structure
       */
      fc.assert(
        fc.property(
          markdownWithCodeBlocksArb,
          (content) => {
            const blocks = extractCodeBlocks(content)
            const reassembled = reassembleCodeBlocks(content, blocks)

            // Extract again from reassembled content
            const blocksAfter = extractCodeBlocks(reassembled)

            // Same number of blocks
            expect(blocksAfter.length).toBe(blocks.length)

            // Each block should have same content and language
            for (let i = 0; i < blocks.length; i++) {
              expect(blocksAfter[i]?.language).toBe(blocks[i]?.language)
              expect(blocksAfter[i]?.content).toBe(blocks[i]?.content)
              expect(blocksAfter[i]?.fence).toBe(blocks[i]?.fence)
            }
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should preserve code block content exactly', () => {
      /**
       * **Feature: plugin-architecture, Property 14: Code block extraction round trip**
       * **Validates: Requirements 4.7, 4.8**
       */
      fc.assert(
        fc.property(
          fenceArb,
          languageArb,
          codeContentArb,
          (fence, lang, codeContent) => {
            const markdown = `${fence}${lang}\n${codeContent}\n${fence}`
            const blocks = extractCodeBlocks(markdown)

            expect(blocks.length).toBe(1)
            expect(blocks[0]?.language).toBe(lang)
            expect(blocks[0]?.content).toBe(codeContent)
            expect(blocks[0]?.fence).toBe(fence)
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should handle multiple code blocks independently', () => {
      /**
       * **Feature: plugin-architecture, Property 14: Code block extraction round trip**
       * **Validates: Requirements 4.7, 4.8**
       */
      fc.assert(
        fc.property(
          fc.array(
            fc.tuple(fenceArb, languageArb, codeContentArb),
            { minLength: 2, maxLength: 5 },
          ),
          (blockDefs) => {
            const markdown = blockDefs
              .map(([fence, lang, content]) => `${fence}${lang}\n${content}\n${fence}`)
              .join('\n\n')

            const blocks = extractCodeBlocks(markdown)

            expect(blocks.length).toBe(blockDefs.length)

            for (let i = 0; i < blockDefs.length; i++) {
              const [fence, lang, content] = blockDefs[i] as [string, string, string]
              expect(blocks[i]?.fence).toBe(fence)
              expect(blocks[i]?.language).toBe(lang)
              expect(blocks[i]?.content).toBe(content)
            }
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should return empty array for content without code blocks', () => {
      /**
       * **Feature: plugin-architecture, Property 14: Code block extraction round trip**
       * **Validates: Requirements 4.7**
       */
      fc.assert(
        fc.property(
          surroundingTextArb,
          (content) => {
            const blocks = extractCodeBlocks(content)
            expect(blocks).toEqual([])
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should preserve line numbers correctly', () => {
      /**
       * **Feature: plugin-architecture, Property 14: Code block extraction round trip**
       * **Validates: Requirements 4.7, 4.8**
       */
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 5 }),
          fenceArb,
          languageArb,
          codeContentArb,
          (prefixLines, fence, lang, content) => {
            const prefix = '\n'.repeat(prefixLines)
            const markdown = `${prefix}${fence}${lang}\n${content}\n${fence}`
            const blocks = extractCodeBlocks(markdown)

            expect(blocks.length).toBe(1)
            // Start line should account for prefix newlines
            expect(blocks[0]?.startLine).toBe(prefixLines + 1)
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should handle empty code blocks', () => {
      /**
       * **Feature: plugin-architecture, Property 14: Code block extraction round trip**
       * **Validates: Requirements 4.7, 4.8**
       */
      fc.assert(
        fc.property(
          fenceArb,
          languageArb,
          (fence, lang) => {
            const markdown = `${fence}${lang}\n\n${fence}`
            const blocks = extractCodeBlocks(markdown)

            expect(blocks.length).toBe(1)
            expect(blocks[0]?.content).toBe('')
            expect(blocks[0]?.language).toBe(lang)
          },
        ),
        { numRuns: 100 },
      )
    })
  })
})
