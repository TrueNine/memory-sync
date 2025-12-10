import path from 'node:path'
import fs from 'fs-extra'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { YAML_FRONT_MATTER_KIRO_ALWAYS } from '../constants'
import { KiroPathBuilder, PathBuilder } from '../constants/paths'
import { kiroSteeringExportCore } from './kiroSteeringExport'

// Build paths using PathBuilder
const aindexPaths = PathBuilder.forProject('aindex')
const DIST_ROOT = aindexPaths.dist()
const KIRO_STEERING_GLOBAL_DIR = KiroPathBuilder.globalSteering()

/**
 * Unit tests for kiroSteeringExport
 * **Validates: Requirements 1.1, 1.4, 2.1**
 */
describe('kiroSteeringExportCore', () => {
  const sourcePath = path.join(DIST_ROOT, 'GLOBAL.md')
  const targetPath = path.join(KIRO_STEERING_GLOBAL_DIR, 'GLOBAL.md')

  beforeEach(async () => {
    // Clean up and ensure directory exists for test isolation
    await fs.ensureDir(KIRO_STEERING_GLOBAL_DIR)
    await fs.remove(targetPath)
  })

  afterEach(async () => {
    // Restore mocks
    vi.restoreAllMocks()
  })

  describe('successful export with valid source file', () => {
    it('should return true when source file exists', async () => {
      // Ensure source file exists (it should exist in the dist folder)
      const sourceExists = await fs.pathExists(sourcePath)
      if (!sourceExists) {
        // Skip test if source doesn't exist in CI/test environment
        console.log('Skipping test: source file does not exist')
        return
      }

      const result = await kiroSteeringExportCore()
      expect(result).toBe(true)
    })

    it('should create target file with YAML front matter prepended', async () => {
      const sourceExists = await fs.pathExists(sourcePath)
      if (!sourceExists) {
        console.log('Skipping test: source file does not exist')
        return
      }

      await kiroSteeringExportCore()

      const targetExists = await fs.pathExists(targetPath)
      expect(targetExists).toBe(true)

      const targetContent = await fs.readFile(targetPath, 'utf-8')
      expect(targetContent.startsWith(YAML_FRONT_MATTER_KIRO_ALWAYS)).toBe(true)
    })

    it('should preserve original content after front matter', async () => {
      const sourceExists = await fs.pathExists(sourcePath)
      if (!sourceExists) {
        console.log('Skipping test: source file does not exist')
        return
      }

      const originalContent = await fs.readFile(sourcePath, 'utf-8')
      await kiroSteeringExportCore()

      const targetContent = await fs.readFile(targetPath, 'utf-8')
      const contentAfterFrontMatter = targetContent.slice(YAML_FRONT_MATTER_KIRO_ALWAYS.length)

      expect(contentAfterFrontMatter).toBe(originalContent)
    })
  })

  describe('error handling when source file is missing', () => {
    it('should return false when source file does not exist', async () => {
      // Mock pathExists to return false
      const pathExistsMock = vi.spyOn(fs, 'pathExists').mockResolvedValue(false as never)

      const result = await kiroSteeringExportCore()

      expect(result).toBe(false)
      pathExistsMock.mockRestore()
    })
  })

  describe('directory creation when target does not exist', () => {
    it('should create target directory if it does not exist', async () => {
      const sourceExists = await fs.pathExists(sourcePath)
      if (!sourceExists) {
        console.log('Skipping test: source file does not exist')
        return
      }

      // Remove target directory if it exists
      await fs.remove(KIRO_STEERING_GLOBAL_DIR)

      const result = await kiroSteeringExportCore()

      expect(result).toBe(true)
      const dirExists = await fs.pathExists(KIRO_STEERING_GLOBAL_DIR)
      expect(dirExists).toBe(true)
    })
  })
})
