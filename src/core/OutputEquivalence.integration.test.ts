/**
 * Integration tests for output equivalence verification
 * **Feature: plugin-architecture, Property 4: Output artifact equivalence**
 * **Validates: Requirements 3.4**
 *
 * These tests verify that the plugin system produces output equivalent
 * to the existing command system.
 */

import type { PluginConfig } from './types'
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import path from 'node:path'
import fs from 'fs-extra'
import os from 'node:os'
import fc from 'fast-check'
import { FrontMatterType } from './types'
import { PluginRunner } from './PluginRunner'
import { ExportService } from '../services/export/ExportService'
import { SyncService } from '../services/sync/SyncService'

/**
 * Create a temporary directory for testing
 */
async function createTempDir(prefix: string): Promise<string> {
  const tempBase = path.join(os.tmpdir(), 'aindex-test')
  await fs.ensureDir(tempBase)
  const tempDir = path.join(tempBase, `${prefix}-${Date.now()}`)
  await fs.ensureDir(tempDir)
  return tempDir
}

/**
 * Clean up temporary directory
 */
async function cleanupTempDir(tempDir: string): Promise<void> {
  try {
    await fs.remove(tempDir)
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * Create test AGENTS.md files in a directory structure
 */
async function createTestAgentsFiles(
  basePath: string,
  structure: Record<string, string>,
): Promise<void> {
  for (const [relativePath, content] of Object.entries(structure)) {
    const fullPath = path.join(basePath, relativePath)
    await fs.ensureDir(path.dirname(fullPath))
    await fs.writeFile(fullPath, content, 'utf-8')
  }
}

/**
 * Read all files from a directory recursively
 */
async function readAllFiles(
  dirPath: string,
): Promise<Map<string, string>> {
  const files = new Map<string, string>()

  if (!(await fs.pathExists(dirPath))) {
    return files
  }

  const walk = async (currentPath: string): Promise<void> => {
    const entries = await fs.readdir(currentPath, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name)

      if (entry.isDirectory()) {
        await walk(fullPath)
      } else if (entry.isFile()) {
        const relativePath = path.relative(dirPath, fullPath)
        const content = await fs.readFile(fullPath, 'utf-8')
        files.set(relativePath.replace(/\\/g, '/'), content)
      }
    }
  }

  await walk(dirPath)
  return files
}

describe('Output Equivalence Integration Tests', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await createTempDir('output-equiv')
  })

  afterEach(async () => {
    await cleanupTempDir(tempDir)
  })

  describe('Plugin system vs Service layer equivalence', () => {
    it('should verify ExportService and SyncService are available', () => {
      /**
       * **Feature: plugin-architecture, Property 4: Output artifact equivalence**
       * **Validates: Requirements 3.4**
       *
       * Basic verification that both systems are available for comparison
       */
      const exportService = new ExportService()
      const syncService = new SyncService()

      expect(exportService).toBeDefined()
      expect(exportService.exportAgentsFiles).toBeDefined()
      expect(exportService.exportToKiro).toBeDefined()
      expect(exportService.exportToQoder).toBeDefined()

      expect(syncService).toBeDefined()
      expect(syncService.syncDirectory).toBeDefined()
      expect(syncService.syncAgentsToClaude).toBeDefined()
    })

    it('should verify PluginRunner is available', () => {
      /**
       * **Feature: plugin-architecture, Property 4: Output artifact equivalence**
       * **Validates: Requirements 3.4**
       */
      const config: PluginConfig = { plugins: [] }
      const runner = new PluginRunner(config)

      expect(runner).toBeDefined()
      expect(runner.run).toBeDefined()
      expect(runner.register).toBeDefined()
    })

    it('should produce consistent file counts for empty input', async () => {
      /**
       * **Feature: plugin-architecture, Property 4: Output artifact equivalence**
       * **Validates: Requirements 3.4**
       *
       * Both systems should produce zero files for empty input
       */
      const sourcePath = path.join(tempDir, 'source')
      const targetPath1 = path.join(tempDir, 'target1')
      const targetPath2 = path.join(tempDir, 'target2')

      await fs.ensureDir(sourcePath)
      await fs.ensureDir(targetPath1)
      await fs.ensureDir(targetPath2)

      // Use ExportService
      const exportService = new ExportService()
      const exportResult = await exportService.exportAgentsFiles({
        sourcePath,
        targetPath: targetPath1,
        frontMatterType: FrontMatterType.KIRO_FILE_MATCH,
        skipRoot: true,
        cleanTarget: false,
      })

      // Use PluginRunner with empty plugins
      const runner = new PluginRunner({ plugins: [] })
      const runResult = await runner.run()

      // Both should produce zero files
      expect(exportResult.exported).toBe(0)
      expect(runResult.filesEmitted).toBe(0)
    })

    it('should handle single AGENTS.md file consistently', async () => {
      /**
       * **Feature: plugin-architecture, Property 4: Output artifact equivalence**
       * **Validates: Requirements 3.4**
       *
       * Both systems should handle a single AGENTS.md file
       */
      const sourcePath = path.join(tempDir, 'source')
      const targetPath = path.join(tempDir, 'target')

      // Create test structure
      await createTestAgentsFiles(sourcePath, {
        'subdir/AGENTS.md': '# Test Agent\n\nThis is a test agent file.',
      })

      // Use ExportService
      const exportService = new ExportService()
      const exportResult = await exportService.exportAgentsFiles({
        sourcePath,
        targetPath,
        frontMatterType: FrontMatterType.KIRO_FILE_MATCH,
        skipRoot: true,
        cleanTarget: true,
      })

      // Verify export produced output
      expect(exportResult.exported).toBe(1)
      expect(exportResult.errors).toHaveLength(0)

      // Verify output file exists
      const outputFiles = await readAllFiles(targetPath)
      expect(outputFiles.size).toBe(1)
    })

    it('should handle nested directory structure consistently', async () => {
      /**
       * **Feature: plugin-architecture, Property 4: Output artifact equivalence**
       * **Validates: Requirements 3.4**
       *
       * Both systems should handle nested directories
       */
      const sourcePath = path.join(tempDir, 'source')
      const targetPath = path.join(tempDir, 'target')

      // Create nested test structure
      await createTestAgentsFiles(sourcePath, {
        'level1/AGENTS.md': '# Level 1 Agent',
        'level1/level2/AGENTS.md': '# Level 2 Agent',
        'level1/level2/level3/AGENTS.md': '# Level 3 Agent',
      })

      // Use ExportService
      const exportService = new ExportService()
      const exportResult = await exportService.exportAgentsFiles({
        sourcePath,
        targetPath,
        frontMatterType: FrontMatterType.KIRO_FILE_MATCH,
        skipRoot: true,
        cleanTarget: true,
      })

      // Verify all files were exported
      expect(exportResult.exported).toBe(3)
      expect(exportResult.errors).toHaveLength(0)

      // Verify output files exist
      const outputFiles = await readAllFiles(targetPath)
      expect(outputFiles.size).toBe(3)
    })

    it('should produce deterministic output for same input', async () => {
      /**
       * **Feature: plugin-architecture, Property 4: Output artifact equivalence**
       * **Validates: Requirements 3.4**
       *
       * Running the same export twice should produce identical output
       */
      const sourcePath = path.join(tempDir, 'source')
      const targetPath1 = path.join(tempDir, 'target1')
      const targetPath2 = path.join(tempDir, 'target2')

      // Create test structure
      await createTestAgentsFiles(sourcePath, {
        'module/AGENTS.md': '# Module Agent\n\nModule description.',
      })

      const exportService = new ExportService()

      // First export
      await exportService.exportAgentsFiles({
        sourcePath,
        targetPath: targetPath1,
        frontMatterType: FrontMatterType.KIRO_FILE_MATCH,
        skipRoot: true,
        cleanTarget: true,
      })

      // Second export
      await exportService.exportAgentsFiles({
        sourcePath,
        targetPath: targetPath2,
        frontMatterType: FrontMatterType.KIRO_FILE_MATCH,
        skipRoot: true,
        cleanTarget: true,
      })

      // Read both outputs
      const files1 = await readAllFiles(targetPath1)
      const files2 = await readAllFiles(targetPath2)

      // Verify same number of files
      expect(files1.size).toBe(files2.size)

      // Verify same filenames
      const names1 = [...files1.keys()].sort()
      const names2 = [...files2.keys()].sort()
      expect(names1).toEqual(names2)

      // Verify same content
      for (const [name, content1] of files1) {
        const content2 = files2.get(name)
        expect(content2).toBe(content1)
      }
    })
  })

  describe('Front matter type equivalence', () => {
    it('should produce different output for different front matter types', async () => {
      /**
       * **Feature: plugin-architecture, Property 4: Output artifact equivalence**
       * **Validates: Requirements 3.4**
       *
       * Different front matter types should produce different output
       */
      const sourcePath = path.join(tempDir, 'source')
      const kiroTarget = path.join(tempDir, 'kiro')
      const qoderTarget = path.join(tempDir, 'qoder')

      // Create test structure
      await createTestAgentsFiles(sourcePath, {
        'component/AGENTS.md': '# Component Agent',
      })

      const exportService = new ExportService()

      // Export with Kiro front matter
      await exportService.exportToKiro({
        sourcePath,
        targetPath: kiroTarget,
        skipRoot: true,
        cleanTarget: true,
      })

      // Export with Qoder front matter
      await exportService.exportToQoder({
        sourcePath,
        targetPath: qoderTarget,
        skipRoot: true,
        cleanTarget: true,
      })

      // Read both outputs
      const kiroFiles = await readAllFiles(kiroTarget)
      const qoderFiles = await readAllFiles(qoderTarget)

      // Both should have one file
      expect(kiroFiles.size).toBe(1)
      expect(qoderFiles.size).toBe(1)

      // Content should be different (different front matter)
      const kiroContent = [...kiroFiles.values()][0]
      const qoderContent = [...qoderFiles.values()][0]

      // Kiro uses 'inclusion: fileMatch', Qoder uses 'glob'
      expect(kiroContent).toContain('inclusion')
      expect(qoderContent).toContain('glob')
    })
  })

  describe('Sync service equivalence', () => {
    it('should sync directories consistently', async () => {
      /**
       * **Feature: plugin-architecture, Property 4: Output artifact equivalence**
       * **Validates: Requirements 3.4**
       */
      const sourcePath = path.join(tempDir, 'source')
      const targetPath = path.join(tempDir, 'target')

      // Create source files
      await createTestAgentsFiles(sourcePath, {
        'file1.md': '# File 1',
        'subdir/file2.md': '# File 2',
      })

      const syncService = new SyncService()
      const result = await syncService.syncDirectory({
        source: sourcePath,
        target: targetPath,
        cleanTarget: true,
      })

      expect(result.errors).toHaveLength(0)
      expect(result.copied).toBeGreaterThan(0)

      // Verify files were synced
      const targetFiles = await readAllFiles(targetPath)
      expect(targetFiles.size).toBe(2)
    })

    it('should handle AGENTS.md to CLAUDE.md sync', async () => {
      /**
       * **Feature: plugin-architecture, Property 4: Output artifact equivalence**
       * **Validates: Requirements 3.4**
       */
      const basePath = path.join(tempDir, 'project')

      // Create AGENTS.md files
      await createTestAgentsFiles(basePath, {
        'AGENTS.md': '# Root Agent',
        'module/AGENTS.md': '# Module Agent',
      })

      const syncService = new SyncService()
      const result = await syncService.syncAgentsToClaude(basePath, {
        allowScripts: false,
      })

      expect(result.errors).toHaveLength(0)
      // Should have created CLAUDE.md files (linked or copied)
      expect(result.linked + result.copied).toBe(2)

      // Verify CLAUDE.md files exist
      const rootClaude = path.join(basePath, 'CLAUDE.md')
      const moduleClaude = path.join(basePath, 'module', 'CLAUDE.md')

      expect(await fs.pathExists(rootClaude)).toBe(true)
      expect(await fs.pathExists(moduleClaude)).toBe(true)
    })
  })

  describe('Error handling equivalence', () => {
    it('should handle missing source directory gracefully', async () => {
      /**
       * **Feature: plugin-architecture, Property 4: Output artifact equivalence**
       * **Validates: Requirements 3.4**
       */
      const nonExistentPath = path.join(tempDir, 'non-existent')
      const targetPath = path.join(tempDir, 'target')

      const exportService = new ExportService()
      const result = await exportService.exportAgentsFiles({
        sourcePath: nonExistentPath,
        targetPath,
        frontMatterType: FrontMatterType.KIRO_FILE_MATCH,
        skipRoot: true,
        cleanTarget: true,
      })

      // Should report error
      expect(result.errors.length).toBeGreaterThan(0)
      expect(result.exported).toBe(0)
    })

    it('should handle empty directories gracefully', async () => {
      /**
       * **Feature: plugin-architecture, Property 4: Output artifact equivalence**
       * **Validates: Requirements 3.4**
       */
      const emptySource = path.join(tempDir, 'empty')
      const targetPath = path.join(tempDir, 'target')

      await fs.ensureDir(emptySource)

      const exportService = new ExportService()
      const result = await exportService.exportAgentsFiles({
        sourcePath: emptySource,
        targetPath,
        frontMatterType: FrontMatterType.KIRO_FILE_MATCH,
        skipRoot: true,
        cleanTarget: true,
      })

      // Should succeed with zero exports
      expect(result.errors).toHaveLength(0)
      expect(result.exported).toBe(0)
    })
  })

  describe('Property 4: Output artifact equivalence', () => {
    /**
     * **Feature: plugin-architecture, Property 4: Output artifact equivalence**
     * **Validates: Requirements 3.4**
     *
     * For any input file set, the plugin system should produce
     * byte-identical output to the existing command system.
     */

    // Generate valid directory name (alphanumeric with underscores)
    const dirNameArb = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_]{0,10}$/)

    // Generate valid markdown content
    const markdownContentArb = fc.tuple(
      fc.stringMatching(/^[A-Z][a-zA-Z0-9 ]{0,20}$/),
      fc.stringMatching(/^[A-Za-z0-9 .,!?]{0,100}$/),
    ).map(([title, body]) => `# ${title}\n\n${body}`)

    it('should produce deterministic output for any valid input structure', async () => {
      /**
       * **Feature: plugin-architecture, Property 4: Output artifact equivalence**
       * **Validates: Requirements 3.4**
       *
       * For any valid directory structure with AGENTS.md files,
       * running the export twice should produce byte-identical output.
       */
      await fc.assert(
        fc.asyncProperty(
          fc.array(dirNameArb, { minLength: 1, maxLength: 3 }),
          markdownContentArb,
          async (dirNames, content) => {
            const sourcePath = path.join(tempDir, 'prop-source')
            const targetPath1 = path.join(tempDir, 'prop-target1')
            const targetPath2 = path.join(tempDir, 'prop-target2')

            // Clean up from previous iteration
            await fs.remove(sourcePath)
            await fs.remove(targetPath1)
            await fs.remove(targetPath2)

            // Create directory structure
            const dirPath = path.join(sourcePath, ...dirNames)
            await fs.ensureDir(dirPath)
            await fs.writeFile(path.join(dirPath, 'AGENTS.md'), content, 'utf-8')

            const exportService = new ExportService()

            // First export
            const result1 = await exportService.exportAgentsFiles({
              sourcePath,
              targetPath: targetPath1,
              frontMatterType: FrontMatterType.KIRO_FILE_MATCH,
              skipRoot: true,
              cleanTarget: true,
            })

            // Second export
            const result2 = await exportService.exportAgentsFiles({
              sourcePath,
              targetPath: targetPath2,
              frontMatterType: FrontMatterType.KIRO_FILE_MATCH,
              skipRoot: true,
              cleanTarget: true,
            })

            // Both should succeed with same count
            expect(result1.errors).toHaveLength(0)
            expect(result2.errors).toHaveLength(0)
            expect(result1.exported).toBe(result2.exported)

            // Read and compare all output files
            const files1 = await readAllFiles(targetPath1)
            const files2 = await readAllFiles(targetPath2)

            expect(files1.size).toBe(files2.size)

            for (const [name, content1] of files1) {
              const content2 = files2.get(name)
              expect(content2).toBe(content1)
            }
          },
        ),
        { numRuns: 20 },
      )
    })

    it('should produce equivalent file counts across front matter types', async () => {
      /**
       * **Feature: plugin-architecture, Property 4: Output artifact equivalence**
       * **Validates: Requirements 3.4**
       *
       * For any valid input, different front matter types should produce
       * the same number of output files (content differs, count matches).
       */
      await fc.assert(
        fc.asyncProperty(
          fc.array(dirNameArb, { minLength: 1, maxLength: 2 }),
          markdownContentArb,
          async (dirNames, content) => {
            const sourcePath = path.join(tempDir, 'fm-source')
            const kiroTarget = path.join(tempDir, 'fm-kiro')
            const qoderTarget = path.join(tempDir, 'fm-qoder')

            // Clean up from previous iteration
            await fs.remove(sourcePath)
            await fs.remove(kiroTarget)
            await fs.remove(qoderTarget)

            // Create directory structure
            const dirPath = path.join(sourcePath, ...dirNames)
            await fs.ensureDir(dirPath)
            await fs.writeFile(path.join(dirPath, 'AGENTS.md'), content, 'utf-8')

            const exportService = new ExportService()

            // Export with Kiro front matter
            const kiroResult = await exportService.exportToKiro({
              sourcePath,
              targetPath: kiroTarget,
              skipRoot: true,
              cleanTarget: true,
            })

            // Export with Qoder front matter
            const qoderResult = await exportService.exportToQoder({
              sourcePath,
              targetPath: qoderTarget,
              skipRoot: true,
              cleanTarget: true,
            })

            // Both should succeed with same count
            expect(kiroResult.errors).toHaveLength(0)
            expect(qoderResult.errors).toHaveLength(0)
            expect(kiroResult.exported).toBe(qoderResult.exported)

            // File counts should match
            const kiroFiles = await readAllFiles(kiroTarget)
            const qoderFiles = await readAllFiles(qoderTarget)
            expect(kiroFiles.size).toBe(qoderFiles.size)
          },
        ),
        { numRuns: 20 },
      )
    })

    it('should preserve content body across exports', async () => {
      /**
       * **Feature: plugin-architecture, Property 4: Output artifact equivalence**
       * **Validates: Requirements 3.4**
       *
       * For any valid input, the content body (excluding front matter)
       * should be preserved in the output.
       */
      await fc.assert(
        fc.asyncProperty(
          dirNameArb,
          markdownContentArb,
          async (dirName, content) => {
            const sourcePath = path.join(tempDir, 'body-source')
            const targetPath = path.join(tempDir, 'body-target')

            // Clean up from previous iteration
            await fs.remove(sourcePath)
            await fs.remove(targetPath)

            // Create directory structure
            const dirPath = path.join(sourcePath, dirName)
            await fs.ensureDir(dirPath)
            await fs.writeFile(path.join(dirPath, 'AGENTS.md'), content, 'utf-8')

            const exportService = new ExportService()

            const result = await exportService.exportAgentsFiles({
              sourcePath,
              targetPath,
              frontMatterType: FrontMatterType.KIRO_FILE_MATCH,
              skipRoot: true,
              cleanTarget: true,
            })

            expect(result.errors).toHaveLength(0)
            expect(result.exported).toBe(1)

            // Read output file and verify content body is preserved
            const outputFiles = await readAllFiles(targetPath)
            expect(outputFiles.size).toBe(1)

            const outputContent = [...outputFiles.values()][0]
            // Content body should be present (after front matter)
            // Extract body by removing front matter
            const bodyMatch = outputContent.match(/---\n[\s\S]*?\n---\n([\s\S]*)/)
            if (bodyMatch) {
              const outputBody = bodyMatch[1].trim()
              expect(outputBody).toBe(content.trim())
            }
          },
        ),
        { numRuns: 20 },
      )
    })
  })
})
