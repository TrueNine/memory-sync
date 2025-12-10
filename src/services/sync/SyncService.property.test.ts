import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fc from 'fast-check'
import path from 'node:path'
import fs from 'fs-extra'
import os from 'node:os'
import { SyncService } from './SyncService'

/**
 * Property tests for SyncService cleanTarget behavior
 *
 * **Feature: sync-exclude-support, Property 1: CleanTarget removes existing files**
 * **Feature: sync-exclude-support, Property 2: CleanTarget disabled preserves existing files**
 * **Validates: Requirements 1.1, 1.2**
 */
describe('SyncService cleanTarget property tests', () => {
  let service: SyncService

  beforeEach(() => {
    service = new SyncService()
  })

  // Generator for valid file names (alphanumeric, no special chars)
  const fileNameArb = fc
    .stringMatching(/^[a-zA-Z][a-zA-Z0-9_-]{0,10}$/)
    .filter((s) => s.length > 0)

  // Generator for file extensions
  const extensionArb = fc.constantFrom('.txt', '.md', '.json', '.ts', '.js')

  // Generator for file content
  const contentArb = fc.string({ minLength: 1, maxLength: 100 })

  // Helper to create isolated test directory for each property iteration
  async function withTestDir<T>(fn: (testDir: string) => Promise<T>): Promise<T> {
    const testDir = path.join(
      os.tmpdir(),
      `sync-cleantarget-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    )
    await fs.ensureDir(testDir)
    try {
      return await fn(testDir)
    } finally {
      await fs.remove(testDir)
    }
  }

  /**
   * **Feature: sync-exclude-support, Property 1: CleanTarget removes existing files**
   * **Validates: Requirements 1.1**
   *
   * For any target directory with existing files, when sync executes with
   * cleanTarget=true, the resulting directory SHALL contain only the newly
   * synced files and none of the pre-existing files.
   */
  describe('Property 1: CleanTarget removes existing files', () => {
    it('should remove all pre-existing files when cleanTarget is true', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            existingFileCount: fc.integer({ min: 1, max: 5 }),
            newFileCount: fc.integer({ min: 1, max: 5 }),
          }),
          async ({ existingFileCount, newFileCount }) => {
            await withTestDir(async (testDir) => {
              const sourceDir = path.join(testDir, 'source')
              const targetDir = path.join(testDir, 'target')
              await fs.ensureDir(sourceDir)
              await fs.ensureDir(targetDir)

              // Create pre-existing files in target
              const existingFiles: string[] = []
              for (let i = 0; i < existingFileCount; i++) {
                const fileName = `existing_${i}.txt`
                const filePath = path.join(targetDir, fileName)
                await fs.writeFile(filePath, `existing content ${i}`)
                existingFiles.push(fileName)
              }

              // Create new files in source
              const newFiles: string[] = []
              for (let i = 0; i < newFileCount; i++) {
                const fileName = `new_${i}.txt`
                const filePath = path.join(sourceDir, fileName)
                await fs.writeFile(filePath, `new content ${i}`)
                newFiles.push(fileName)
              }

              // Sync with cleanTarget=true
              await service.syncDirectory({
                source: sourceDir,
                target: targetDir,
                cleanTarget: true,
              })

              // Verify: pre-existing files should NOT exist
              for (const fileName of existingFiles) {
                const filePath = path.join(targetDir, fileName)
                expect(await fs.pathExists(filePath)).toBe(false)
              }

              // Verify: new files should exist
              for (const fileName of newFiles) {
                const filePath = path.join(targetDir, fileName)
                expect(await fs.pathExists(filePath)).toBe(true)
              }
            })
          },
        ),
        { numRuns: 100 },
      )
    })


    it('should result in target containing only synced files', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(
            fc.array(fileNameArb, { minLength: 1, maxLength: 3 }),
            fc.array(fileNameArb, { minLength: 1, maxLength: 3 }),
            extensionArb,
          ),
          async ([existingNames, newNames, ext]) => {
            await withTestDir(async (testDir) => {
              const sourceDir = path.join(testDir, 'source')
              const targetDir = path.join(testDir, 'target')
              await fs.ensureDir(sourceDir)
              await fs.ensureDir(targetDir)

              // Create pre-existing files with unique names (case-insensitive dedup for Windows)
              const existingFiles = new Set<string>()
              const existingFilesLower = new Set<string>()
              for (const name of existingNames) {
                const fileName = `existing_${name}${ext}`
                const fileNameLower = fileName.toLowerCase()
                if (!existingFilesLower.has(fileNameLower)) {
                  await fs.writeFile(path.join(targetDir, fileName), 'existing')
                  existingFiles.add(fileName)
                  existingFilesLower.add(fileNameLower)
                }
              }

              // Create new files with unique names (case-insensitive dedup for Windows)
              const newFiles = new Set<string>()
              const newFilesLower = new Set<string>()
              for (const name of newNames) {
                const fileName = `new_${name}${ext}`
                const fileNameLower = fileName.toLowerCase()
                if (!newFilesLower.has(fileNameLower)) {
                  await fs.writeFile(path.join(sourceDir, fileName), 'new')
                  newFiles.add(fileName)
                  newFilesLower.add(fileNameLower)
                }
              }

              // Sync with cleanTarget=true
              await service.syncDirectory({
                source: sourceDir,
                target: targetDir,
                cleanTarget: true,
              })

              // Get all files in target after sync
              const targetFiles = await fs.readdir(targetDir)
              const targetFileSet = new Set(targetFiles)

              // Target should contain exactly the new files
              expect(targetFileSet.size).toBe(newFiles.size)
              for (const fileName of newFiles) {
                expect(targetFileSet.has(fileName)).toBe(true)
              }

              // Target should NOT contain any existing files (unless they overlap with new)
              for (const fileName of existingFiles) {
                if (!newFiles.has(fileName)) {
                  expect(targetFileSet.has(fileName)).toBe(false)
                }
              }
            })
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should handle nested directory structures', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 3 }),
          async (depth) => {
            await withTestDir(async (testDir) => {
              const sourceDir = path.join(testDir, 'source')
              const targetDir = path.join(testDir, 'target')
              await fs.ensureDir(sourceDir)
              await fs.ensureDir(targetDir)

              // Create nested existing file in target
              let existingPath = targetDir
              for (let i = 0; i < depth; i++) {
                existingPath = path.join(existingPath, `existing_dir_${i}`)
              }
              await fs.ensureDir(existingPath)
              const existingFile = path.join(existingPath, 'existing.txt')
              await fs.writeFile(existingFile, 'existing content')

              // Create nested new file in source
              let newPath = sourceDir
              for (let i = 0; i < depth; i++) {
                newPath = path.join(newPath, `new_dir_${i}`)
              }
              await fs.ensureDir(newPath)
              const newFile = path.join(newPath, 'new.txt')
              await fs.writeFile(newFile, 'new content')

              // Sync with cleanTarget=true
              await service.syncDirectory({
                source: sourceDir,
                target: targetDir,
                cleanTarget: true,
              })

              // Verify existing nested structure is removed
              const existingRelPath = path.relative(targetDir, existingFile)
              expect(await fs.pathExists(path.join(targetDir, existingRelPath))).toBe(false)

              // Verify new nested structure exists
              const newRelPath = path.relative(sourceDir, newFile)
              expect(await fs.pathExists(path.join(targetDir, newRelPath))).toBe(true)
            })
          },
        ),
        { numRuns: 100 },
      )
    })
  })


  /**
   * **Feature: sync-exclude-support, Property 2: CleanTarget disabled preserves existing files**
   * **Validates: Requirements 1.2**
   *
   * For any target directory with existing files, when sync executes with
   * cleanTarget=false, the resulting directory SHALL contain both the
   * pre-existing files and the newly synced files.
   */
  describe('Property 2: CleanTarget disabled preserves existing files', () => {
    it('should preserve all pre-existing files when cleanTarget is false', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            existingFileCount: fc.integer({ min: 1, max: 5 }),
            newFileCount: fc.integer({ min: 1, max: 5 }),
          }),
          async ({ existingFileCount, newFileCount }) => {
            await withTestDir(async (testDir) => {
              const sourceDir = path.join(testDir, 'source')
              const targetDir = path.join(testDir, 'target')
              await fs.ensureDir(sourceDir)
              await fs.ensureDir(targetDir)

              // Create pre-existing files in target
              const existingFiles: string[] = []
              for (let i = 0; i < existingFileCount; i++) {
                const fileName = `existing_${i}.txt`
                const filePath = path.join(targetDir, fileName)
                await fs.writeFile(filePath, `existing content ${i}`)
                existingFiles.push(fileName)
              }

              // Create new files in source
              const newFiles: string[] = []
              for (let i = 0; i < newFileCount; i++) {
                const fileName = `new_${i}.txt`
                const filePath = path.join(sourceDir, fileName)
                await fs.writeFile(filePath, `new content ${i}`)
                newFiles.push(fileName)
              }

              // Sync with cleanTarget=false
              await service.syncDirectory({
                source: sourceDir,
                target: targetDir,
                cleanTarget: false,
              })

              // Verify: pre-existing files should still exist
              for (const fileName of existingFiles) {
                const filePath = path.join(targetDir, fileName)
                expect(await fs.pathExists(filePath)).toBe(true)
              }

              // Verify: new files should also exist
              for (const fileName of newFiles) {
                const filePath = path.join(targetDir, fileName)
                expect(await fs.pathExists(filePath)).toBe(true)
              }
            })
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should result in target containing both existing and new files', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(
            fc.array(fileNameArb, { minLength: 1, maxLength: 3 }),
            fc.array(fileNameArb, { minLength: 1, maxLength: 3 }),
            extensionArb,
          ),
          async ([existingNames, newNames, ext]) => {
            await withTestDir(async (testDir) => {
              const sourceDir = path.join(testDir, 'source')
              const targetDir = path.join(testDir, 'target')
              await fs.ensureDir(sourceDir)
              await fs.ensureDir(targetDir)

              // Create pre-existing files with unique names (case-insensitive dedup for Windows)
              const existingFiles = new Set<string>()
              const existingFilesLower = new Set<string>()
              for (const name of existingNames) {
                const fileName = `existing_${name}${ext}`
                const fileNameLower = fileName.toLowerCase()
                if (!existingFilesLower.has(fileNameLower)) {
                  await fs.writeFile(path.join(targetDir, fileName), 'existing')
                  existingFiles.add(fileName)
                  existingFilesLower.add(fileNameLower)
                }
              }

              // Create new files with unique names (case-insensitive dedup for Windows)
              const newFiles = new Set<string>()
              const newFilesLower = new Set<string>()
              for (const name of newNames) {
                const fileName = `new_${name}${ext}`
                const fileNameLower = fileName.toLowerCase()
                if (!newFilesLower.has(fileNameLower)) {
                  await fs.writeFile(path.join(sourceDir, fileName), 'new')
                  newFiles.add(fileName)
                  newFilesLower.add(fileNameLower)
                }
              }

              // Sync with cleanTarget=false
              await service.syncDirectory({
                source: sourceDir,
                target: targetDir,
                cleanTarget: false,
              })

              // Get all files in target after sync
              const targetFiles = await fs.readdir(targetDir)
              const targetFileSet = new Set(targetFiles)

              // Target should contain all existing files
              for (const fileName of existingFiles) {
                expect(targetFileSet.has(fileName)).toBe(true)
              }

              // Target should contain all new files
              for (const fileName of newFiles) {
                expect(targetFileSet.has(fileName)).toBe(true)
              }

              // Total count should be union of both sets (case-insensitive for Windows)
              const allFilesLower = new Set([...existingFilesLower, ...newFilesLower])
              expect(targetFileSet.size).toBe(allFilesLower.size)
            })
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should preserve existing file content when cleanTarget is false', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(contentArb, contentArb),
          async ([existingContent, newContent]) => {
            await withTestDir(async (testDir) => {
              const sourceDir = path.join(testDir, 'source')
              const targetDir = path.join(testDir, 'target')
              await fs.ensureDir(sourceDir)
              await fs.ensureDir(targetDir)

              // Create existing file with specific content
              const existingFile = path.join(targetDir, 'existing.txt')
              await fs.writeFile(existingFile, existingContent)

              // Create new file in source
              const newFile = path.join(sourceDir, 'new.txt')
              await fs.writeFile(newFile, newContent)

              // Sync with cleanTarget=false
              await service.syncDirectory({
                source: sourceDir,
                target: targetDir,
                cleanTarget: false,
              })

              // Verify existing file content is preserved
              const readContent = await fs.readFile(existingFile, 'utf-8')
              expect(readContent).toBe(existingContent)

              // Verify new file has correct content
              const newFileInTarget = path.join(targetDir, 'new.txt')
              const newReadContent = await fs.readFile(newFileInTarget, 'utf-8')
              expect(newReadContent).toBe(newContent)
            })
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should handle nested directory structures', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 3 }),
          async (depth) => {
            await withTestDir(async (testDir) => {
              const sourceDir = path.join(testDir, 'source')
              const targetDir = path.join(testDir, 'target')
              await fs.ensureDir(sourceDir)
              await fs.ensureDir(targetDir)

              // Create nested existing file in target
              let existingPath = targetDir
              for (let i = 0; i < depth; i++) {
                existingPath = path.join(existingPath, `existing_dir_${i}`)
              }
              await fs.ensureDir(existingPath)
              const existingFile = path.join(existingPath, 'existing.txt')
              await fs.writeFile(existingFile, 'existing content')

              // Create nested new file in source
              let newPath = sourceDir
              for (let i = 0; i < depth; i++) {
                newPath = path.join(newPath, `new_dir_${i}`)
              }
              await fs.ensureDir(newPath)
              const newFile = path.join(newPath, 'new.txt')
              await fs.writeFile(newFile, 'new content')

              // Sync with cleanTarget=false
              await service.syncDirectory({
                source: sourceDir,
                target: targetDir,
                cleanTarget: false,
              })

              // Verify existing nested structure is preserved
              expect(await fs.pathExists(existingFile)).toBe(true)

              // Verify new nested structure exists
              const newRelPath = path.relative(sourceDir, newFile)
              expect(await fs.pathExists(path.join(targetDir, newRelPath))).toBe(true)
            })
          },
        ),
        { numRuns: 100 },
      )
    })
  })
})
