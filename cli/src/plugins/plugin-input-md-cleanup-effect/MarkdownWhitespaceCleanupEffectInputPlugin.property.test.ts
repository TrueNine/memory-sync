import type {InputEffectContext} from '@truenine/plugin-input-shared'
import type {ILogger, PluginOptions} from '@truenine/plugin-shared'

import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import * as fc from 'fast-check'
import * as glob from 'fast-glob'
import {describe, expect, it} from 'vitest'
import {MarkdownWhitespaceCleanupEffectInputPlugin} from './MarkdownWhitespaceCleanupEffectInputPlugin'

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

function createMockLogger(): ILogger { // Test helpers
  return {
    trace: () => { },
    debug: () => { },
    info: () => { },
    warn: () => { },
    error: () => { },
    fatal: () => { },
    child: () => createMockLogger()
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
    dryRun
  }
} // Generators

const lineContentGen = fc.string({minLength: 0, maxLength: 100, unit: 'grapheme-ascii'}) // Generate a line of text (without line endings)
  .filter(s => !s.includes('\n') && !s.includes('\r'))

const trailingWhitespaceGen = fc.array( // Generate trailing whitespace (spaces and tabs)
  fc.constantFrom(' ', '\t'),
  {minLength: 0, maxLength: 10}
).map(chars => chars.join(''))

const lineWithTrailingWhitespaceGen = fc.tuple(lineContentGen, trailingWhitespaceGen) // Generate a line with optional trailing whitespace
  .map(([content, trailing]) => content + trailing)

const markdownContentGen = fc.array(lineWithTrailingWhitespaceGen, {minLength: 1, maxLength: 20}) // Generate markdown content with various whitespace patterns
  .chain(lines =>
    fc.array( // Randomly insert extra blank lines between content lines
      fc.tuple(
        fc.constant(null as string | null),
        fc.integer({min: 0, max: 5}) // Number of blank lines to insert
      ),
      {minLength: lines.length, maxLength: lines.length}
    ).map(blankCounts => {
      const result: string[] = []
      for (let i = 0; i < lines.length; i++) {
        const blankCount = blankCounts[i]?.[1] ?? 0 // Add blank lines before this line
        for (let j = 0; j < blankCount; j++) result.push('')
        result.push(lines[i]!)
      }
      return result
    }))

const lineEndingGen = fc.constantFrom('\n', '\r\n') // Generate line ending style

const markdownWithLineEndingGen = fc.tuple(markdownContentGen, lineEndingGen) // Generate complete markdown content with specific line ending
  .map(([lines, lineEnding]) => lines.join(lineEnding))

