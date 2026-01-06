import type { InputEffectContext } from './AbstractInputPlugin'
import type { ILogger } from '@/log'
import type { PluginOptions } from '@/types'

import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import * as fc from 'fast-check'
import * as glob from 'fast-glob'
import { describe, expect, it } from 'vitest'
import { MarkdownWhitespaceCleanupEffectInputPlugin } from './MarkdownWhitespaceCleanupEffectInputPlugin'

/**
 * Feature: effect-input-plugins
 * Property-based tests for MarkdownWhitespaceCleanupEffectInputPlugin
 *
 * Property 8: Trailing whitespace removal
 * For any .md file processed by MarkdownWhitespaceCleanupEffectInputPlugin,
 * no line in the output should end with space or tab characters.
 *
 * Property 9: Excessive blank line reduction
 * For any .md file processed by MarkdownWhitespaceCleanupEffectInputPlugin,
 * the output should contain at most 2 consecutive blank lines.
 *
 * Property 11: Line ending preservation
 * For any .md file processed by MarkdownWhitespaceCleanupEffectInputPlugin,
 * the line ending style (LF or CRLF) should be preserved in the output.
 *
 * Validates: Requirements 3.2, 3.3, 3.7
 */

// Test helpers
function createMockLogger(): ILogger {
  return {
    trace: () => { },
    debug: () => { },
    info: () => { },
    warn: () => { },
    error: () => { },
    fatal: () => { },
    child: () => createMockLogger(),
  } as unknown as ILogger
}

function createEffectContext(workspaceDir: string, shadowProjectDir: string, dryRun: boolean = false): InputEffectContext {
  return {
    logger: createMockLogger(),
    fs,
    path,
    glob,
    userConfigOptions: {} as PluginOptions,
    workspaceDir,
    shadowProjectDir,
    dryRun,
  }
}

// Generators

// Generate a line of text (without line endings)
const lineContentGen = fc.string({ minLength: 0, maxLength: 100, unit: 'grapheme-ascii' })
  .filter(s => !s.includes('\n') && !s.includes('\r'))

// Generate trailing whitespace (spaces and tabs)
const trailingWhitespaceGen = fc.array(
  fc.constantFrom(' ', '\t'),
  { minLength: 0, maxLength: 10 },
).map(chars => chars.join(''))

// Generate a line with optional trailing whitespace
const lineWithTrailingWhitespaceGen = fc.tuple(lineContentGen, trailingWhitespaceGen)
  .map(([content, trailing]) => content + trailing)

// Generate markdown content with various whitespace patterns
const markdownContentGen = fc.array(lineWithTrailingWhitespaceGen, { minLength: 1, maxLength: 20 })
  .chain(lines => {
    // Randomly insert extra blank lines between content lines
    return fc.array(
      fc.tuple(
        fc.constant(null as string | null),
        // Number of blank lines to insert
        fc.integer({ min: 0, max: 5 }),
      ),
      { minLength: lines.length, maxLength: lines.length },
    ).map(blankCounts => {
      const result: string[] = []
      for (let i = 0; i < lines.length; i++) {
        // Add blank lines before this line
        const blankCount = blankCounts[i]?.[1] ?? 0
        for (let j = 0; j < blankCount; j++) {
          result.push('')
        }
        result.push(lines[i])
      }
      return result
    })
  })

// Generate line ending style
const lineEndingGen = fc.constantFrom('\n', '\r\n')

// Generate complete markdown content with specific line ending
const markdownWithLineEndingGen = fc.tuple(markdownContentGen, lineEndingGen)
  .map(([lines, lineEnding]) => lines.join(lineEnding))

