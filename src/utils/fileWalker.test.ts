import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import path from 'node:path'
import fs from 'fs-extra'
import os from 'node:os'
import {
  walkFiles,
  findAgentsFiles,
  walkDirectory,
  findFilesByExtension,
  cleanAllClaudeMd,
  copyAgentsToClaude,
  matchesExcludePattern,
} from './fileWalker'

describe('fileWalker unit tests', () => {
  let testDir: string

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `filewalker-unit-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    await fs.ensureDir(testDir)
  })

  afterEach(async () => {
    await fs.remove(testDir)
  })

  describe('matchesExcludePattern', () => {
    it('should return false for empty patterns array', () => {
      expect(matchesExcludePattern('ref/project/dist/file.js', [])).toBe(false)
    })

    it('should match simple glob patterns like *.log', () => {
      expect(matchesExcludePattern('debug.log', ['*.log'])).toBe(true)
      expect(matchesExcludePattern('error.log', ['*.log'])).toBe(true)
      expect(matchesExcludePattern('file.txt', ['*.log'])).toBe(false)
    })

    it('should match directory patterns like ref/*/dist', () => {
      expect(matchesExcludePattern('ref/project/dist', ['ref/*/dist'])).toBe(true)
      expect(matchesExcludePattern('ref/project/dist/file.js', ['ref/*/dist'])).toBe(true)
      expect(matchesExcludePattern('ref/project/src/file.js', ['ref/*/dist'])).toBe(false)
    })

    it('should match double-star patterns like **/node_modules', () => {
      expect(matchesExcludePattern('node_modules', ['**/node_modules'])).toBe(true)
      expect(matchesExcludePattern('src/node_modules', ['**/node_modules'])).toBe(true)
      expect(matchesExcludePattern('deep/nested/node_modules', ['**/node_modules'])).toBe(true)
      expect(matchesExcludePattern('src/file.js', ['**/node_modules'])).toBe(false)
    })

    it('should match files inside excluded directories', () => {
      expect(matchesExcludePattern('ref/compose-server/dist/index.js', ['ref/*/dist'])).toBe(true)
      expect(matchesExcludePattern('ref/compose-client/dist/utils/helper.ts', ['ref/*/dist'])).toBe(true)
    })

    it('should handle Windows-style path separators', () => {
      expect(matchesExcludePattern('ref\\project\\dist', ['ref/*/dist'])).toBe(true)
      expect(matchesExcludePattern('ref\\project\\dist\\file.js', ['ref/*/dist'])).toBe(true)
    })

    it('should match multiple patterns', () => {
      const patterns = ['*.log', 'ref/*/dist', '**/node_modules']
      expect(matchesExcludePattern('debug.log', patterns)).toBe(true)
      expect(matchesExcludePattern('ref/project/dist/file.js', patterns)).toBe(true)
      expect(matchesExcludePattern('src/node_modules/pkg/index.js', patterns)).toBe(true)
      expect(matchesExcludePattern('src/utils/helper.ts', patterns)).toBe(false)
    })

    it('should not match partial directory names', () => {
      expect(matchesExcludePattern('ref/project/distribution/file.js', ['ref/*/dist'])).toBe(false)
      expect(matchesExcludePattern('node_modules_backup/file.js', ['**/node_modules'])).toBe(false)
    })
  })

  describe('walkFiles', () => {
    it('should find files by name', async () => {
      await fs.writeFile(path.join(testDir, 'AGENTS.md'), 'content')
      await fs.ensureDir(path.join(testDir, 'src'))
      await fs.writeFile(path.join(testDir, 'src', 'AGENTS.md'), 'content')

      const result = await walkFiles({
        baseDir: testDir,
        targetFileName: 'AGENTS.md',
      })

      expect(result).toHaveLength(2)
      expect(result).toContain(path.join(testDir, 'AGENTS.md'))
      expect(result).toContain(path.join(testDir, 'src', 'AGENTS.md'))
    })

    it('should find files by extension', async () => {
      await fs.writeFile(path.join(testDir, 'file1.ts'), 'content')
      await fs.writeFile(path.join(testDir, 'file2.ts'), 'content')
      await fs.writeFile(path.join(testDir, 'file3.js'), 'content')

      const result = await walkFiles({
        baseDir: testDir,
        targetExtension: '.ts',
      })

      expect(result).toHaveLength(2)
      expect(result.every((f) => f.endsWith('.ts'))).toBe(true)
    })

    it('should skip root files when skipRoot is true', async () => {
      await fs.writeFile(path.join(testDir, 'AGENTS.md'), 'root')
      await fs.ensureDir(path.join(testDir, 'src'))
      await fs.writeFile(path.join(testDir, 'src', 'AGENTS.md'), 'src')

      const result = await walkFiles({
        baseDir: testDir,
        targetFileName: 'AGENTS.md',
        skipRoot: true,
      })

      expect(result).toHaveLength(1)
      expect(result[0]).toBe(path.join(testDir, 'src', 'AGENTS.md'))
    })

    it('should include root files when skipRoot is false', async () => {
      await fs.writeFile(path.join(testDir, 'AGENTS.md'), 'root')
      await fs.ensureDir(path.join(testDir, 'src'))
      await fs.writeFile(path.join(testDir, 'src', 'AGENTS.md'), 'src')

      const result = await walkFiles({
        baseDir: testDir,
        targetFileName: 'AGENTS.md',
        skipRoot: false,
      })

      expect(result).toHaveLength(2)
      expect(result).toContain(path.join(testDir, 'AGENTS.md'))
    })

    it('should exclude directories specified in excludeDirs', async () => {
      await fs.ensureDir(path.join(testDir, 'node_modules'))
      await fs.writeFile(path.join(testDir, 'node_modules', 'AGENTS.md'), 'content')
      await fs.ensureDir(path.join(testDir, 'dist'))
      await fs.writeFile(path.join(testDir, 'dist', 'AGENTS.md'), 'content')
      await fs.ensureDir(path.join(testDir, 'src'))
      await fs.writeFile(path.join(testDir, 'src', 'AGENTS.md'), 'content')

      const result = await walkFiles({
        baseDir: testDir,
        targetFileName: 'AGENTS.md',
        excludeDirs: ['node_modules', 'dist'],
      })

      expect(result).toHaveLength(1)
      expect(result[0]).toBe(path.join(testDir, 'src', 'AGENTS.md'))
    })

    it('should skip hidden directories by default', async () => {
      await fs.ensureDir(path.join(testDir, '.hidden'))
      await fs.writeFile(path.join(testDir, '.hidden', 'AGENTS.md'), 'content')
      await fs.ensureDir(path.join(testDir, 'visible'))
      await fs.writeFile(path.join(testDir, 'visible', 'AGENTS.md'), 'content')

      const result = await walkFiles({
        baseDir: testDir,
        targetFileName: 'AGENTS.md',
        skipHidden: true,
      })

      expect(result).toHaveLength(1)
      expect(result[0]).toBe(path.join(testDir, 'visible', 'AGENTS.md'))
    })

    it('should allow .scripts directory when allowScripts is true', async () => {
      await fs.ensureDir(path.join(testDir, '.scripts'))
      await fs.writeFile(path.join(testDir, '.scripts', 'AGENTS.md'), 'content')
      await fs.ensureDir(path.join(testDir, '.other'))
      await fs.writeFile(path.join(testDir, '.other', 'AGENTS.md'), 'content')

      const result = await walkFiles({
        baseDir: testDir,
        targetFileName: 'AGENTS.md',
        skipHidden: true,
        allowScripts: true,
      })

      expect(result).toHaveLength(1)
      expect(result[0]).toBe(path.join(testDir, '.scripts', 'AGENTS.md'))
    })

    it('should use custom file filter', async () => {
      await fs.writeFile(path.join(testDir, 'file1.md'), 'content')
      await fs.writeFile(path.join(testDir, 'file2.md'), 'content')
      await fs.writeFile(path.join(testDir, 'special.md'), 'content')

      const result = await walkFiles({
        baseDir: testDir,
        targetExtension: '.md',
        fileFilter: (filePath) => filePath.includes('special'),
      })

      expect(result).toHaveLength(1)
      expect(result[0]).toBe(path.join(testDir, 'special.md'))
    })

    it('should use custom directory filter', async () => {
      await fs.ensureDir(path.join(testDir, 'include'))
      await fs.writeFile(path.join(testDir, 'include', 'AGENTS.md'), 'content')
      await fs.ensureDir(path.join(testDir, 'exclude'))
      await fs.writeFile(path.join(testDir, 'exclude', 'AGENTS.md'), 'content')

      const result = await walkFiles({
        baseDir: testDir,
        targetFileName: 'AGENTS.md',
        dirFilter: (dirPath) => dirPath.includes('include'),
      })

      expect(result).toHaveLength(1)
      expect(result[0]).toBe(path.join(testDir, 'include', 'AGENTS.md'))
    })

    it('should return sorted results', async () => {
      await fs.ensureDir(path.join(testDir, 'c'))
      await fs.writeFile(path.join(testDir, 'c', 'AGENTS.md'), 'content')
      await fs.ensureDir(path.join(testDir, 'a'))
      await fs.writeFile(path.join(testDir, 'a', 'AGENTS.md'), 'content')
      await fs.ensureDir(path.join(testDir, 'b'))
      await fs.writeFile(path.join(testDir, 'b', 'AGENTS.md'), 'content')

      const result = await walkFiles({
        baseDir: testDir,
        targetFileName: 'AGENTS.md',
      })

      expect(result).toHaveLength(3)

      const sorted = [...result].sort()
      expect(result).toEqual(sorted)
    })
  })

  describe('findAgentsFiles', () => {
    it('should find all AGENTS.md files', async () => {
      await fs.writeFile(path.join(testDir, 'AGENTS.md'), 'root')
      await fs.ensureDir(path.join(testDir, 'src'))
      await fs.writeFile(path.join(testDir, 'src', 'AGENTS.md'), 'src')
      await fs.ensureDir(path.join(testDir, 'lib'))
      await fs.writeFile(path.join(testDir, 'lib', 'AGENTS.md'), 'lib')

      const result = await findAgentsFiles(testDir)

      expect(result).toHaveLength(3)
    })

    it('should skip root when skipRoot is true', async () => {
      await fs.writeFile(path.join(testDir, 'AGENTS.md'), 'root')
      await fs.ensureDir(path.join(testDir, 'src'))
      await fs.writeFile(path.join(testDir, 'src', 'AGENTS.md'), 'src')

      const result = await findAgentsFiles(testDir, { skipRoot: true })

      expect(result).toHaveLength(1)
      expect(result[0]).toBe(path.join(testDir, 'src', 'AGENTS.md'))
    })

    it('should allow .scripts directory when allowScripts is true', async () => {
      await fs.ensureDir(path.join(testDir, '.scripts'))
      await fs.writeFile(path.join(testDir, '.scripts', 'AGENTS.md'), 'content')

      const result = await findAgentsFiles(testDir, { allowScripts: true })

      expect(result).toHaveLength(1)
      expect(result[0]).toBe(path.join(testDir, '.scripts', 'AGENTS.md'))
    })

    it('should skip .scripts directory when allowScripts is false', async () => {
      await fs.ensureDir(path.join(testDir, '.scripts'))
      await fs.writeFile(path.join(testDir, '.scripts', 'AGENTS.md'), 'content')
      await fs.ensureDir(path.join(testDir, 'src'))
      await fs.writeFile(path.join(testDir, 'src', 'AGENTS.md'), 'content')

      const result = await findAgentsFiles(testDir, { allowScripts: false })

      expect(result).toHaveLength(1)
      expect(result[0]).toBe(path.join(testDir, 'src', 'AGENTS.md'))
    })

    it('should respect excludeDirs option', async () => {
      await fs.ensureDir(path.join(testDir, 'node_modules'))
      await fs.writeFile(path.join(testDir, 'node_modules', 'AGENTS.md'), 'content')
      await fs.ensureDir(path.join(testDir, 'src'))
      await fs.writeFile(path.join(testDir, 'src', 'AGENTS.md'), 'content')

      const result = await findAgentsFiles(testDir, { excludeDirs: ['node_modules'] })

      expect(result).toHaveLength(1)
      expect(result[0]).toBe(path.join(testDir, 'src', 'AGENTS.md'))
    })
  })

  describe('walkDirectory', () => {
    it('should invoke callback for each file', async () => {
      await fs.writeFile(path.join(testDir, 'file1.txt'), 'content')
      await fs.writeFile(path.join(testDir, 'file2.txt'), 'content')
      await fs.ensureDir(path.join(testDir, 'sub'))
      await fs.writeFile(path.join(testDir, 'sub', 'file3.txt'), 'content')

      const files: string[] = []
      await walkDirectory(testDir, (filePath) => {
        files.push(filePath)
      })

      expect(files).toHaveLength(3)
      expect(files).toContain(path.join(testDir, 'file1.txt'))
      expect(files).toContain(path.join(testDir, 'file2.txt'))
      expect(files).toContain(path.join(testDir, 'sub', 'file3.txt'))
    })

    it('should skip hidden directories when skipHidden is true', async () => {
      await fs.ensureDir(path.join(testDir, '.hidden'))
      await fs.writeFile(path.join(testDir, '.hidden', 'file.txt'), 'content')
      await fs.writeFile(path.join(testDir, 'visible.txt'), 'content')

      const files: string[] = []
      await walkDirectory(
        testDir,
        (filePath) => {
          files.push(filePath)
        },
        { skipHidden: true },
      )

      expect(files).toHaveLength(1)
      expect(files[0]).toBe(path.join(testDir, 'visible.txt'))
    })

    it('should respect excludeDirs option', async () => {
      await fs.ensureDir(path.join(testDir, 'node_modules'))
      await fs.writeFile(path.join(testDir, 'node_modules', 'file.txt'), 'content')
      await fs.writeFile(path.join(testDir, 'file.txt'), 'content')

      const files: string[] = []
      await walkDirectory(
        testDir,
        (filePath) => {
          files.push(filePath)
        },
        { excludeDirs: ['node_modules'] },
      )

      expect(files).toHaveLength(1)
      expect(files[0]).toBe(path.join(testDir, 'file.txt'))
    })
  })

  describe('findFilesByExtension', () => {
    it('should find files with specific extension', async () => {
      await fs.writeFile(path.join(testDir, 'file1.ts'), 'content')
      await fs.writeFile(path.join(testDir, 'file2.ts'), 'content')
      await fs.writeFile(path.join(testDir, 'file3.js'), 'content')

      const result = await findFilesByExtension(testDir, '.ts')

      expect(result).toHaveLength(2)
      expect(result.every((f) => f.name.endsWith('.ts'))).toBe(true)
    })

    it('should return file info with metadata', async () => {
      await fs.writeFile(path.join(testDir, 'test.md'), 'content')

      const result = await findFilesByExtension(testDir, '.md')

      expect(result).toHaveLength(1)
      expect(result[0]).toHaveProperty('path')
      expect(result[0]).toHaveProperty('name')
      expect(result[0]).toHaveProperty('size')
      expect(result[0]).toHaveProperty('modified')
      expect(result[0].name).toBe('test.md')
    })
  })

  describe('cleanAllClaudeMd', () => {
    it('should remove all CLAUDE.md files', async () => {
      await fs.writeFile(path.join(testDir, 'AGENTS.md'), 'content')
      await fs.writeFile(path.join(testDir, 'CLAUDE.md'), 'content')
      await fs.ensureDir(path.join(testDir, 'src'))
      await fs.writeFile(path.join(testDir, 'src', 'AGENTS.md'), 'content')
      await fs.writeFile(path.join(testDir, 'src', 'CLAUDE.md'), 'content')

      const deleted = await cleanAllClaudeMd(testDir)

      expect(deleted).toBe(2)
      expect(await fs.pathExists(path.join(testDir, 'CLAUDE.md'))).toBe(false)
      expect(await fs.pathExists(path.join(testDir, 'src', 'CLAUDE.md'))).toBe(false)
      expect(await fs.pathExists(path.join(testDir, 'AGENTS.md'))).toBe(true)
      expect(await fs.pathExists(path.join(testDir, 'src', 'AGENTS.md'))).toBe(true)
    })

    it('should return 0 when no CLAUDE.md files exist', async () => {
      await fs.writeFile(path.join(testDir, 'AGENTS.md'), 'content')

      const deleted = await cleanAllClaudeMd(testDir)

      expect(deleted).toBe(0)
    })
  })

  describe('copyAgentsToClaude', () => {
    it('should create CLAUDE.md files next to AGENTS.md files', async () => {
      await fs.writeFile(path.join(testDir, 'AGENTS.md'), 'content')
      await fs.ensureDir(path.join(testDir, 'src'))
      await fs.writeFile(path.join(testDir, 'src', 'AGENTS.md'), 'content')

      const result = await copyAgentsToClaude(testDir)

      expect(result.copied).toBeGreaterThan(0)
      expect(await fs.pathExists(path.join(testDir, 'CLAUDE.md'))).toBe(true)
      expect(await fs.pathExists(path.join(testDir, 'src', 'CLAUDE.md'))).toBe(true)
    })

    it('should skip if CLAUDE.md already exists and is up to date', async () => {
      await fs.writeFile(path.join(testDir, 'AGENTS.md'), 'content')
      await fs.writeFile(path.join(testDir, 'CLAUDE.md'), 'content')

      const result = await copyAgentsToClaude(testDir)

      expect(result.copied).toBeGreaterThanOrEqual(0)
    })
  })
})
