import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fc from 'fast-check'
import path from 'node:path'
import fs from 'fs-extra'
import os from 'node:os'
import { walkFiles, findAgentsFiles, matchesExcludePattern } from './fileWalker'

/**
 * Property tests for fileWalker module
 * Validates: Requirements 2.1, 2.2, 2.3, 4.2, 4.4
 */

describe('fileWalker property tests', () => {
  let testDir: string

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `filewalker-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    await fs.ensureDir(testDir)
  })

  afterEach(async () => {
    await fs.remove(testDir)
  })

  it('should return consistent results for same inputs (determinism)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          targetFileName: fc.constantFrom('AGENTS.md', 'CLAUDE.md', 'test.txt'),
          skipRoot: fc.boolean(),
          allowScripts: fc.boolean(),
        }),
        async (options) => {
          // Create test directory structure
          await fs.writeFile(path.join(testDir, options.targetFileName), 'root content')
          await fs.ensureDir(path.join(testDir, 'src'))
          await fs.writeFile(path.join(testDir, 'src', options.targetFileName), 'src content')
          await fs.ensureDir(path.join(testDir, 'lib'))
          await fs.writeFile(path.join(testDir, 'lib', options.targetFileName), 'lib content')

          // Run file walker twice with same options
          const result1 = await walkFiles({
            baseDir: testDir,
            targetFileName: options.targetFileName,
            skipRoot: options.skipRoot,
            allowScripts: options.allowScripts,
          })

          const result2 = await walkFiles({
            baseDir: testDir,
            targetFileName: options.targetFileName,
            skipRoot: options.skipRoot,
            allowScripts: options.allowScripts,
          })

          // Results should be identical
          expect(result1).toEqual(result2)

          // Results should be sorted
          const sorted = [...result1].sort()
          expect(result1).toEqual(sorted)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('should respect skipRoot option consistently', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('AGENTS.md', 'test.md'),
        async (fileName) => {
          // Create test files
          await fs.writeFile(path.join(testDir, fileName), 'root')
          await fs.ensureDir(path.join(testDir, 'sub'))
          await fs.writeFile(path.join(testDir, 'sub', fileName), 'sub')

          // With skipRoot=false, should include root file
          const withRoot = await walkFiles({
            baseDir: testDir,
            targetFileName: fileName,
            skipRoot: false,
          })

          // With skipRoot=true, should exclude root file
          const withoutRoot = await walkFiles({
            baseDir: testDir,
            targetFileName: fileName,
            skipRoot: true,
          })

          // Verify root file is included/excluded correctly
          const rootFile = path.join(testDir, fileName)
          expect(withRoot).toContain(rootFile)
          expect(withoutRoot).not.toContain(rootFile)

          // Both should contain the subdirectory file
          const subFile = path.join(testDir, 'sub', fileName)
          expect(withRoot).toContain(subFile)
          expect(withoutRoot).toContain(subFile)
        },
      ),
      { numRuns: 50 },
    )
  })

  it('should respect excludeDirs option consistently', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.constantFrom('node_modules', 'dist', 'build', '.git'), { minLength: 1, maxLength: 3 }),
        async (excludeDirs) => {
          // Create test structure with excluded directories
          await fs.writeFile(path.join(testDir, 'AGENTS.md'), 'root')

          for (const dir of excludeDirs) {
            await fs.ensureDir(path.join(testDir, dir))
            await fs.writeFile(path.join(testDir, dir, 'AGENTS.md'), `${dir} content`)
          }

          await fs.ensureDir(path.join(testDir, 'src'))
          await fs.writeFile(path.join(testDir, 'src', 'AGENTS.md'), 'src content')

          // Run with excludeDirs
          const result = await walkFiles({
            baseDir: testDir,
            targetFileName: 'AGENTS.md',
            excludeDirs,
          })

          // Should not contain files from excluded directories
          for (const dir of excludeDirs) {
            const excludedFile = path.join(testDir, dir, 'AGENTS.md')
            expect(result).not.toContain(excludedFile)
          }

          // Should contain files from non-excluded directories
          expect(result).toContain(path.join(testDir, 'AGENTS.md'))
          expect(result).toContain(path.join(testDir, 'src', 'AGENTS.md'))
        },
      ),
      { numRuns: 50 },
    )
  })

  it('should handle allowScripts option consistently', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.boolean(),
        async (allowScripts) => {
          // Create .scripts directory with AGENTS.md
          await fs.ensureDir(path.join(testDir, '.scripts'))
          await fs.writeFile(path.join(testDir, '.scripts', 'AGENTS.md'), 'scripts content')
          await fs.writeFile(path.join(testDir, 'AGENTS.md'), 'root content')

          const result = await walkFiles({
            baseDir: testDir,
            targetFileName: 'AGENTS.md',
            skipHidden: true,
            allowScripts,
          })

          const scriptsFile = path.join(testDir, '.scripts', 'AGENTS.md')

          if (allowScripts) {
            expect(result).toContain(scriptsFile)
          } else {
            expect(result).not.toContain(scriptsFile)
          }

          // Should always contain root file
          expect(result).toContain(path.join(testDir, 'AGENTS.md'))
        },
      ),
      { numRuns: 50 },
    )
  })

  it('should produce same results when called multiple times (idempotence)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          fileCount: fc.integer({ min: 1, max: 5 }),
          skipRoot: fc.boolean(),
        }),
        async ({ fileCount, skipRoot }) => {
          // Create multiple AGENTS.md files
          for (let i = 0; i < fileCount; i++) {
            const dir = path.join(testDir, `dir${i}`)
            await fs.ensureDir(dir)
            await fs.writeFile(path.join(dir, 'AGENTS.md'), `content ${i}`)
          }

          await fs.writeFile(path.join(testDir, 'AGENTS.md'), 'root')

          // Call multiple times
          const results = await Promise.all([
            walkFiles({ baseDir: testDir, targetFileName: 'AGENTS.md', skipRoot }),
            walkFiles({ baseDir: testDir, targetFileName: 'AGENTS.md', skipRoot }),
            walkFiles({ baseDir: testDir, targetFileName: 'AGENTS.md', skipRoot }),
          ])

          // All results should be identical
          expect(results[0]).toEqual(results[1])
          expect(results[1]).toEqual(results[2])
        },
      ),
      { numRuns: 50 },
    )
  })

  it('findAgentsFiles should be consistent with walkFiles', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          skipRoot: fc.boolean(),
          allowScripts: fc.boolean(),
        }),
        async (options) => {
          // Create test structure
          await fs.writeFile(path.join(testDir, 'AGENTS.md'), 'root')
          await fs.ensureDir(path.join(testDir, 'src'))
          await fs.writeFile(path.join(testDir, 'src', 'AGENTS.md'), 'src')
          await fs.ensureDir(path.join(testDir, '.scripts'))
          await fs.writeFile(path.join(testDir, '.scripts', 'AGENTS.md'), 'scripts')

          // Use both functions
          const findResult = await findAgentsFiles(testDir, options)
          const walkResult = await walkFiles({
            baseDir: testDir,
            targetFileName: 'AGENTS.md',
            skipRoot: options.skipRoot,
            allowScripts: options.allowScripts,
            skipHidden: true,
          })

          // Results should be identical
          expect(findResult).toEqual(walkResult)
        },
      ),
      { numRuns: 50 },
    )
  })
})

/**
 * **Feature: sync-exclude-support, Property 4: Empty exclude patterns sync all files**
 * **Validates: Requirements 2.4, 4.3**
 *
 * For any set of source files, when sync or export executes with empty or undefined
 * excludePatterns, the resulting target directory SHALL contain all source files
 * (subject to other filtering rules).
 */
describe('empty exclude patterns property tests', () => {
  // Generator for valid path segments (alphanumeric, no special glob chars)
  const pathSegmentArb = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_-]{0,10}$/)

  // Generator for file extensions
  const extensionArb = fc.constantFrom('.ts', '.js', '.md', '.json', '.txt')

  // Helper to create isolated test directory for each property iteration
  async function withTestDir<T>(fn: (testDir: string) => Promise<T>): Promise<T> {
    const testDir = path.join(os.tmpdir(), `empty-exclude-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    await fs.ensureDir(testDir)
    try {
      return await fn(testDir)
    } finally {
      await fs.remove(testDir)
    }
  }

  it('walkFiles with empty excludePatterns returns same results as without excludePatterns', async () => {
    /**
     * **Feature: sync-exclude-support, Property 4: Empty exclude patterns sync all files**
     * **Validates: Requirements 2.4, 4.3**
     */
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          dirCount: fc.integer({ min: 1, max: 4 }),
          fileName: fc.constantFrom('AGENTS.md', 'test.md', 'file.txt'),
        }),
        async ({ dirCount, fileName }) => {
          await withTestDir(async (testDir) => {
            // Create test directory structure
            await fs.writeFile(path.join(testDir, fileName), 'root content')

            for (let i = 0; i < dirCount; i++) {
              const dir = path.join(testDir, `dir${i}`)
              await fs.ensureDir(dir)
              await fs.writeFile(path.join(dir, fileName), `content ${i}`)
            }

            // Run with empty excludePatterns array
            const withEmptyPatterns = await walkFiles({
              baseDir: testDir,
              targetFileName: fileName,
              excludePatterns: [],
            })

            // Run with undefined excludePatterns (default)
            const withUndefinedPatterns = await walkFiles({
              baseDir: testDir,
              targetFileName: fileName,
            })

            // Both should return identical results
            expect(withEmptyPatterns).toEqual(withUndefinedPatterns)

            // Should find all files (root + dirCount subdirectories)
            expect(withEmptyPatterns).toHaveLength(dirCount + 1)
          })
        },
      ),
      { numRuns: 100 },
    )
  })

  it('walkFiles with empty excludePatterns does not filter any files', async () => {
    /**
     * **Feature: sync-exclude-support, Property 4: Empty exclude patterns sync all files**
     * **Validates: Requirements 2.4, 4.3**
     */
    await fc.assert(
      fc.asyncProperty(
        fc.tuple(
          fc.array(pathSegmentArb, { minLength: 1, maxLength: 3 }),
          extensionArb,
        ),
        async ([dirNames, ext]) => {
          await withTestDir(async (testDir) => {
            // Create nested directory structure
            let currentPath = testDir
            const createdFiles: string[] = []

            for (const dirName of dirNames) {
              currentPath = path.join(currentPath, dirName)
              await fs.ensureDir(currentPath)
              const filePath = path.join(currentPath, `file${ext}`)
              await fs.writeFile(filePath, 'content')
              createdFiles.push(filePath)
            }

            // Run with empty excludePatterns
            const result = await walkFiles({
              baseDir: testDir,
              targetExtension: ext,
              excludePatterns: [],
            })

            // All created files should be found
            for (const file of createdFiles) {
              expect(result).toContain(file)
            }
          })
        },
      ),
      { numRuns: 100 },
    )
  })

  it('findAgentsFiles with empty excludePatterns returns all AGENTS.md files', async () => {
    /**
     * **Feature: sync-exclude-support, Property 4: Empty exclude patterns sync all files**
     * **Validates: Requirements 2.4, 4.3**
     */
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 5 }),
        async (dirCount) => {
          await withTestDir(async (testDir) => {
            // Create AGENTS.md in root
            await fs.writeFile(path.join(testDir, 'AGENTS.md'), 'root')

            // Create AGENTS.md in subdirectories
            for (let i = 0; i < dirCount; i++) {
              const dir = path.join(testDir, `subdir${i}`)
              await fs.ensureDir(dir)
              await fs.writeFile(path.join(dir, 'AGENTS.md'), `content ${i}`)
            }

            // Run with empty excludePatterns
            const withEmptyPatterns = await findAgentsFiles(testDir, {
              excludePatterns: [],
            })

            // Run without excludePatterns
            const withoutPatterns = await findAgentsFiles(testDir)

            // Both should return identical results
            expect(withEmptyPatterns).toEqual(withoutPatterns)

            // Should find all AGENTS.md files
            expect(withEmptyPatterns).toHaveLength(dirCount + 1)
          })
        },
      ),
      { numRuns: 100 },
    )
  })

  it('empty excludePatterns vs non-matching patterns produce same results', async () => {
    /**
     * **Feature: sync-exclude-support, Property 4: Empty exclude patterns sync all files**
     * **Validates: Requirements 2.4, 4.3**
     *
     * When exclude patterns do not match any files, the result should be
     * equivalent to having empty exclude patterns.
     */
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 3 }),
        async (dirCount) => {
          await withTestDir(async (testDir) => {
            // Create test structure with known paths
            await fs.writeFile(path.join(testDir, 'AGENTS.md'), 'root')

            for (let i = 0; i < dirCount; i++) {
              const dir = path.join(testDir, `src${i}`)
              await fs.ensureDir(dir)
              await fs.writeFile(path.join(dir, 'AGENTS.md'), `content ${i}`)
            }

            // Run with empty excludePatterns
            const withEmptyPatterns = await walkFiles({
              baseDir: testDir,
              targetFileName: 'AGENTS.md',
              excludePatterns: [],
            })

            // Run with non-matching patterns (patterns that won't match any created files)
            const withNonMatchingPatterns = await walkFiles({
              baseDir: testDir,
              targetFileName: 'AGENTS.md',
              excludePatterns: ['nonexistent/**/path', '*.xyz', 'fake/*/dir'],
            })

            // Both should return identical results since patterns don't match
            expect(withEmptyPatterns).toEqual(withNonMatchingPatterns)
          })
        },
      ),
      { numRuns: 100 },
    )
  })
})