describe('markdownWhitespaceCleanupEffectInputPlugin Property Tests', () => {
  describe('property 8: Trailing whitespace removal', () => {
    it('should remove all trailing whitespace from every line', async () => {
      const plugin = new MarkdownWhitespaceCleanupEffectInputPlugin()

      await fc.assert(
        fc.asyncProperty(
          markdownWithLineEndingGen,
          async content => {
            const cleaned = plugin.cleanMarkdownContent(content) // Process the content

            const lines = cleaned.split(/\r?\n/) // Split into lines (handle both LF and CRLF)

            for (const line of lines) expect(line).not.toMatch(/[ \t]$/) // Verify: No line should end with space or tab
          }
        ),
        {numRuns: 100}
      )
    })

    it('should remove trailing whitespace in actual files', async () => {
      await fc.assert(
        fc.asyncProperty(
          markdownWithLineEndingGen,
          async content => {
            const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'whitespace-p8-')) // Create isolated temp directory for this property run

            try {
              const shadowProjectDir = path.join(tempDir, 'shadow') // Setup: Create shadow project with markdown file
              const srcDir = path.join(shadowProjectDir, 'src')

              fs.mkdirSync(srcDir, {recursive: true})

              const mdFilePath = path.join(srcDir, 'test.md')
              fs.writeFileSync(mdFilePath, content, 'utf8')

              const plugin = new MarkdownWhitespaceCleanupEffectInputPlugin() // Execute plugin
              const ctx = createEffectContext(tempDir, shadowProjectDir, false)
              const effectMethod = (plugin as any).cleanupWhitespace.bind(plugin)
              await effectMethod(ctx)

              const processedContent = fs.readFileSync(mdFilePath, 'utf8') // Read the processed file
              const lines = processedContent.split(/\r?\n/)

              for (const line of lines) expect(line).not.toMatch(/[ \t]$/) // Verify: No line should end with space or tab
            }
            finally {
              if (fs.existsSync(tempDir)) fs.rmSync(tempDir, {recursive: true, force: true}) // Cleanup
            }
          }
        ),
        {numRuns: 100}
      )
    }, 120000)
  })

  describe('property 9: Excessive blank line reduction', () => {
    it('should reduce consecutive blank lines to at most 2', async () => {
      const plugin = new MarkdownWhitespaceCleanupEffectInputPlugin()

      await fc.assert(
        fc.asyncProperty(
          markdownWithLineEndingGen,
          async content => {
            const cleaned = plugin.cleanMarkdownContent(content) // Process the content

            const lines = cleaned.split(/\r?\n/) // Split into lines (handle both LF and CRLF)

            let maxConsecutiveBlank = 0 // Count consecutive blank lines
            let currentConsecutiveBlank = 0

            for (const line of lines) {
              if (line === '') {
                currentConsecutiveBlank++
                maxConsecutiveBlank = Math.max(maxConsecutiveBlank, currentConsecutiveBlank)
              } else currentConsecutiveBlank = 0
            }

            expect(maxConsecutiveBlank).toBeLessThanOrEqual(2) // Verify: At most 2 consecutive blank lines
          }
        ),
        {numRuns: 100}
      )
    })

    it('should reduce excessive blank lines in actual files', async () => {
      await fc.assert(
        fc.asyncProperty(
          markdownWithLineEndingGen,
          async content => {
            const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'whitespace-p9-')) // Create isolated temp directory for this property run

            try {
              const shadowProjectDir = path.join(tempDir, 'shadow') // Setup: Create shadow project with markdown file
              const srcDir = path.join(shadowProjectDir, 'src')

              fs.mkdirSync(srcDir, {recursive: true})

              const mdFilePath = path.join(srcDir, 'test.md')
              fs.writeFileSync(mdFilePath, content, 'utf8')

              const plugin = new MarkdownWhitespaceCleanupEffectInputPlugin() // Execute plugin
              const ctx = createEffectContext(tempDir, shadowProjectDir, false)
              const effectMethod = (plugin as any).cleanupWhitespace.bind(plugin)
              await effectMethod(ctx)

              const processedContent = fs.readFileSync(mdFilePath, 'utf8') // Read the processed file
              const lines = processedContent.split(/\r?\n/)

              let maxConsecutiveBlank = 0 // Count consecutive blank lines
              let currentConsecutiveBlank = 0

              for (const line of lines) {
                if (line === '') {
                  currentConsecutiveBlank++
                  maxConsecutiveBlank = Math.max(maxConsecutiveBlank, currentConsecutiveBlank)
                } else currentConsecutiveBlank = 0
              }

              expect(maxConsecutiveBlank).toBeLessThanOrEqual(2) // Verify: At most 2 consecutive blank lines
            }
            finally {
              if (fs.existsSync(tempDir)) fs.rmSync(tempDir, {recursive: true, force: true}) // Cleanup
            }
          }
        ),
        {numRuns: 100}
      )
    })
  })

  describe('property 11: Line ending preservation', () => {
    it('should preserve LF line endings', async () => {
      const plugin = new MarkdownWhitespaceCleanupEffectInputPlugin()

      await fc.assert(
        fc.asyncProperty(
          markdownContentGen,
          async lines => {
            const content = lines.join('\n') // Create content with LF line endings

            const cleaned = plugin.cleanMarkdownContent(content) // Process the content

            expect(cleaned).not.toContain('\r\n') // Verify: Should not contain CRLF

            if (lines.length > 1) expect(cleaned).toContain('\n') // Verify: If multi-line, should contain LF
          }
        ),
        {numRuns: 100}
      )
    })

    it('should preserve CRLF line endings', async () => {
      const plugin = new MarkdownWhitespaceCleanupEffectInputPlugin()

      await fc.assert(
        fc.asyncProperty(
          markdownContentGen,
          async lines => {
            const content = lines.join('\r\n') // Create content with CRLF line endings

            const cleaned = plugin.cleanMarkdownContent(content) // Process the content

            if (lines.length <= 1) return // Verify: If multi-line, should use CRLF

            const crlfCount = (cleaned.match(/\r\n/g) ?? []).length
            const lfOnlyCount = (cleaned.replaceAll('\r\n', '').match(/\n/g) ?? []).length
            expect(lfOnlyCount).toBe(0)
            expect(crlfCount).toBeGreaterThan(0)
          }
        ),
        {numRuns: 100}
      )
    })

    it('should preserve line endings in actual files', async () => {
      await fc.assert(
        fc.asyncProperty(
          markdownContentGen,
          lineEndingGen,
          async (lines, lineEnding) => {
            const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'whitespace-p11-')) // Create isolated temp directory for this property run

            try {
              const shadowProjectDir = path.join(tempDir, 'shadow') // Setup: Create shadow project with markdown file
              const srcDir = path.join(shadowProjectDir, 'src')

              fs.mkdirSync(srcDir, {recursive: true})

              const content = lines.join(lineEnding) // Create content with specific line ending
              const mdFilePath = path.join(srcDir, 'test.md')
              fs.writeFileSync(mdFilePath, content, 'utf8')

              const plugin = new MarkdownWhitespaceCleanupEffectInputPlugin() // Execute plugin
              const ctx = createEffectContext(tempDir, shadowProjectDir, false)
              const effectMethod = (plugin as any).cleanupWhitespace.bind(plugin)
              await effectMethod(ctx)

              const processedContent = fs.readFileSync(mdFilePath, 'utf8') // Read the processed file

              if (lines.length > 1) { // Verify line ending preservation
                if (lineEnding === '\r\n') {
                  const crlfCount = (processedContent.match(/\r\n/g) ?? []).length // Should use CRLF
                  const lfOnlyCount = (processedContent.replaceAll('\r\n', '').match(/\n/g) ?? []).length
                  expect(lfOnlyCount).toBe(0)
                  expect(crlfCount).toBeGreaterThan(0)
                } else {
                  expect(processedContent).not.toContain('\r\n') // Should use LF (no CRLF)
                  expect(processedContent).toContain('\n')
                }
              }
            }
            finally {
              if (fs.existsSync(tempDir)) fs.rmSync(tempDir, {recursive: true, force: true}) // Cleanup
            }
          }
        ),
        {numRuns: 100}
      )
    })
  })
})
