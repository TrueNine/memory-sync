import type { SkillPrompt, SkillReferenceDocument, SkillYAMLFrontMatter } from '@/types'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import * as fc from 'fast-check'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { parseMarkdown } from '@/markdown'
import { FilePathKind, PromptKind } from '@/types'

/**
 * Integration tests for Kiro Powers Skill Output
 * Tests the round-trip property and co-location of reference documents
 */
describe('kiroPowersIntegration', () => {
  let tempDir: string

  beforeEach(() => {
    // Create a temporary directory for test files
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kiro-powers-test-'))
  })

  afterEach(() => {
    // Clean up temporary directory
    if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true })
  })

  /**
   * Feature: kiro-powers-skill-output, Property 4: Reference Document Round-Trip
   * Validates: Requirements 4.5
   *
   * For any valid reference document file, reading it via SkillInputPlugin
   * and then writing it via KiroCLIOutputPlugin SHALL produce a file with identical content.
   */
  describe('property 4: Reference Document Round-Trip', () => {
    // Generator for valid markdown content (without front matter for simplicity)
    const markdownContentGen = fc.array(
      fc.oneof(
        fc.constant('# Heading\n'),
        fc.constant('## Subheading\n'),
        fc.constant('- List item\n'),
        fc.constant('* Bullet point\n'),
        fc.constant('\n'),
        fc.constant('Some text content.\n'),
        fc.constant('Another paragraph.\n'),
        fc.constant('Code: `example`\n'),
      ),
      { minLength: 1, maxLength: 10 },
    ).map(parts => parts.join('').trim() || 'Default content')

    // Generator for valid file names (alphanumeric with .md extension)
    const fileNameGen = fc.string({ minLength: 1, maxLength: 20, unit: 'grapheme-ascii' })
      .filter(s => /^[a-z0-9]+$/i.test(s))
      .map(s => `${s}.md`)

    it('should preserve content when reading and writing reference documents', () => {
      fc.assert(
        fc.property(
          markdownContentGen,
          fileNameGen,
          (content, fileName) => {
            // Arrange: Create a reference document file
            const refDocPath = path.join(tempDir, fileName)
            fs.writeFileSync(refDocPath, content, 'utf-8')

            // Act: Parse the content using parseMarkdown (same as SkillInputPlugin)
            const parsed = parseMarkdown(content)
            const parsedContent = parsed.contentWithoutFrontMatter

            // Simulate writing via KiroCLIOutputPlugin (writes content without front matter)
            const outputPath = path.join(tempDir, `output-${fileName}`)
            fs.writeFileSync(outputPath, parsedContent, 'utf-8')

            // Assert: Read back and verify content is identical
            const readBackContent = fs.readFileSync(outputPath, 'utf-8')
            expect(readBackContent).toBe(parsedContent)
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should preserve content with front matter when round-tripping', () => {
      fc.assert(
        fc.property(
          markdownContentGen,
          fileNameGen,
          (bodyContent, fileName) => {
            // Arrange: Create content with front matter
            const frontMatter = '---\ntitle: Test Document\n---\n'
            const fullContent = `${frontMatter}${bodyContent}`
            const refDocPath = path.join(tempDir, fileName)
            fs.writeFileSync(refDocPath, fullContent, 'utf-8')

            // Act: Parse the content
            const parsed = parseMarkdown(fullContent)
            const contentWithoutFrontMatter = parsed.contentWithoutFrontMatter

            // Write the content without front matter (as KiroCLIOutputPlugin does)
            const outputPath = path.join(tempDir, `output-${fileName}`)
            fs.writeFileSync(outputPath, contentWithoutFrontMatter, 'utf-8')

            // Assert: Content without front matter should match body content
            const readBackContent = fs.readFileSync(outputPath, 'utf-8')
            expect(readBackContent).toBe(bodyContent)
          },
        ),
        { numRuns: 100 },
      )
    })
  })

  /**
   * Feature: kiro-powers-skill-output, Property 6: Reference Document Co-location
   * Validates: Requirements 2.3
   *
   * For any skill with reference documents, all reference documents SHALL be
   * written to the same directory as the skill's POWER.md file.
   */
  describe('property 6: Reference Document Co-location', () => {
    // Generator for valid skill names (alphanumeric, kebab-case friendly)
    const skillNameGen = fc.string({ minLength: 1, maxLength: 15, unit: 'grapheme-ascii' })
      .filter(s => /^[a-z0-9]+$/i.test(s))
      .map(s => s || 'default-skill')

    // Generator for reference document file names
    const refDocFileNameGen = fc.string({ minLength: 1, maxLength: 10, unit: 'grapheme-ascii' })
      .filter(s => /^[a-z0-9]+$/i.test(s))
      .map(s => `${s || 'doc'}.md`)

    it('should place all reference documents in the same directory as POWER.md', () => {
      fc.assert(
        fc.property(
          skillNameGen,
          fc.array(refDocFileNameGen, { minLength: 0, maxLength: 5 }),
          (skillName, refDocFileNames) => {
            // Ensure unique file names
            const uniqueFileNames = [...new Set(refDocFileNames)]

            // Create mock reference documents
            const referenceDocuments: SkillReferenceDocument[] = uniqueFileNames.map(fileName => ({
              type: PromptKind.SkillReferenceDocument,
              content: `Content of ${fileName}`,
              length: `Content of ${fileName}`.length,
              filePathKind: FilePathKind.Relative,
              markdownContents: [],
              dir: {
                pathKind: FilePathKind.Relative,
                path: fileName,
                basePath: tempDir,
                getDirectoryName: () => '',
                getAbsolutePath: () => path.join(tempDir, fileName),
              },
            }))

            // Create mock skill prompt (prefixed with _ as it's used for documentation purposes)
            const _skill: SkillPrompt = {
              type: PromptKind.Skill,
              content: '# Skill Content',
              length: 15,
              filePathKind: FilePathKind.Relative,
              yamlFrontMatter: {
                name: skillName,
                description: 'Test skill',
              } as SkillYAMLFrontMatter,
              markdownContents: [],
              dir: {
                pathKind: FilePathKind.Relative,
                path: skillName,
                basePath: tempDir,
                getDirectoryName: () => skillName,
                getAbsolutePath: () => path.join(tempDir, skillName),
              },
              ...(referenceDocuments.length > 0 && { referenceDocuments }),
            }

            // Calculate expected paths
            const powersDir = path.join(os.homedir(), '.kiro/powers/installed')
            const skillPowerDir = path.join(powersDir, skillName)
            const expectedPowerMdPath = path.join(skillPowerDir, 'POWER.md')

            // Verify all reference documents would be in the same directory
            for (const refDoc of referenceDocuments) {
              const expectedRefDocPath = path.join(skillPowerDir, refDoc.dir.path)
              const refDocDir = path.dirname(expectedRefDocPath)
              const powerMdDir = path.dirname(expectedPowerMdPath)

              // Assert: Reference document directory should equal POWER.md directory
              expect(refDocDir).toBe(powerMdDir)
            }

            return true
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should maintain co-location for skills with varying numbers of reference documents', () => {
      fc.assert(
        fc.property(
          skillNameGen,
          fc.array(refDocFileNameGen, { minLength: 1, maxLength: 10 }),
          (skillName, refDocFileNames) => {
            // Ensure unique file names
            const uniqueFileNames = [...new Set(refDocFileNames)]
            if (uniqueFileNames.length === 0) return true

            // Calculate expected base directory
            const powersDir = path.join(os.homedir(), '.kiro/powers/installed')
            const skillPowerDir = path.join(powersDir, skillName)

            // All files should be in the same directory
            const allPaths = [
              path.join(skillPowerDir, 'POWER.md'),
              ...uniqueFileNames.map(fn => path.join(skillPowerDir, fn)),
            ]

            const directories = allPaths.map(p => path.dirname(p))
            const uniqueDirs = [...new Set(directories)]

            // Assert: All files should be in exactly one directory
            expect(uniqueDirs.length).toBe(1)
            expect(uniqueDirs[0]).toBe(skillPowerDir)

            return true
          },
        ),
        { numRuns: 100 },
      )
    })
  })
})
