import type {ILogger} from '@/log'
import type {PluginOptions} from '@/types/PluginTypes'

import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import * as fc from 'fast-check'
import * as glob from 'fast-glob'
import {describe, expect, it} from 'vitest'

/**
 * Feature: effect-input-plugins
 * Property-based tests for dry-run behavior across all Effect Input Plugins
 *
 * Property 4: Dry-run no-op
 * For any Effect Input Plugin running in dry-run mode, the filesystem state
 * (files and directories) should remain unchanged after execution.
 *
 * Validates: Requirements 1.5, 2.8, 3.5
 */

/**
 * Context provided to input effect handlers.
 * Duplicated here to avoid circular dependency issues.
 */
interface InputEffectContext {
  readonly logger: ILogger
  readonly fs: typeof import('node:fs')
  readonly path: typeof import('node:path')
  readonly glob: typeof import('fast-glob')
  readonly userConfigOptions: PluginOptions
  readonly workspaceDir: string
  readonly shadowProjectDir: string
  readonly dryRun?: boolean
}

function createMockLogger(): ILogger { // Test helpers
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

function createEffectContext(workspaceDir: string, shadowProjectDir: string, dryRun: boolean): InputEffectContext {
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

const validNameGen = fc.string({minLength: 1, maxLength: 20, unit: 'grapheme-ascii'}) // Generators
  .filter(s => /^[\w-]+$/.test(s))
  .map(s => s.toLowerCase())

const fileExtensionGen = fc.constantFrom('.ts', '.js', '.json', '.sh', '.txt', '.yaml', '.yml')

const fileContentGen = fc.string({minLength: 0, maxLength: 500})

const nonSrcMdFileNameGen = fc.tuple(validNameGen, fileExtensionGen) // Generate a non-.cn.mdx filename
  .map(([name, ext]) => `${name}${ext}`)
  .filter(name => !name.endsWith('.cn.mdx'))

const markdownWithWhitespaceGen = fc.array( // Generate markdown content with whitespace issues
  fc.tuple(
    fc.string({minLength: 0, maxLength: 50, unit: 'grapheme-ascii'}).filter(s => !s.includes('\n') && !s.includes('\r')),
    fc.array(fc.constantFrom(' ', '\t'), {minLength: 0, maxLength: 5}).map(arr => arr.join('')),
  ).map(([content, trailing]) => content + trailing),
  {minLength: 1, maxLength: 10},
).chain(lines =>
  fc.array(fc.integer({min: 0, max: 5}), {minLength: lines.length, maxLength: lines.length})
    .map(blankCounts => {
      const result: string[] = []
      for (let i = 0; i < lines.length; i++) {
        for (let j = 0; j < (blankCounts[i] ?? 0); j++) result.push('')
        result.push(lines[i])
      }
      return result.join('\n')
    }))

/**
 * Capture the complete filesystem state of a directory.
 * Returns a map of relative paths to their content (for files) or 'DIR' marker (for directories).
 */
function captureFilesystemState(baseDir: string): Map<string, string | 'DIR'> {
  const state = new Map<string, string | 'DIR'>()

  if (!fs.existsSync(baseDir)) return state

  function scanDir(dir: string, relativePath: string): void {
    const entries = fs.readdirSync(dir, {withFileTypes: true})
    for (const entry of entries) {
      const entryRelPath = relativePath ? path.join(relativePath, entry.name) : entry.name
      const entryFullPath = path.join(dir, entry.name)

      if (entry.isDirectory()) {
        state.set(entryRelPath, 'DIR')
        scanDir(entryFullPath, entryRelPath)
      } else if (entry.isFile()) state.set(entryRelPath, fs.readFileSync(entryFullPath, 'utf8'))
    }
  }

  scanDir(baseDir, '')
  return state
}

/**
 * Compare two filesystem states and return true if they are identical.
 */
function filesystemStatesEqual(before: Map<string, string | 'DIR'>, after: Map<string, string | 'DIR'>): boolean {
  if (before.size !== after.size) return false

  for (const [key, value] of before) {
    if (!after.has(key) || after.get(key) !== value) return false
  }

  return true
}

describe('effect Input Plugins Dry-Run Property Tests', () => {
  /**
   * Feature: effect-input-plugins, Property 4: Dry-run no-op
   * Validates: Requirements 1.5, 2.8, 3.5
   *
   * For any Effect Input Plugin running in dry-run mode, the filesystem state
   * (files and directories) should remain unchanged after execution.
   */
  describe('property 4: Dry-run no-op', () => {
    describe('skillNonSrcFileSyncEffectInputPlugin', () => {
      it('should not modify filesystem when running in dry-run mode', {timeout: 60000}, async () => {
        const {SkillNonSrcFileSyncEffectInputPlugin} = await import('./SkillNonSrcFileSyncEffectInputPlugin') // Dynamic import to avoid circular dependency

        await fc.assert(
          fc.asyncProperty(
            fc.array(
              fc.record({
                skillName: validNameGen,
                files: fc.array(
                  fc.record({name: nonSrcMdFileNameGen, content: fileContentGen}),
                  {minLength: 1, maxLength: 3},
                ).map(files => {
                  const seen = new Set<string>() // Deduplicate by name
                  return files.filter(f => {
                    if (seen.has(f.name)) return false
                    seen.add(f.name)
                    return true
                  })
                }).filter(files => files.length > 0),
              }),
              {minLength: 1, maxLength: 3},
            ).map(skills => {
              const seen = new Set<string>() // Deduplicate by skillName
              return skills.filter(s => {
                if (seen.has(s.skillName)) return false
                seen.add(s.skillName)
                return true
              })
            }).filter(skills => skills.length > 0),
            async skills => {
              const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dryrun-skill-sync-'))

              try {
                const shadowProjectDir = path.join(tempDir, 'shadow') // Setup: Create src/skills/ structure with files to sync
                const srcSkillsDir = path.join(shadowProjectDir, 'src', 'skills')

                for (const skill of skills) {
                  const skillDir = path.join(srcSkillsDir, skill.skillName)
                  fs.mkdirSync(skillDir, {recursive: true})

                  for (const file of skill.files) fs.writeFileSync(path.join(skillDir, file.name), file.content, 'utf8')
                }

                const stateBefore = captureFilesystemState(shadowProjectDir) // Capture filesystem state BEFORE dry-run

                const plugin = new SkillNonSrcFileSyncEffectInputPlugin() // Execute plugin in dry-run mode
                const ctx = createEffectContext(tempDir, shadowProjectDir, true)
                const effectMethod = (plugin as any).syncNonSrcFiles.bind(plugin)
                await effectMethod(ctx)

                const stateAfter = captureFilesystemState(shadowProjectDir) // Capture filesystem state AFTER dry-run

                expect(filesystemStatesEqual(stateBefore, stateAfter)).toBe(true) // Verify: Filesystem state should be unchanged
              }
              finally {
                if (fs.existsSync(tempDir)) fs.rmSync(tempDir, {recursive: true, force: true})
              }
            },
          ),
          {numRuns: 100},
        )
      })
    })

    describe('orphanFileCleanupEffectInputPlugin', () => {
      it('should not modify filesystem when running in dry-run mode', async () => {
        const {OrphanFileCleanupEffectInputPlugin} = await import('./OrphanFileCleanupEffectInputPlugin') // Dynamic import to avoid circular dependency

        await fc.assert(
          fc.asyncProperty(
            fc.array(
              fc.record({name: validNameGen, dirType: fc.constantFrom('skills', 'commands', 'agents', 'app')}),
              {minLength: 1, maxLength: 5},
            ).map(files => {
              const seen = new Set<string>() // Deduplicate by (name, dirType)
              return files.filter(f => {
                const key = `${f.dirType}:${f.name}`
                if (seen.has(key)) return false
                seen.add(key)
                return true
              })
            }).filter(files => files.length > 0),
            async orphanFiles => {
              const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dryrun-orphan-cleanup-'))

              try {
                const shadowProjectDir = path.join(tempDir, 'shadow') // Setup: Create dist/ structure with orphan files (no sources)
                const distDir = path.join(shadowProjectDir, 'dist')

                for (const file of orphanFiles) {
                  const distTypeDir = path.join(distDir, file.dirType)
                  fs.mkdirSync(distTypeDir, {recursive: true})
                  fs.writeFileSync(path.join(distTypeDir, `${file.name}.md`), `# ${file.name}`, 'utf8')
                }

                const stateBefore = captureFilesystemState(shadowProjectDir) // Capture filesystem state BEFORE dry-run

                const plugin = new OrphanFileCleanupEffectInputPlugin() // Execute plugin in dry-run mode
                const ctx = createEffectContext(tempDir, shadowProjectDir, true)
                const effectMethod = (plugin as any).cleanupOrphanFiles.bind(plugin)
                await effectMethod(ctx)

                const stateAfter = captureFilesystemState(shadowProjectDir) // Capture filesystem state AFTER dry-run

                expect(filesystemStatesEqual(stateBefore, stateAfter)).toBe(true) // Verify: Filesystem state should be unchanged
              }
              finally {
                if (fs.existsSync(tempDir)) fs.rmSync(tempDir, {recursive: true, force: true})
              }
            },
          ),
          {numRuns: 100},
        )
      })
    })

    describe('markdownWhitespaceCleanupEffectInputPlugin', () => {
      it('should not modify filesystem when running in dry-run mode', async () => {
        const {MarkdownWhitespaceCleanupEffectInputPlugin} = await import('./MarkdownWhitespaceCleanupEffectInputPlugin') // Dynamic import to avoid circular dependency

        await fc.assert(
          fc.asyncProperty(
            fc.array(
              fc.record({name: validNameGen, content: markdownWithWhitespaceGen, dir: fc.constantFrom('src', 'app', 'dist')}),
              {minLength: 1, maxLength: 5},
            ).map(files => {
              const seen = new Set<string>() // Deduplicate by (name, dir)
              return files.filter(f => {
                const key = `${f.dir}:${f.name}`
                if (seen.has(key)) return false
                seen.add(key)
                return true
              })
            }).filter(files => files.length > 0),
            async mdFiles => {
              const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dryrun-whitespace-cleanup-'))

              try {
                const shadowProjectDir = path.join(tempDir, 'shadow') // Setup: Create directories with markdown files containing whitespace issues

                for (const file of mdFiles) {
                  const targetDir = path.join(shadowProjectDir, file.dir)
                  fs.mkdirSync(targetDir, {recursive: true})
                  fs.writeFileSync(path.join(targetDir, `${file.name}.md`), file.content, 'utf8')
                }

                const stateBefore = captureFilesystemState(shadowProjectDir) // Capture filesystem state BEFORE dry-run

                const plugin = new MarkdownWhitespaceCleanupEffectInputPlugin() // Execute plugin in dry-run mode
                const ctx = createEffectContext(tempDir, shadowProjectDir, true)
                const effectMethod = (plugin as any).cleanupWhitespace.bind(plugin)
                await effectMethod(ctx)

                const stateAfter = captureFilesystemState(shadowProjectDir) // Capture filesystem state AFTER dry-run

                expect(filesystemStatesEqual(stateBefore, stateAfter)).toBe(true) // Verify: Filesystem state should be unchanged
              }
              finally {
                if (fs.existsSync(tempDir)) fs.rmSync(tempDir, {recursive: true, force: true})
              }
            },
          ),
          {numRuns: 100},
        )
      })
    })
  })
})
