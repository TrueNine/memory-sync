/**
 * Property-based tests for ExportService
 * **Feature: scripts-refactor, Property 6: Export operation idempotence**
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import fc from 'fast-check'
import path from 'node:path'
import fs from 'fs-extra'
import os from 'node:os'
import { ExportService } from './ExportService'
import { FrontMatterType } from '../../utils/frontMatter'

describe('ExportService properties', () => {
  let tempDir: string
  let service: ExportService

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'export-service-test-'))
    service = new ExportService()
  })

  afterEach(async () => {
    await fs.remove(tempDir)
  })

  it('should produce same result when run twice (idempotence)', async () => {
    /**
     * **Feature: scripts-refactor, Property 6: Export operation idempotence**
     * **Validates: Requirements 3.2**
     *
     * For any export operation, running it twice with the same inputs
     * should produce the same result without side effects
     */
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          frontMatterType: fc.constantFrom(
            FrontMatterType.KIRO_FILE_MATCH,
            FrontMatterType.KIRO_ALWAYS,
            FrontMatterType.QODER_GLOB,
            FrontMatterType.QODER_ALWAYS,
          ),
          skipRoot: fc.boolean(),
          fileContent: fc.string({ minLength: 10, maxLength: 500 }),
          subdirName: fc.stringMatching(/^[a-z][a-z0-9-]{0,10}$/),
        }),
        async (options) => {
          const sourcePath = path.join(tempDir, 'source')
          const targetPath1 = path.join(tempDir, 'target1')
          const targetPath2 = path.join(tempDir, 'target2')

          await fs.ensureDir(sourcePath)

          const subdir = path.join(sourcePath, options.subdirName)
          await fs.ensureDir(subdir)
          await fs.writeFile(path.join(subdir, 'AGENTS.md'), options.fileContent)

          if (!options.skipRoot) {
            await fs.writeFile(path.join(sourcePath, 'AGENTS.md'), 'root content')
          }

          const exportOptions1 = {
            sourcePath,
            targetPath: targetPath1,
            frontMatterType: options.frontMatterType,
            skipRoot: options.skipRoot,
            processRefProjects: false,
          }

          const exportOptions2 = {
            sourcePath,
            targetPath: targetPath2,
            frontMatterType: options.frontMatterType,
            skipRoot: options.skipRoot,
            processRefProjects: false,
          }

          const result1 = await service.exportAgentsFiles(exportOptions1)
          const result2 = await service.exportAgentsFiles(exportOptions2)

          expect(result1.exported).toBe(result2.exported)
          expect(result1.skipped).toBe(result2.skipped)
          expect(result1.errors.length).toBe(result2.errors.length)

          if (result1.exported > 0) {
            const files1 = await fs.readdir(targetPath1)
            const files2 = await fs.readdir(targetPath2)

            expect(files1.sort()).toEqual(files2.sort())

            for (const file of files1) {
              const content1 = await fs.readFile(path.join(targetPath1, file), 'utf-8')
              const content2 = await fs.readFile(path.join(targetPath2, file), 'utf-8')
              expect(content1).toBe(content2)
            }
          }
        },
      ),
      { numRuns: 50 },
    )
  })

  it('should export consistent number of files for same input', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          numSubdirs: fc.integer({ min: 1, max: 5 }),
          frontMatterType: fc.constantFrom(
            FrontMatterType.KIRO_FILE_MATCH,
            FrontMatterType.QODER_GLOB,
          ),
        }),
        async (options) => {
          const testTempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'export-consistent-test-'))

          try {
            const sourcePath = path.join(testTempDir, 'source')
            const targetPath1 = path.join(testTempDir, 'target1')
            const targetPath2 = path.join(testTempDir, 'target2')

            await fs.ensureDir(sourcePath)

            for (let i = 0; i < options.numSubdirs; i++) {
              const subdir = path.join(sourcePath, `dir${i}`)
              await fs.ensureDir(subdir)
              await fs.writeFile(path.join(subdir, 'AGENTS.md'), `content ${i}`)
            }

            const exportOptions = {
              sourcePath,
              frontMatterType: options.frontMatterType,
              skipRoot: true,
              processRefProjects: false,
            }

            const result1 = await service.exportAgentsFiles({
              ...exportOptions,
              targetPath: targetPath1,
            })

            const result2 = await service.exportAgentsFiles({
              ...exportOptions,
              targetPath: targetPath2,
            })

            expect(result1.exported).toBe(options.numSubdirs)
            expect(result2.exported).toBe(options.numSubdirs)
            expect(result1.exported).toBe(result2.exported)
          } finally {
            await fs.remove(testTempDir)
          }
        },
      ),
      { numRuns: 30 },
    )
  })

  it('should preserve file content through export', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          content: fc.string({ minLength: 20, maxLength: 200 }),
          frontMatterType: fc.constantFrom(
            FrontMatterType.KIRO_FILE_MATCH,
            FrontMatterType.QODER_GLOB,
          ),
          runId: fc.integer({ min: 0, max: 10000 }),
        }),
        async (options) => {
          const sourcePath = path.join(tempDir, `source-preserve-${options.runId}`)
          const targetPath = path.join(tempDir, `target-preserve-${options.runId}`)

          await fs.ensureDir(sourcePath)

          const subdir = path.join(sourcePath, 'testdir')
          await fs.ensureDir(subdir)
          await fs.writeFile(path.join(subdir, 'AGENTS.md'), options.content)

          await service.exportAgentsFiles({
            sourcePath,
            targetPath,
            frontMatterType: options.frontMatterType,
            skipRoot: true,
            processRefProjects: false,
          })

          const exportedFiles = await fs.readdir(targetPath)
          expect(exportedFiles.length).toBeGreaterThan(0)

          const exportedContent = await fs.readFile(
            path.join(targetPath, exportedFiles[0]),
            'utf-8',
          )

          expect(exportedContent).toContain(options.content)
          expect(exportedContent).toMatch(/^---\n/)
        },
      ),
      { numRuns: 30 },
    )
  })

  it('should remove old files when cleanTarget is enabled (cleanup before export)', async () => {
    /**
     * **Feature: sync-exclude-support, Property 5: Cleanup before export removes old files**
     * **Validates: Requirements 5.1, 5.2, 5.3**
     *
     * For any steering directory with existing .md files, when export executes,
     * the resulting directory SHALL NOT contain any .md files that were not part
     * of the current export operation.
     */
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          // Generate unique old file names that will be pre-existing in target
          oldFileNames: fc.uniqueArray(
            fc.stringMatching(/^old_[a-z]{3,8}\.md$/),
            { minLength: 1, maxLength: 5 },
          ),
          // Generate unique new subdirectory names for source AGENTS.md files
          newSubdirNames: fc.uniqueArray(
            fc.stringMatching(/^new[a-z]{2,6}$/),
            { minLength: 1, maxLength: 3 },
          ),
          frontMatterType: fc.constantFrom(
            FrontMatterType.KIRO_FILE_MATCH,
            FrontMatterType.QODER_GLOB,
          ),
          runId: fc.integer({ min: 0, max: 100000 }),
        }),
        async (options) => {
          const testTempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cleanup-export-test-'))

          try {
            const sourcePath = path.join(testTempDir, 'source')
            const targetPath = path.join(testTempDir, 'target')

            // Create source directory with AGENTS.md files
            await fs.ensureDir(sourcePath)
            for (const subdirName of options.newSubdirNames) {
              const subdir = path.join(sourcePath, subdirName)
              await fs.ensureDir(subdir)
              await fs.writeFile(path.join(subdir, 'AGENTS.md'), `content for ${subdirName}`)
            }

            // Create target directory with pre-existing old .md files
            await fs.ensureDir(targetPath)
            for (const oldFileName of options.oldFileNames) {
              await fs.writeFile(path.join(targetPath, oldFileName), 'old content')
            }

            // Verify old files exist before export
            const filesBeforeExport = await fs.readdir(targetPath)
            expect(filesBeforeExport.length).toBe(options.oldFileNames.length)

            // Execute export with cleanTarget enabled (default behavior)
            await service.exportAgentsFiles({
              sourcePath,
              targetPath,
              frontMatterType: options.frontMatterType,
              skipRoot: true,
              processRefProjects: false,
              cleanTarget: true,
            })

            // Verify old files are removed
            const filesAfterExport = await fs.readdir(targetPath)

            // None of the old files should exist
            for (const oldFileName of options.oldFileNames) {
              expect(filesAfterExport).not.toContain(oldFileName)
            }

            // Only newly exported files should exist
            // Each AGENTS.md in a subdir generates a rule file
            expect(filesAfterExport.length).toBe(options.newSubdirNames.length)
          } finally {
            await fs.remove(testTempDir)
          }
        },
      ),
      { numRuns: 100 },
    )
  })
})
