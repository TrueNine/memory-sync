import type { InputEffectContext } from './AbstractInputPlugin'
import type { ILogger } from '@/log'
import type { PluginOptions } from '@/types'

import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import * as fc from 'fast-check'
import * as glob from 'fast-glob'
import { describe, expect, it } from 'vitest'
import { OrphanFileCleanupEffectInputPlugin } from './OrphanFileCleanupEffectInputPlugin'

/**
 * Feature: effect-input-plugins
 * Property-based tests for OrphanFileCleanupEffectInputPlugin
 *
 * Property 5: Orphan .md file deletion
 * For any .md file in dist/skills/, dist/commands/, dist/agents/, or dist/app/,
 * if no corresponding source file exists according to the mapping rules,
 * the file should be deleted after OrphanFileCleanupEffectInputPlugin executes.
 *
 * Property 7: Empty directory cleanup
 * For any directory in dist/ that becomes empty after orphan file deletion,
 * the directory should be removed by OrphanFileCleanupEffectInputPlugin.
 *
 * Validates: Requirements 2.2, 2.3, 2.4, 2.5, 2.7
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
const validNameGen = fc.string({ minLength: 1, maxLength: 20, unit: 'grapheme-ascii' })
  .filter((s) => /^[\w-]+$/.test(s))
  .map((s) => s.toLowerCase())

const dirTypeGen = fc.constantFrom('skills', 'commands', 'agents', 'app')

// Generate a dist file structure with orphan and valid files
interface DistFile {
  name: string
  dirType: 'skills' | 'commands' | 'agents' | 'app'
  hasSource: boolean
}

const distFileGen: fc.Arbitrary<DistFile> = fc.record({
  name: validNameGen,
  dirType: dirTypeGen,
  hasSource: fc.boolean(),
})

describe('orphanFileCleanupEffectInputPlugin Property Tests', () => {
  /**
   * Feature: effect-input-plugins, Property 5: Orphan .md file deletion
   * Validates: Requirements 2.2, 2.3, 2.4, 2.5
   *
   * For any .md file in dist/skills/, dist/commands/, dist/agents/, or dist/app/,
   * if no corresponding source file exists according to the mapping rules,
   * the file should be deleted after OrphanFileCleanupEffectInputPlugin executes.
   */
  describe('property 5: Orphan .md file deletion', () => {
    it('should delete orphan .md files and keep files with valid sources', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(distFileGen, { minLength: 1, maxLength: 10 })
            .map((files) => {
              // Deduplicate by (name, dirType) to avoid conflicts
              const seen = new Set<string>()
              return files.filter((f) => {
                const key = `${f.dirType}:${f.name}`
                if (seen.has(key)) {
                  return false
                }
                seen.add(key)
                return true
              })
            })
            .filter((files) => files.length > 0),
          async (distFiles) => {
            // Create isolated temp directory for this property run
            const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orphan-cleanup-p5-'))

            try {
              // Setup: Create shadow project structure
              const shadowProjectDir = path.join(tempDir, 'shadow')
              const distDir = path.join(shadowProjectDir, 'dist')
              const srcDir = path.join(shadowProjectDir, 'src')
              const appDir = path.join(shadowProjectDir, 'app')

              // Create directories
              fs.mkdirSync(distDir, { recursive: true })
              fs.mkdirSync(srcDir, { recursive: true })
              fs.mkdirSync(appDir, { recursive: true })

              // Track expected outcomes
              const expectedDeleted: string[] = []
              const expectedKept: string[] = []

              // Create dist files and optionally their sources
              for (const file of distFiles) {
                const distTypePath = path.join(distDir, file.dirType)
                fs.mkdirSync(distTypePath, { recursive: true })

                const distFilePath = path.join(distTypePath, `${file.name}.md`)
                fs.writeFileSync(distFilePath, `# ${file.name}`, 'utf-8')

                if (file.hasSource) {
                  // Create corresponding source file
                  createSourceFile(shadowProjectDir, file.dirType, file.name)
                  expectedKept.push(distFilePath)
                } else {
                  expectedDeleted.push(distFilePath)
                }
              }

              // Execute plugin
              const plugin = new OrphanFileCleanupEffectInputPlugin()
              const ctx = createEffectContext(tempDir, shadowProjectDir, false)
              const effectMethod = (plugin as any).cleanupOrphanFiles.bind(plugin)
              const result = await effectMethod(ctx)

              // Verify: Orphan files should be deleted
              for (const filePath of expectedDeleted) {
                expect(fs.existsSync(filePath)).toBe(false)
                expect(result.deletedFiles).toContain(filePath)
              }

              // Verify: Files with sources should be kept
              for (const filePath of expectedKept) {
                expect(fs.existsSync(filePath)).toBe(true)
                expect(result.deletedFiles).not.toContain(filePath)
              }
            } finally {
              // Cleanup
              if (fs.existsSync(tempDir)) {
                fs.rmSync(tempDir, { recursive: true, force: true })
              }
            }
          },
        ),
        { numRuns: 100 },
      )
    })
  })

  /**
   * Feature: effect-input-plugins, Property 7: Empty directory cleanup
   * Validates: Requirements 2.7
   *
   * For any directory in dist/ that becomes empty after orphan file deletion,
   * the directory should be removed by OrphanFileCleanupEffectInputPlugin.
   */
  describe('property 7: Empty directory cleanup', () => {
    it('should remove directories that become empty after orphan deletion', async () => {
      await fc.assert(
        fc.asyncProperty(
          validNameGen,
          dirTypeGen,
          async (name, dirType) => {
            // Create isolated temp directory for this property run
            const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orphan-cleanup-p7-'))

            try {
              // Setup: Create shadow project with orphan file in subdirectory
              const shadowProjectDir = path.join(tempDir, 'shadow')
              const distDir = path.join(shadowProjectDir, 'dist')
              const distTypeDir = path.join(distDir, dirType)
              const subDir = path.join(distTypeDir, 'subdir')

              fs.mkdirSync(subDir, { recursive: true })

              // Create orphan file in subdirectory (no source)
              const orphanFilePath = path.join(subDir, `${name}.md`)
              fs.writeFileSync(orphanFilePath, `# ${name}`, 'utf-8')

              // Verify setup: subdirectory exists with file
              expect(fs.existsSync(subDir)).toBe(true)
              expect(fs.existsSync(orphanFilePath)).toBe(true)

              // Execute plugin
              const plugin = new OrphanFileCleanupEffectInputPlugin()
              const ctx = createEffectContext(tempDir, shadowProjectDir, false)
              const effectMethod = (plugin as any).cleanupOrphanFiles.bind(plugin)
              const result = await effectMethod(ctx)

              // Verify: Orphan file should be deleted
              expect(fs.existsSync(orphanFilePath)).toBe(false)
              expect(result.deletedFiles).toContain(orphanFilePath)

              // Verify: Empty subdirectory should be removed
              expect(fs.existsSync(subDir)).toBe(false)
              expect(result.deletedDirs).toContain(subDir)
            } finally {
              // Cleanup
              if (fs.existsSync(tempDir)) {
                fs.rmSync(tempDir, { recursive: true, force: true })
              }
            }
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should not remove directories that still contain files', async () => {
      await fc.assert(
        fc.asyncProperty(
          validNameGen,
          validNameGen,
          async (orphanName, validName) => {
            // Ensure different names
            if (orphanName === validName) {
              return
            }

            // Create isolated temp directory for this property run
            const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orphan-cleanup-p7b-'))

            try {
              // Setup: Create shadow project with both orphan and valid files
              const shadowProjectDir = path.join(tempDir, 'shadow')
              const distSkillsDir = path.join(shadowProjectDir, 'dist', 'skills')
              const srcSkillsDir = path.join(shadowProjectDir, 'src', 'skills')

              fs.mkdirSync(distSkillsDir, { recursive: true })
              fs.mkdirSync(srcSkillsDir, { recursive: true })

              // Create orphan file (no source)
              const orphanFilePath = path.join(distSkillsDir, `${orphanName}.md`)
              fs.writeFileSync(orphanFilePath, `# ${orphanName}`, 'utf-8')

              // Create valid file with source
              const validFilePath = path.join(distSkillsDir, `${validName}.md`)
              fs.writeFileSync(validFilePath, `# ${validName}`, 'utf-8')

              // Create source for valid file
              const srcSkillDir = path.join(srcSkillsDir, validName)
              fs.mkdirSync(srcSkillDir, { recursive: true })
              fs.writeFileSync(path.join(srcSkillDir, 'SKILL.cn.mdx'), `# ${validName}`, 'utf-8')

              // Execute plugin
              const plugin = new OrphanFileCleanupEffectInputPlugin()
              const ctx = createEffectContext(tempDir, shadowProjectDir, false)
              const effectMethod = (plugin as any).cleanupOrphanFiles.bind(plugin)
              await effectMethod(ctx)

              // Verify: Orphan file deleted, valid file kept
              expect(fs.existsSync(orphanFilePath)).toBe(false)
              expect(fs.existsSync(validFilePath)).toBe(true)

              // Verify: Directory should NOT be removed (still has valid file)
              expect(fs.existsSync(distSkillsDir)).toBe(true)
            } finally {
              // Cleanup
              if (fs.existsSync(tempDir)) {
                fs.rmSync(tempDir, { recursive: true, force: true })
              }
            }
          },
        ),
        { numRuns: 100 },
      )
    })
  })
})

/**
 * Helper function to create source file based on directory type and mapping rules.
 */
function createSourceFile(
  shadowProjectDir: string,
  dirType: 'skills' | 'commands' | 'agents' | 'app',
  name: string,
): void {
  switch (dirType) {
    case 'skills': {
      // src/skills/{name}/SKILL.cn.mdx
      const skillDir = path.join(shadowProjectDir, 'src', 'skills', name)
      fs.mkdirSync(skillDir, { recursive: true })
      fs.writeFileSync(path.join(skillDir, 'SKILL.cn.mdx'), `# ${name}`, 'utf-8')
      break
    }
    case 'commands': {
      // src/commands/{name}.cn.mdx
      const commandsDir = path.join(shadowProjectDir, 'src', 'commands')
      fs.mkdirSync(commandsDir, { recursive: true })
      fs.writeFileSync(path.join(commandsDir, `${name}.cn.mdx`), `# ${name}`, 'utf-8')
      break
    }
    case 'agents': {
      // src/agents/{name}.cn.mdx
      const agentsDir = path.join(shadowProjectDir, 'src', 'agents')
      fs.mkdirSync(agentsDir, { recursive: true })
      fs.writeFileSync(path.join(agentsDir, `${name}.cn.mdx`), `# ${name}`, 'utf-8')
      break
    }
    case 'app': {
      // app/{name}.cn.mdx
      const appDir = path.join(shadowProjectDir, 'app')
      fs.mkdirSync(appDir, { recursive: true })
      fs.writeFileSync(path.join(appDir, `${name}.cn.mdx`), `# ${name}`, 'utf-8')
      break
    }
  }
}
