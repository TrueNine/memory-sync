import type { InputEffectContext } from './AbstractInputPlugin'
import type { ILogger } from '@/log'
import type { PluginOptions } from '@/types'

import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import * as fc from 'fast-check'
import * as glob from 'fast-glob'
import { describe, expect, it } from 'vitest'
import { SkillNonSrcFileSyncEffectInputPlugin } from './SkillNonSrcFileSyncEffectInputPlugin'

/**
 * Feature: effect-input-plugins
 * Property-based tests for SkillNonSrcFileSyncEffectInputPlugin
 *
 * Property 1: Non-.src.md file sync correctness
 * For any file in src/skills/{skill_name}/ that does not end with .src.md,
 * after the plugin executes, the file should exist at dist/skills/{skill_name}/{relative_path}
 * with identical content.
 *
 * Property 3: Identical content skip (Idempotence)
 * For any file that already exists at the destination with identical content to the source,
 * running the plugin should not modify the destination file.
 *
 * Validates: Requirements 1.2, 1.4
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
const validFileNameGen = fc.string({ minLength: 1, maxLength: 20, unit: 'grapheme-ascii' })
  .filter((s) => /^[\w-]+$/.test(s))
  .map((s) => s.toLowerCase())

const fileExtensionGen = fc.constantFrom('.ts', '.js', '.json', '.sh', '.txt', '.md', '.yaml', '.yml')

const fileContentGen = fc.string({ minLength: 0, maxLength: 1000 })

// Generate a non-.src.md filename
const nonSrcMdFileNameGen = fc.tuple(validFileNameGen, fileExtensionGen)
  .map(([name, ext]) => `${name}${ext}`)
  .filter((name) => !name.endsWith('.src.md'))

// Generate a .src.md filename
const srcMdFileNameGen = validFileNameGen.map((name) => `${name}.src.md`)

// Generate skill directory structure
interface SkillFile {
  relativePath: string
  content: string
  isSrcMd: boolean
}

interface SkillStructure {
  skillName: string
  files: SkillFile[]
}

const skillStructureGen: fc.Arbitrary<SkillStructure> = fc.record({
  skillName: validFileNameGen,
  files: fc.array(
    fc.oneof(
      // Non-.src.md files (should be synced)
      fc.record({
        relativePath: nonSrcMdFileNameGen,
        content: fileContentGen,
        isSrcMd: fc.constant(false),
      }),
      // .src.md files (should NOT be synced)
      fc.record({
        relativePath: srcMdFileNameGen,
        content: fileContentGen,
        isSrcMd: fc.constant(true),
      }),
    ),
    { minLength: 1, maxLength: 5 },
  ),
}).map((skill) => {
  // Deduplicate files by relativePath, keeping the first occurrence
  const seen = new Set<string>()
  const uniqueFiles = skill.files.filter((file) => {
    if (seen.has(file.relativePath)) {
      return false
    }
    seen.add(file.relativePath)
    return true
  })
  return { ...skill, files: uniqueFiles }
}).filter((skill) => skill.files.length > 0)

describe('skillNonSrcFileSyncEffectInputPlugin Property Tests', () => {
  /**
   * Feature: effect-input-plugins, Property 1: Non-.src.md file sync correctness
   * Validates: Requirements 1.2
   *
   * For any file in src/skills/{skill_name}/ that does not end with .src.md,
   * after the plugin executes, the file should exist at dist/skills/{skill_name}/{relative_path}
   * with identical content.
   */
  describe('property 1: Non-.src.md file sync correctness', () => {
    it('should sync all non-.src.md files from src/skills/ to dist/skills/ with identical content', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(skillStructureGen, { minLength: 1, maxLength: 3 }),
          async (skills) => {
            // Create isolated temp directory for this property run
            const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-sync-p1-'))

            try {
              // Setup: Create src/skills/ structure
              const shadowProjectDir = path.join(tempDir, 'shadow')
              const srcSkillsDir = path.join(shadowProjectDir, 'src', 'skills')
              const distSkillsDir = path.join(shadowProjectDir, 'dist', 'skills')

              // Create skill directories and files
              for (const skill of skills) {
                const skillDir = path.join(srcSkillsDir, skill.skillName)
                fs.mkdirSync(skillDir, { recursive: true })

                for (const file of skill.files) {
                  const filePath = path.join(skillDir, file.relativePath)
                  fs.mkdirSync(path.dirname(filePath), { recursive: true })
                  fs.writeFileSync(filePath, file.content, 'utf-8')
                }
              }

              // Execute plugin
              const plugin = new SkillNonSrcFileSyncEffectInputPlugin()
              const ctx = createEffectContext(tempDir, shadowProjectDir, false)
              const effectMethod = (plugin as any).syncNonSrcFiles.bind(plugin)
              await effectMethod(ctx)

              // Verify: All non-.src.md files should exist in dist with identical content
              for (const skill of skills) {
                for (const file of skill.files) {
                  const distPath = path.join(distSkillsDir, skill.skillName, file.relativePath)

                  if (file.isSrcMd) {
                    // .src.md files should NOT be synced
                    expect(fs.existsSync(distPath)).toBe(false)
                  } else {
                    // Non-.src.md files should be synced with identical content
                    expect(fs.existsSync(distPath)).toBe(true)
                    const distContent = fs.readFileSync(distPath, 'utf-8')
                    expect(distContent).toBe(file.content)
                  }
                }
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
   * Feature: effect-input-plugins, Property 3: Identical content skip (Idempotence)
   * Validates: Requirements 1.4
   *
   * For any file that already exists at the destination with identical content to the source,
   * running the plugin should not modify the destination file (file modification timestamp
   * should remain unchanged).
   */
  describe('property 3: Identical content skip (Idempotence)', () => {
    it('should skip files with identical content and not modify them', async () => {
      await fc.assert(
        fc.asyncProperty(
          skillStructureGen.filter((s) => s.files.some((f) => !f.isSrcMd)),
          async (skill) => {
            // Create isolated temp directory for this property run
            const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-sync-p3a-'))

            try {
              // Setup: Create src/skills/ and dist/skills/ with identical files
              const shadowProjectDir = path.join(tempDir, 'shadow')
              const srcSkillsDir = path.join(shadowProjectDir, 'src', 'skills')
              const distSkillsDir = path.join(shadowProjectDir, 'dist', 'skills')

              const skillSrcDir = path.join(srcSkillsDir, skill.skillName)
              const skillDistDir = path.join(distSkillsDir, skill.skillName)

              fs.mkdirSync(skillSrcDir, { recursive: true })
              fs.mkdirSync(skillDistDir, { recursive: true })

              const nonSrcMdFiles = skill.files.filter((f) => !f.isSrcMd)

              // Create source files and pre-existing dist files with identical content
              for (const file of nonSrcMdFiles) {
                const srcPath = path.join(skillSrcDir, file.relativePath)
                const distPath = path.join(skillDistDir, file.relativePath)

                fs.mkdirSync(path.dirname(srcPath), { recursive: true })
                fs.mkdirSync(path.dirname(distPath), { recursive: true })

                fs.writeFileSync(srcPath, file.content, 'utf-8')
                fs.writeFileSync(distPath, file.content, 'utf-8')
              }

              // Execute plugin
              const plugin = new SkillNonSrcFileSyncEffectInputPlugin()
              const ctx = createEffectContext(tempDir, shadowProjectDir, false)
              const effectMethod = (plugin as any).syncNonSrcFiles.bind(plugin)
              const result = await effectMethod(ctx)

              // Verify: Files with identical content should be in skippedFiles
              for (const file of nonSrcMdFiles) {
                const distPath = path.join(skillDistDir, file.relativePath)
                expect(result.skippedFiles).toContain(distPath)
                expect(result.copiedFiles).not.toContain(distPath)
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

    it('should be idempotent - running twice produces same result', async () => {
      await fc.assert(
        fc.asyncProperty(
          skillStructureGen.filter((s) => s.files.some((f) => !f.isSrcMd)),
          async (skill) => {
            // Create isolated temp directory for this property run
            const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-sync-p3b-'))

            try {
              // Setup
              const shadowProjectDir = path.join(tempDir, 'shadow')
              const srcSkillsDir = path.join(shadowProjectDir, 'src', 'skills')
              const distSkillsDir = path.join(shadowProjectDir, 'dist', 'skills')

              const skillSrcDir = path.join(srcSkillsDir, skill.skillName)
              fs.mkdirSync(skillSrcDir, { recursive: true })

              for (const file of skill.files) {
                const srcPath = path.join(skillSrcDir, file.relativePath)
                fs.mkdirSync(path.dirname(srcPath), { recursive: true })
                fs.writeFileSync(srcPath, file.content, 'utf-8')
              }

              // Execute plugin first time
              const plugin = new SkillNonSrcFileSyncEffectInputPlugin()
              const ctx = createEffectContext(tempDir, shadowProjectDir, false)
              const effectMethod = (plugin as any).syncNonSrcFiles.bind(plugin)
              await effectMethod(ctx)

              // Execute plugin second time
              const result2 = await effectMethod(ctx)

              // Verify: Second run should skip all files (idempotence)
              const nonSrcMdFiles = skill.files.filter((f) => !f.isSrcMd)
              expect(result2.copiedFiles.length).toBe(0)
              expect(result2.skippedFiles.length).toBe(nonSrcMdFiles.length)

              // Verify content is still identical
              for (const file of nonSrcMdFiles) {
                const srcPath = path.join(skillSrcDir, file.relativePath)
                const distPath = path.join(distSkillsDir, skill.skillName, file.relativePath)

                const srcContent = fs.readFileSync(srcPath, 'utf-8')
                const distContent = fs.readFileSync(distPath, 'utf-8')
                expect(distContent).toBe(srcContent)
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
})
