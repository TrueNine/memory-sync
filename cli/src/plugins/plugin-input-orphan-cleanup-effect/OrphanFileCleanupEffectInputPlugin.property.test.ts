import type {InputEffectContext} from '@truenine/plugin-input-shared'
import type {ILogger, PluginOptions} from '@truenine/plugin-shared'

import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import * as fc from 'fast-check'
import * as glob from 'fast-glob'
import {describe, expect, it} from 'vitest'
import {OrphanFileCleanupEffectInputPlugin} from './OrphanFileCleanupEffectInputPlugin'

/**
 * Feature: effect-input-plugins
 * Property-based tests for OrphanFileCleanupEffectInputPlugin
 *
 * Property 5: Orphan .mdx file deletion
 * For any .mdx file in dist/skills/, dist/commands/, dist/agents/, or dist/app/,
 * if no corresponding source file exists according to the mapping rules,
 * the file should be deleted after OrphanFileCleanupEffectInputPlugin executes.
 *
 * Property 7: Empty directory cleanup
 * For any directory in dist/ that becomes empty after orphan file deletion,
 * the directory should be removed by OrphanFileCleanupEffectInputPlugin.
 *
 * Validates: Requirements 2.2, 2.3, 2.4, 2.5, 2.7
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
}

const validNameGen = fc.string({minLength: 1, maxLength: 20, unit: 'grapheme-ascii'}) // Generators
  .filter(s => /^[\w-]+$/.test(s))
  .map(s => s.toLowerCase())

const dirTypeGen = fc.constantFrom('skills', 'commands', 'agents', 'app')

interface DistFile { // Generate a dist file structure with orphan and valid files
  name: string
  dirType: 'skills' | 'commands' | 'agents' | 'app'
  hasSource: boolean
}

const distFileGen: fc.Arbitrary<DistFile> = fc.record({name: validNameGen, dirType: dirTypeGen, hasSource: fc.boolean()})

describe('orphanFileCleanupEffectInputPlugin Property Tests', () => {
  describe('property 5: Orphan .mdx file deletion', () => {
    it('should delete orphan .mdx files and keep files with valid sources', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(distFileGen, {minLength: 1, maxLength: 10})
            .map(files => {
              const seen = new Set<string>() // Deduplicate by (name, dirType) to avoid conflicts
              return files.filter(f => {
                const key = `${f.dirType}:${f.name}`
                if (seen.has(key)) return false
                seen.add(key)
                return true
              })
            })
            .filter(files => files.length > 0),
          async distFiles => {
            const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orphan-cleanup-p5-')) // Create isolated temp directory for this property run

            try {
              const shadowProjectDir = path.join(tempDir, 'shadow') // Setup: Create shadow project structure
              const distDir = path.join(shadowProjectDir, 'dist')
              const srcDir = path.join(shadowProjectDir, 'src')
              const appDir = path.join(shadowProjectDir, 'app')

              fs.mkdirSync(distDir, {recursive: true}) // Create directories
              fs.mkdirSync(srcDir, {recursive: true})
              fs.mkdirSync(appDir, {recursive: true})

              const expectedDeleted: string[] = [] // Track expected outcomes
              const expectedKept: string[] = []

              for (const file of distFiles) { // Create dist files and optionally their sources
                const distTypePath = path.join(distDir, file.dirType)
                fs.mkdirSync(distTypePath, {recursive: true})

                const distFilePath = path.join(distTypePath, `${file.name}.mdx`)
                fs.writeFileSync(distFilePath, `# ${file.name}`, 'utf8')

                if (file.hasSource) {
                  createSourceFile(shadowProjectDir, file.dirType, file.name) // Create corresponding source file
                  expectedKept.push(distFilePath)
                } else expectedDeleted.push(distFilePath)
              }

              const plugin = new OrphanFileCleanupEffectInputPlugin() // Execute plugin
              const ctx = createEffectContext(tempDir, shadowProjectDir, false)
              const effectMethod = (plugin as any).cleanupOrphanFiles.bind(plugin)
              const result = await effectMethod(ctx)

              for (const filePath of expectedDeleted) { // Verify: Orphan files should be deleted
                expect(fs.existsSync(filePath)).toBe(false)
                expect(result.deletedFiles).toContain(filePath)
              }

              for (const filePath of expectedKept) { // Verify: Files with sources should be kept
                expect(fs.existsSync(filePath)).toBe(true)
                expect(result.deletedFiles).not.toContain(filePath)
              }
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

  describe('property 7: Empty directory cleanup', () => {
    it('should remove directories that become empty after orphan deletion', async () => {
      await fc.assert(
        fc.asyncProperty(
          validNameGen,
          dirTypeGen,
          async (name, dirType) => {
            const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orphan-cleanup-p7-')) // Create isolated temp directory for this property run

            try {
              const shadowProjectDir = path.join(tempDir, 'shadow') // Setup: Create shadow project with orphan file in subdirectory
              const distDir = path.join(shadowProjectDir, 'dist')
              const distTypeDir = path.join(distDir, dirType)
              const subDir = path.join(distTypeDir, 'subdir')

              fs.mkdirSync(subDir, {recursive: true})

              const orphanFilePath = path.join(subDir, `${name}.mdx`) // Create orphan file in subdirectory (no source)
              fs.writeFileSync(orphanFilePath, `# ${name}`, 'utf8')

              expect(fs.existsSync(subDir)).toBe(true) // Verify setup: subdirectory exists with file
              expect(fs.existsSync(orphanFilePath)).toBe(true)

              const plugin = new OrphanFileCleanupEffectInputPlugin() // Execute plugin
              const ctx = createEffectContext(tempDir, shadowProjectDir, false)
              const effectMethod = (plugin as any).cleanupOrphanFiles.bind(plugin)
              const result = await effectMethod(ctx)

              expect(fs.existsSync(orphanFilePath)).toBe(false) // Verify: Orphan file should be deleted
              expect(result.deletedFiles).toContain(orphanFilePath)

              expect(fs.existsSync(subDir)).toBe(false) // Verify: Empty subdirectory should be removed
              expect(result.deletedDirs).toContain(subDir)
            }
            finally {
              if (fs.existsSync(tempDir)) fs.rmSync(tempDir, {recursive: true, force: true}) // Cleanup
            }
          }
        ),
        {numRuns: 100}
      )
    })

    it('should not remove directories that still contain files', async () => {
      await fc.assert(
        fc.asyncProperty(
          validNameGen,
          validNameGen,
          async (orphanName, validName) => {
            if (orphanName === validName) return // Ensure different names

            const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orphan-cleanup-p7b-')) // Create isolated temp directory for this property run

            try {
              const shadowProjectDir = path.join(tempDir, 'shadow') // Setup: Create shadow project with both orphan and valid files
              const distSkillsDir = path.join(shadowProjectDir, 'dist', 'skills')
              const srcSkillsDir = path.join(shadowProjectDir, 'src', 'skills')

              fs.mkdirSync(distSkillsDir, {recursive: true})
              fs.mkdirSync(srcSkillsDir, {recursive: true})

              const orphanFilePath = path.join(distSkillsDir, `${orphanName}.mdx`) // Create orphan file (no source)
              fs.writeFileSync(orphanFilePath, `# ${orphanName}`, 'utf8')

              const validFilePath = path.join(distSkillsDir, `${validName}.mdx`) // Create valid file with source
              fs.writeFileSync(validFilePath, `# ${validName}`, 'utf8')

              const srcSkillDir = path.join(srcSkillsDir, validName) // Create source for valid file
              fs.mkdirSync(srcSkillDir, {recursive: true})
              fs.writeFileSync(path.join(srcSkillDir, 'SKILL.cn.mdx'), `# ${validName}`, 'utf8')

              const plugin = new OrphanFileCleanupEffectInputPlugin() // Execute plugin
              const ctx = createEffectContext(tempDir, shadowProjectDir, false)
              const effectMethod = (plugin as any).cleanupOrphanFiles.bind(plugin)
              await effectMethod(ctx)

              expect(fs.existsSync(orphanFilePath)).toBe(false) // Verify: Orphan file deleted, valid file kept
              expect(fs.existsSync(validFilePath)).toBe(true)

              expect(fs.existsSync(distSkillsDir)).toBe(true) // Verify: Directory should NOT be removed (still has valid file)
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

/**
 * Helper function to create source file based on directory type and mapping rules.
 */
