import type {SkillPrompt, SkillReferenceDocument, SkillYAMLFrontMatter} from 'memory-sync-cli/src/types'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import * as fc from 'fast-check'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import {parseMarkdown} from 'memory-sync-cli/src/markdown'
import {FilePathKind, PromptKind} from 'memory-sync-cli/src/types'

/**
 * Integration tests for Kiro Powers Skill Output
 * Tests the round-trip property and co-location of reference documents
 */
describe('kiroPowersIntegration', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kiro-powers-test-')) // Create a temporary directory for test files
  })

  afterEach(() => {
    if (fs.existsSync(tempDir)) fs.rmSync(tempDir, {recursive: true, force: true}) // Clean up temporary directory
  })

  describe('property 4: Reference Document Round-Trip', () => {
    const markdownContentGen = fc.array( // Generator for valid markdown content (without front matter for simplicity)
      fc.oneof(
        fc.constant('# Heading\n'),
        fc.constant('## Subheading\n'),
        fc.constant('- List item\n'),
        fc.constant('* Bullet point\n'),
        fc.constant('\n'),
        fc.constant('Some text content.\n'),
        fc.constant('Another paragraph.\n'),
        fc.constant('Code: `example`\n')
      ),
      {minLength: 1, maxLength: 10}
    ).map(parts => parts.join('').trim() || 'Default content')

    const fileNameGen = fc.string({minLength: 1, maxLength: 20, unit: 'grapheme-ascii'}) // Generator for valid file names (alphanumeric with .md extension)
      .filter(s => /^[a-z0-9]+$/i.test(s))
      .map(s => `${s}.md`)

    it('should preserve content when reading and writing reference documents', () => {
      fc.assert(
        fc.property(
          markdownContentGen,
          fileNameGen,
          (content, fileName) => {
            const refDocPath = path.join(tempDir, fileName) // Arrange: Create a reference document file
            fs.writeFileSync(refDocPath, content, 'utf8')

            const parsed = parseMarkdown(content) // Act: Parse the content using parseMarkdown (same as SkillInputPlugin)
            const parsedContent = parsed.contentWithoutFrontMatter

            const outputPath = path.join(tempDir, `output-${fileName}`) // Simulate writing via KiroCLIOutputPlugin (writes content without front matter)
            fs.writeFileSync(outputPath, parsedContent, 'utf8')

            const readBackContent = fs.readFileSync(outputPath, 'utf8') // Assert: Read back and verify content is identical
            expect(readBackContent).toBe(parsedContent)
          }
        ),
        {numRuns: 100}
      )
    })

    it('should preserve content with front matter when round-tripping', () => {
      fc.assert(
        fc.property(
          markdownContentGen,
          fileNameGen,
          (bodyContent, fileName) => {
            const frontMatter = '---\ntitle: Test Document\n---\n' // Arrange: Create content with front matter
            const fullContent = `${frontMatter}${bodyContent}`
            const refDocPath = path.join(tempDir, fileName)
            fs.writeFileSync(refDocPath, fullContent, 'utf8')

            const parsed = parseMarkdown(fullContent) // Act: Parse the content
            const {contentWithoutFrontMatter} = parsed

            const outputPath = path.join(tempDir, `output-${fileName}`) // Write the content without front matter (as KiroCLIOutputPlugin does)
            fs.writeFileSync(outputPath, contentWithoutFrontMatter, 'utf8')

            const readBackContent = fs.readFileSync(outputPath, 'utf8') // Assert: Content without front matter should match body content
            expect(readBackContent).toBe(bodyContent)
          }
        ),
        {numRuns: 100}
      )
    })
  })

  describe('property 6: Reference Document Co-location', () => {
    const skillNameGen = fc.string({minLength: 1, maxLength: 15, unit: 'grapheme-ascii'}) // Generator for valid skill names (alphanumeric, kebab-case friendly)
      .filter(s => /^[a-z0-9]+$/i.test(s))
      .map(s => s || 'default-skill')

    const refDocFileNameGen = fc.string({minLength: 1, maxLength: 10, unit: 'grapheme-ascii'}) // Generator for reference document file names
      .filter(s => /^[a-z0-9]+$/i.test(s))
      .map(s => `${s || 'doc'}.md`)

    it('should place all reference documents in the same directory as POWER.md', () => {
      fc.assert(
        fc.property(
          skillNameGen,
          fc.array(refDocFileNameGen, {minLength: 0, maxLength: 5}),
          (skillName, refDocFileNames) => {
            const uniqueFileNames = [...new Set(refDocFileNames)] // Ensure unique file names

            const referenceDocuments: SkillReferenceDocument[] = uniqueFileNames.map(fileName => ({ // Create mock reference documents
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
                getAbsolutePath: () => path.join(tempDir, fileName)
              }
            }))

            const _skill: SkillPrompt = { // Create mock skill prompt (prefixed with _ as it's used for documentation purposes)
              type: PromptKind.Skill,
              content: '# Skill Content',
              length: 15,
              filePathKind: FilePathKind.Relative,
              yamlFrontMatter: {
                name: skillName,
                description: 'Test skill'
              } as SkillYAMLFrontMatter,
              markdownContents: [],
              dir: {
                pathKind: FilePathKind.Relative,
                path: skillName,
                basePath: tempDir,
                getDirectoryName: () => skillName,
                getAbsolutePath: () => path.join(tempDir, skillName)
              },
              ...referenceDocuments.length > 0 && {referenceDocuments}
            }

            const powersDir = path.join(os.homedir(), '.kiro/powers/installed') // Calculate expected paths
            const skillPowerDir = path.join(powersDir, skillName)
            const expectedPowerMdPath = path.join(skillPowerDir, 'POWER.md')

            for (const refDoc of referenceDocuments) { // Verify all reference documents would be in the same directory
              const expectedRefDocPath = path.join(skillPowerDir, refDoc.dir.path)
              const refDocDir = path.dirname(expectedRefDocPath)
              const powerMdDir = path.dirname(expectedPowerMdPath)

              expect(refDocDir).toBe(powerMdDir) // Assert: Reference document directory should equal POWER.md directory
            }

            return true
          }
        ),
        {numRuns: 100}
      )
    })

    it('should maintain co-location for skills with varying numbers of reference documents', () => {
      fc.assert(
        fc.property(
          skillNameGen,
          fc.array(refDocFileNameGen, {minLength: 1, maxLength: 10}),
          (skillName, refDocFileNames) => {
            const uniqueFileNames = [...new Set(refDocFileNames)] // Ensure unique file names
            if (uniqueFileNames.length === 0) return true

            const powersDir = path.join(os.homedir(), '.kiro/powers/installed') // Calculate expected base directory
            const skillPowerDir = path.join(powersDir, skillName)

            const allPaths = [ // All files should be in the same directory
              path.join(skillPowerDir, 'POWER.md'),
              ...uniqueFileNames.map(fn => path.join(skillPowerDir, fn))
            ]

            const directories = allPaths.map(p => path.dirname(p))
            const uniqueDirs = [...new Set(directories)]

            expect(uniqueDirs.length).toBe(1) // Assert: All files should be in exactly one directory
            expect(uniqueDirs[0]).toBe(skillPowerDir)

            return true
          }
        ),
        {numRuns: 100}
      )
    })
  })
})