describe('markdownWhitespaceCleanupEffectInputPlugin Property Tests', () => {
  /**
   * Feature: effect-input-plugins, Property 8: Trailing whitespace removal
   * Validates: Requirements 3.2
   *
   * For any .md file processed by MarkdownWhitespaceCleanupEffectInputPlugin,
   * no line in the output should end with space or tab characters.
   */
  describe('property 8: Trailing whitespace removal', () => {
    it('should remove all trailing whitespace from every line', async () => {
      const plugin = new MarkdownWhitespaceCleanupEffectInputPlugin()

      await fc.assert(
        fc.asyncProperty(
          markdownWithLineEndingGen,
          async content => {
            // Process the content
            const cleaned = plugin.cleanMarkdownContent(content)

            // Split into lines (handle both LF and CRLF)
            const lines = cleaned.split(/\r?\n/)

            // Verify: No line should end with space or tab
            for (const line of lines) {
              expect(line).not.toMatch(/[ \t]$/)
            }
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should remove trailing whitespace in actual files', async () => {
      await fc.assert(
        fc.asyncProperty(
          markdownWithLineEndingGen,
          async content => {
            // Create isolated temp directory for this property run
            const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'whitespace-p8-'))

            try {
              // Setup: Create shadow project with markdown file
              const shadowProjectDir = path.join(tempDir, 'shadow')
              const srcDir = path.join(shadowProjectDir, 'src')

              fs.mkdirSync(srcDir, { recursive: true })

              const mdFilePath = path.join(srcDir, 'test.md')
              fs.writeFileSync(mdFilePath, content, 'utf-8')

              // Execute plugin
              const plugin = new MarkdownWhitespaceCleanupEffectInputPlugin()
              const ctx = createEffectContext(tempDir, shadowProjectDir, false)
              const effectMethod = (plugin as any).cleanupWhitespace.bind(plugin)
              await effectMethod(ctx)

              // Read the processed file
              const processedContent = fs.readFileSync(mdFilePath, 'utf-8')
              const lines = processedContent.split(/\r?\n/)

              // Verify: No line should end with space or tab
              for (const line of lines) {
                expect(line).not.toMatch(/[ \t]$/)
              }
            } finally {
              // Cleanup
              if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true })
            }
          },
        ),
        { numRuns: 100 },
      )
    })
  })

  /**
   * Feature: effect-input-plugins, Property 9: Excessive blank line reduction
   * Validates: Requirements 3.3
   *
   * For any .md file processed by MarkdownWhitespaceCleanupEffectInputPlugin,
   * the output should contain at most 2 consecutive blank lines.
   */
  describe('property 9: Excessive blank line reduction', () => {
    it('should reduce consecutive blank lines to at most 2', async () => {
      const plugin = new MarkdownWhitespaceCleanupEffectInputPlugin()

      await fc.assert(
        fc.asyncProperty(
          markdownWithLineEndingGen,
          async content => {
            // Process the content
            const cleaned = plugin.cleanMarkdownContent(content)

            // Split into lines (handle both LF and CRLF)
            const lines = cleaned.split(/\r?\n/)

            // Count consecutive blank lines
            let maxConsecutiveBlank = 0
            let currentConsecutiveBlank = 0

            for (const line of lines) {
              if (line === '') {
                currentConsecutiveBlank++
                maxConsecutiveBlank = Math.max(maxConsecutiveBlank, currentConsecutiveBlank)
              }
              else currentConsecutiveBlank = 0
            }

            // Verify: At most 2 consecutive blank lines
            expect(maxConsecutiveBlank).toBeLessThanOrEqual(2)
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should reduce excessive blank lines in actual files', async () => {
      await fc.assert(
        fc.asyncProperty(
          markdownWithLineEndingGen,
          async content => {
            // Create isolated temp directory for this property run
            const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'whitespace-p9-'))

            try {
              // Setup: Create shadow project with markdown file
              const shadowProjectDir = path.join(tempDir, 'shadow')
              const srcDir = path.join(shadowProjectDir, 'src')

              fs.mkdirSync(srcDir, { recursive: true })

              const mdFilePath = path.join(srcDir, 'test.md')
              fs.writeFileSync(mdFilePath, content, 'utf-8')

              // Execute plugin
              const plugin = new MarkdownWhitespaceCleanupEffectInputPlugin()
              const ctx = createEffectContext(tempDir, shadowProjectDir, false)
              const effectMethod = (plugin as any).cleanupWhitespace.bind(plugin)
              await effectMethod(ctx)

              // Read the processed file
              const processedContent = fs.readFileSync(mdFilePath, 'utf-8')
              const lines = processedContent.split(/\r?\n/)

              // Count consecutive blank lines
              let maxConsecutiveBlank = 0
              let currentConsecutiveBlank = 0

              for (const line of lines) {
                if (line === '') {
                  currentConsecutiveBlank++
                  maxConsecutiveBlank = Math.max(maxConsecutiveBlank, currentConsecutiveBlank)
                }
                else currentConsecutiveBlank = 0
              }

              // Verify: At most 2 consecutive blank lines
              expect(maxConsecutiveBlank).toBeLessThanOrEqual(2)
            } finally {
              // Cleanup
              if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true })
            }
          },
        ),
        { numRuns: 100 },
      )
    })
  })

  /**
   * Feature: effect-input-plugins, Property 11: Line ending preservation
   * Validates: Requirements 3.7
   *
   * For any .md file processed by MarkdownWhitespaceCleanupEffectInputPlugin,
   * the line ending style (LF or CRLF) should be preserved in the output.
   */
  describe('property 11: Line ending preservation', () => {
    it('should preserve LF line endings', async () => {
      const plugin = new MarkdownWhitespaceCleanupEffectInputPlugin()

      await fc.assert(
        fc.asyncProperty(
          markdownContentGen,
          async lines => {
            // Create content with LF line endings
            const content = lines.join('\n')

            // Process the content
            const cleaned = plugin.cleanMarkdownContent(content)

            // Verify: Should not contain CRLF
            expect(cleaned).not.toContain('\r\n')

            // Verify: If multi-line, should contain LF
            if (lines.length > 1) expect(cleaned).toContain('\n')
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should preserve CRLF line endings', async () => {
      const plugin = new MarkdownWhitespaceCleanupEffectInputPlugin()

      await fc.assert(
        fc.asyncProperty(
          markdownContentGen,
          async lines => {
            // Create content with CRLF line endings
            const content = lines.join('\r\n')

            // Process the content
            const cleaned = plugin.cleanMarkdownContent(content)

            // Verify: If multi-line, should use CRLF
            if (lines.length <= 1) return

            const crlfCount = (cleaned.match(/\r\n/g) || []).length
            const lfOnlyCount = (cleaned.replace(/\r\n/g, '').match(/\n/g) || []).length
            expect(lfOnlyCount).toBe(0)
            expect(crlfCount).toBeGreaterThan(0)
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should preserve line endings in actual files', async () => {
      await fc.assert(
        fc.asyncProperty(
          markdownContentGen,
          lineEndingGen,
          async (lines, lineEnding) => {
            // Create isolated temp directory for this property run
            const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'whitespace-p11-'))

            try {
              // Setup: Create shadow project with markdown file
              const shadowProjectDir = path.join(tempDir, 'shadow')
              const srcDir = path.join(shadowProjectDir, 'src')

              fs.mkdirSync(srcDir, { recursive: true })

              // Create content with specific line ending
              const content = lines.join(lineEnding)
              const mdFilePath = path.join(srcDir, 'test.md')
              fs.writeFileSync(mdFilePath, content, 'utf-8')

              // Execute plugin
              const plugin = new MarkdownWhitespaceCleanupEffectInputPlugin()
              const ctx = createEffectContext(tempDir, shadowProjectDir, false)
              const effectMethod = (plugin as any).cleanupWhitespace.bind(plugin)
              await effectMethod(ctx)

              // Read the processed file
              const processedContent = fs.readFileSync(mdFilePath, 'utf-8')

              // Verify line ending preservation
              if (lines.length > 1) {
                if (lineEnding === '\r\n') {
                  // Should use CRLF
                  const crlfCount = (processedContent.match(/\r\n/g) || []).length
                  const lfOnlyCount = (processedContent.replace(/\r\n/g, '').match(/\n/g) || []).length
                  expect(lfOnlyCount).toBe(0)
                  expect(crlfCount).toBeGreaterThan(0)
                } else {
                  // Should use LF (no CRLF)
                  expect(processedContent).not.toContain('\r\n')
                  expect(processedContent).toContain('\n')
                }
              }
            } finally {
              // Cleanup
              if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true })
            }
          },
        ),
        { numRuns: 100 },
      )
    })
  })
})