function createSourceFile(
  shadowProjectDir: string,
  dirType: 'skills' | 'commands' | 'agents' | 'app',
  name: string
): void {
  switch (dirType) {
    case 'skills': {
      const skillDir = path.join(shadowProjectDir, 'src', 'skills', name) // src/skills/{name}/SKILL.cn.mdx
      fs.mkdirSync(skillDir, {recursive: true})
      fs.writeFileSync(path.join(skillDir, 'SKILL.cn.mdx'), `# ${name}`, 'utf8')
      break
    }
    case 'commands': {
      const commandsDir = path.join(shadowProjectDir, 'src', 'commands') // src/commands/{name}.cn.mdx
      fs.mkdirSync(commandsDir, {recursive: true})
      fs.writeFileSync(path.join(commandsDir, `${name}.cn.mdx`), `# ${name}`, 'utf8')
      break
    }
    case 'agents': {
      const agentsDir = path.join(shadowProjectDir, 'src', 'agents') // src/agents/{name}.cn.mdx
      fs.mkdirSync(agentsDir, {recursive: true})
      fs.writeFileSync(path.join(agentsDir, `${name}.cn.mdx`), `# ${name}`, 'utf8')
      break
    }
    case 'app': {
      const appDir = path.join(shadowProjectDir, 'app') // app/{name}.cn.mdx
      fs.mkdirSync(appDir, {recursive: true})
      fs.writeFileSync(path.join(appDir, `${name}.cn.mdx`), `# ${name}`, 'utf8')
      break
    }
  }
}