/**
 * **Feature: sync-exclude-support, Property 3: Exclude patterns filter matching files**
 * **Validates: Requirements 2.1, 2.2, 2.3, 4.2, 4.4**
 *
 * For any set of file paths and exclude patterns, matchesExcludePattern SHALL correctly
 * identify paths that match any of the exclude patterns.
 */
describe('matchesExcludePattern property tests', () => {
  // Generator for valid path segments (alphanumeric, no special glob chars)
  const pathSegmentArb = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_-]{0,10}$/)

  // Generator for file extensions
  const extensionArb = fc.constantFrom('.ts', '.js', '.md', '.json', '.log', '.txt')

  // Generator for simple file paths like "dir/subdir/file.ext"
  const filePathArb = fc
    .tuple(
      fc.array(pathSegmentArb, { minLength: 1, maxLength: 4 }),
      pathSegmentArb,
      extensionArb,
    )
    .map(([dirs, fileName, ext]) => [...dirs, `${fileName}${ext}`].join('/'))

  // Generator for glob patterns
  const globPatternArb = fc.oneof(
    // Extension patterns like *.log
    extensionArb.map((ext) => `*${ext}`),
    // Directory patterns like ref/*/dist
    fc.tuple(pathSegmentArb, pathSegmentArb).map(([parent, child]) => `${parent}/*/${child}`),
    // Double-star patterns like **/node_modules
    pathSegmentArb.map((dir) => `**/${dir}`),
  )

  it('should return false for empty patterns array', () => {
    /**
     * **Feature: sync-exclude-support, Property 3: Exclude patterns filter matching files**
     * **Validates: Requirements 2.4, 4.3**
     */
    fc.assert(
      fc.property(filePathArb, (filePath) => {
        expect(matchesExcludePattern(filePath, [])).toBe(false)
      }),
      { numRuns: 100 },
    )
  })

  it('should match extension patterns correctly', () => {
    /**
     * **Feature: sync-exclude-support, Property 3: Exclude patterns filter matching files**
     * **Validates: Requirements 2.1, 2.2, 4.2**
     *
     * Note: *.ext patterns only match files at root level.
     * Use **\/*.ext for matching at any depth.
     */
    fc.assert(
      fc.property(
        fc.tuple(
          fc.array(pathSegmentArb, { minLength: 0, maxLength: 3 }),
          pathSegmentArb,
          extensionArb,
        ),
        ([dirs, fileName, ext]) => {
          const filePath = [...dirs, `${fileName}${ext}`].join('/')
          // Use **/*.ext pattern to match files at any depth
          const pattern = `**/*${ext}`

          // File with matching extension should match
          expect(matchesExcludePattern(filePath, [pattern])).toBe(true)

          // File with different extension should not match
          const otherExt = ext === '.log' ? '.txt' : '.log'
          const otherPath = [...dirs, `${fileName}${otherExt}`].join('/')
          expect(matchesExcludePattern(otherPath, [pattern])).toBe(false)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('should match directory patterns like ref/*/dist', () => {
    /**
     * **Feature: sync-exclude-support, Property 3: Exclude patterns filter matching files**
     * **Validates: Requirements 2.1, 2.2, 2.3, 4.2**
     */
    fc.assert(
      fc.property(
        fc.tuple(pathSegmentArb, pathSegmentArb, pathSegmentArb, extensionArb),
        ([parent, project, child, ext]) => {
          const pattern = `${parent}/*/${child}`

          // Path matching pattern should return true
          const matchingPath = `${parent}/${project}/${child}/file${ext}`
          expect(matchesExcludePattern(matchingPath, [pattern])).toBe(true)

          // Path not matching pattern should return false
          const nonMatchingPath = `${parent}/${project}/other/file${ext}`
          expect(matchesExcludePattern(nonMatchingPath, [pattern])).toBe(false)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('should match double-star patterns at any depth', () => {
    /**
     * **Feature: sync-exclude-support, Property 3: Exclude patterns filter matching files**
     * **Validates: Requirements 2.1, 2.2, 2.3, 4.2**
     */
    fc.assert(
      fc.property(
        fc.tuple(
          pathSegmentArb,
          fc.array(pathSegmentArb, { minLength: 0, maxLength: 3 }),
          pathSegmentArb,
          extensionArb,
        ),
        ([targetDir, prefixDirs, fileName, ext]) => {
          const pattern = `**/${targetDir}`

          // Path containing targetDir at any depth should match
          const matchingPath = [...prefixDirs, targetDir, `${fileName}${ext}`].join('/')
          expect(matchesExcludePattern(matchingPath, [pattern])).toBe(true)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('should match any pattern when multiple patterns provided', () => {
    /**
     * **Feature: sync-exclude-support, Property 3: Exclude patterns filter matching files**
     * **Validates: Requirements 4.4**
     */
    // Use more specific generators that produce valid matching paths
    const dirPatternArb = fc
      .tuple(pathSegmentArb, pathSegmentArb)
      .map(([parent, child]) => ({
        pattern: `${parent}/*/${child}`,
        matchingPath: `${parent}/project/${child}/file.txt`,
      }))

    const doubleStarPatternArb = pathSegmentArb.map((dir) => ({
      pattern: `**/${dir}`,
      matchingPath: `some/path/${dir}/file.txt`,
    }))

    fc.assert(
      fc.property(
        fc.array(fc.oneof(dirPatternArb, doubleStarPatternArb), { minLength: 2, maxLength: 4 }),
        (patternObjs) => {
          const patterns = patternObjs.map((p) => p.pattern)

          // Each generated path should match its corresponding pattern
          for (const { matchingPath } of patternObjs) {
            expect(matchesExcludePattern(matchingPath, patterns)).toBe(true)
          }
        },
      ),
      { numRuns: 100 },
    )
  })

  it('should handle Windows-style path separators', () => {
    /**
     * **Feature: sync-exclude-support, Property 3: Exclude patterns filter matching files**
     * **Validates: Requirements 2.1, 2.2**
     */
    fc.assert(
      fc.property(
        fc.tuple(pathSegmentArb, pathSegmentArb, pathSegmentArb, extensionArb),
        ([parent, project, child, ext]) => {
          const pattern = `${parent}/*/${child}`

          // Unix-style path
          const unixPath = `${parent}/${project}/${child}/file${ext}`

          // Windows-style path
          const windowsPath = `${parent}\\${project}\\${child}\\file${ext}`

          // Both should match the same pattern
          const unixResult = matchesExcludePattern(unixPath, [pattern])
          const windowsResult = matchesExcludePattern(windowsPath, [pattern])

          expect(unixResult).toBe(windowsResult)
          expect(unixResult).toBe(true)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('should not match partial directory names', () => {
    /**
     * **Feature: sync-exclude-support, Property 3: Exclude patterns filter matching files**
     * **Validates: Requirements 2.2**
     */
    fc.assert(
      fc.property(
        fc.tuple(pathSegmentArb, pathSegmentArb),
        ([targetDir, suffix]) => {
          // Ensure suffix is not empty to create a different directory name
          const extendedDir = `${targetDir}${suffix}`
          const pattern = `**/${targetDir}`

          // Path with exact directory name should match
          const exactPath = `some/path/${targetDir}/file.txt`
          expect(matchesExcludePattern(exactPath, [pattern])).toBe(true)

          // Path with extended directory name should NOT match
          // (e.g., pattern **\/dist should not match distribution)
          const extendedPath = `some/path/${extendedDir}/file.txt`

          // Only check if extendedDir is actually different from targetDir
          if (extendedDir !== targetDir) {
            expect(matchesExcludePattern(extendedPath, [pattern])).toBe(false)
          }
        },
      ),
      { numRuns: 100 },
    )
  })
})
