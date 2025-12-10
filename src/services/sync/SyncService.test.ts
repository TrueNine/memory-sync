import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import path from 'node:path'
import fs from 'fs-extra'
import os from 'node:os'
import { SyncService } from './SyncService'
import { LogAdapter } from '../../utils/log'

describe('SyncService', () => {
  let service: SyncService
  let tempDir: string
  let sourceDir: string
  let targetDir: string
  let logger: LogAdapter

  beforeEach(async () => {
    service = new SyncService()
    logger = new LogAdapter('test')

    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sync-test-'))
    sourceDir = path.join(tempDir, 'source')
    targetDir = path.join(tempDir, 'target')

    await fs.ensureDir(sourceDir)
    await fs.ensureDir(targetDir)
  })

  afterEach(async () => {
    await fs.remove(tempDir)
  })

  describe('syncDirectory', () => {
    it('should copy directory contents', async () => {
      const testFile = path.join(sourceDir, 'test.txt')
      await fs.writeFile(testFile, 'test content', 'utf-8')

      const result = await service.syncDirectory({
        source: sourceDir,
        target: targetDir,
        createSymlinks: false,
        cleanTarget: true,
        logger,
      })

      expect(result.copied).toBe(1)
      expect(result.linked).toBe(0)
      expect(result.errors).toHaveLength(0)

      const targetFile = path.join(targetDir, 'test.txt')
      expect(await fs.pathExists(targetFile)).toBe(true)
      const content = await fs.readFile(targetFile, 'utf-8')
      expect(content).toBe('test content')
    })

    it('should create symlink when requested', async () => {
      const testFile = path.join(sourceDir, 'test.txt')
      await fs.writeFile(testFile, 'test content', 'utf-8')

      const symlinkTarget = path.join(tempDir, 'symlink-target')

      const result = await service.syncDirectory({
        source: sourceDir,
        target: symlinkTarget,
        createSymlinks: true,
        cleanTarget: true,
        logger,
      })

      // On Windows without admin privileges, symlink creation may fall back to copy
      expect(result.linked + result.copied).toBe(1)
      expect(result.errors).toHaveLength(0)

      expect(await fs.pathExists(symlinkTarget)).toBe(true)
    })

    it('should clean target directory before syncing', async () => {
      const existingFile = path.join(targetDir, 'existing.txt')
      await fs.writeFile(existingFile, 'existing content', 'utf-8')

      const testFile = path.join(sourceDir, 'test.txt')
      await fs.writeFile(testFile, 'test content', 'utf-8')

      const result = await service.syncDirectory({
        source: sourceDir,
        target: targetDir,
        createSymlinks: false,
        cleanTarget: true,
        logger,
      })

      expect(result.copied).toBe(1)
      expect(await fs.pathExists(path.join(targetDir, 'existing.txt'))).toBe(false)
      expect(await fs.pathExists(path.join(targetDir, 'test.txt'))).toBe(true)
    })

    it('should not clean target directory when cleanTarget is false', async () => {
      const existingFile = path.join(targetDir, 'existing.txt')
      await fs.writeFile(existingFile, 'existing content', 'utf-8')

      const testFile = path.join(sourceDir, 'test.txt')
      await fs.writeFile(testFile, 'test content', 'utf-8')

      const result = await service.syncDirectory({
        source: sourceDir,
        target: targetDir,
        createSymlinks: false,
        cleanTarget: false,
        logger,
      })

      expect(result.copied).toBe(1)
      expect(await fs.pathExists(path.join(targetDir, 'existing.txt'))).toBe(true)
      expect(await fs.pathExists(path.join(targetDir, 'test.txt'))).toBe(true)
    })

    it('should return error when source does not exist', async () => {
      const nonexistentSource = path.join(tempDir, 'nonexistent')

      const result = await service.syncDirectory({
        source: nonexistentSource,
        target: targetDir,
        createSymlinks: false,
        cleanTarget: true,
        logger,
      })

      expect(result.copied).toBe(0)
      expect(result.errors.length).toBeGreaterThan(0)
      expect(result.errors[0]).toContain('not found')
    })

    it('should create target directory if it does not exist', async () => {
      const testFile = path.join(sourceDir, 'test.txt')
      await fs.writeFile(testFile, 'test content', 'utf-8')

      const newTargetDir = path.join(tempDir, 'new-target', 'nested')

      const result = await service.syncDirectory({
        source: sourceDir,
        target: newTargetDir,
        createSymlinks: false,
        cleanTarget: true,
        logger,
      })

      expect(result.copied).toBe(1)
      expect(await fs.pathExists(newTargetDir)).toBe(true)
    })

    it('should exclude files matching excludePatterns', async () => {
      // Create source structure with files to exclude
      const distDir = path.join(sourceDir, 'ref', 'project1', 'dist')
      await fs.ensureDir(distDir)
      await fs.writeFile(path.join(distDir, 'excluded.txt'), 'excluded', 'utf-8')

      const srcDir = path.join(sourceDir, 'src')
      await fs.ensureDir(srcDir)
      await fs.writeFile(path.join(srcDir, 'included.txt'), 'included', 'utf-8')

      const result = await service.syncDirectory({
        source: sourceDir,
        target: targetDir,
        createSymlinks: false,
        cleanTarget: true,
        excludePatterns: ['ref/*/dist'],
        logger,
      })

      expect(result.copied).toBe(1)
      expect(await fs.pathExists(path.join(targetDir, 'src', 'included.txt'))).toBe(true)
      expect(await fs.pathExists(path.join(targetDir, 'ref', 'project1', 'dist', 'excluded.txt'))).toBe(false)
    })

    it('should sync all files when excludePatterns is empty', async () => {
      // Create source structure
      const distDir = path.join(sourceDir, 'ref', 'project1', 'dist')
      await fs.ensureDir(distDir)
      await fs.writeFile(path.join(distDir, 'file.txt'), 'content', 'utf-8')

      const srcDir = path.join(sourceDir, 'src')
      await fs.ensureDir(srcDir)
      await fs.writeFile(path.join(srcDir, 'file.txt'), 'content', 'utf-8')

      const result = await service.syncDirectory({
        source: sourceDir,
        target: targetDir,
        createSymlinks: false,
        cleanTarget: true,
        excludePatterns: [],
        logger,
      })

      expect(result.copied).toBe(1)
      expect(await fs.pathExists(path.join(targetDir, 'src', 'file.txt'))).toBe(true)
      expect(await fs.pathExists(path.join(targetDir, 'ref', 'project1', 'dist', 'file.txt'))).toBe(true)
    })

    it('should exclude files matching multiple patterns', async () => {
      // Create source structure
      const distDir = path.join(sourceDir, 'ref', 'project1', 'dist')
      await fs.ensureDir(distDir)
      await fs.writeFile(path.join(distDir, 'file.txt'), 'content', 'utf-8')

      const logsDir = path.join(sourceDir, 'logs')
      await fs.ensureDir(logsDir)
      await fs.writeFile(path.join(logsDir, 'app.log'), 'log content', 'utf-8')

      const srcDir = path.join(sourceDir, 'src')
      await fs.ensureDir(srcDir)
      await fs.writeFile(path.join(srcDir, 'file.txt'), 'content', 'utf-8')

      const result = await service.syncDirectory({
        source: sourceDir,
        target: targetDir,
        createSymlinks: false,
        cleanTarget: true,
        excludePatterns: ['ref/*/dist', 'logs'],
        logger,
      })

      expect(result.copied).toBe(1)
      expect(await fs.pathExists(path.join(targetDir, 'src', 'file.txt'))).toBe(true)
      expect(await fs.pathExists(path.join(targetDir, 'ref', 'project1', 'dist', 'file.txt'))).toBe(false)
      expect(await fs.pathExists(path.join(targetDir, 'logs', 'app.log'))).toBe(false)
    })
  })

  describe('syncAgentsToClaude', () => {
    it('should create symlinks from AGENTS.md to CLAUDE.md', async () => {
      const agentsFile = path.join(sourceDir, 'AGENTS.md')
      await fs.writeFile(agentsFile, '# Test Agents', 'utf-8')

      const result = await service.syncAgentsToClaude(sourceDir, {
        allowScripts: true,
        logger,
      })

      // On Windows without admin privileges, symlink creation may fall back to copy
      expect(result.linked + result.copied).toBe(1)
      expect(result.errors).toHaveLength(0)

      const claudeFile = path.join(sourceDir, 'CLAUDE.md')
      expect(await fs.pathExists(claudeFile)).toBe(true)
    })

    it('should handle multiple AGENTS.md files', async () => {
      const agentsFile1 = path.join(sourceDir, 'AGENTS.md')
      const agentsFile2 = path.join(sourceDir, 'src', 'AGENTS.md')
      const agentsFile3 = path.join(sourceDir, 'docs', 'AGENTS.md')

      await fs.writeFile(agentsFile1, '# Root', 'utf-8')
      await fs.ensureDir(path.dirname(agentsFile2))
      await fs.writeFile(agentsFile2, '# Src', 'utf-8')
      await fs.ensureDir(path.dirname(agentsFile3))
      await fs.writeFile(agentsFile3, '# Docs', 'utf-8')

      const result = await service.syncAgentsToClaude(sourceDir, {
        allowScripts: true,
        logger,
      })

      // On Windows without admin privileges, symlink creation may fall back to copy
      expect(result.linked + result.copied).toBe(3)
      expect(result.errors).toHaveLength(0)

      expect(await fs.pathExists(path.join(sourceDir, 'CLAUDE.md'))).toBe(true)
      expect(await fs.pathExists(path.join(sourceDir, 'src', 'CLAUDE.md'))).toBe(true)
      expect(await fs.pathExists(path.join(sourceDir, 'docs', 'CLAUDE.md'))).toBe(true)
    })

    it('should clean existing CLAUDE.md files before creating new ones', async () => {
      const existingClaude = path.join(sourceDir, 'CLAUDE.md')
      await fs.writeFile(existingClaude, '# Old Claude', 'utf-8')

      const agentsFile = path.join(sourceDir, 'AGENTS.md')
      await fs.writeFile(agentsFile, '# New Agents', 'utf-8')

      const result = await service.syncAgentsToClaude(sourceDir, {
        allowScripts: true,
        logger,
      })

      expect(result.deleted).toBe(1)
      // On Windows without admin privileges, symlink creation may fall back to copy
      expect(result.linked + result.copied).toBe(1)

      expect(await fs.pathExists(existingClaude)).toBe(true)
    })

    it('should skip .scripts directory when allowScripts is false', async () => {
      const agentsFile1 = path.join(sourceDir, 'AGENTS.md')
      const scriptsDir = path.join(sourceDir, '.scripts')
      const agentsFile2 = path.join(scriptsDir, 'AGENTS.md')

      await fs.writeFile(agentsFile1, '# Root', 'utf-8')
      await fs.ensureDir(scriptsDir)
      await fs.writeFile(agentsFile2, '# Scripts', 'utf-8')

      const result = await service.syncAgentsToClaude(sourceDir, {
        allowScripts: false,
        logger,
      })

      // On Windows without admin privileges, symlink creation may fall back to copy
      expect(result.linked + result.copied).toBe(1)
      expect(await fs.pathExists(path.join(sourceDir, 'CLAUDE.md'))).toBe(true)
      expect(await fs.pathExists(path.join(scriptsDir, 'CLAUDE.md'))).toBe(false)
    })

    it('should handle empty directory', async () => {
      const result = await service.syncAgentsToClaude(sourceDir, {
        allowScripts: true,
        logger,
      })

      expect(result.linked).toBe(0)
      expect(result.deleted).toBe(0)
      expect(result.errors).toHaveLength(0)
    })
  })

  describe('syncSkills', () => {
    it('should sync skills to multiple targets', async () => {
      const skillsDir = path.join(sourceDir, 'skills')
      await fs.ensureDir(skillsDir)
      await fs.writeFile(path.join(skillsDir, 'skill1.md'), '# Skill 1', 'utf-8')
      await fs.writeFile(path.join(skillsDir, 'skill2.md'), '# Skill 2', 'utf-8')

      const target1 = path.join(tempDir, 'target1')
      const target2 = path.join(tempDir, 'target2')

      const result = await service.syncSkills(skillsDir, [target1, target2], {
        logger,
      })

      expect(result.copied).toBe(2)
      expect(result.errors).toHaveLength(0)

      expect(await fs.pathExists(path.join(target1, 'skill1.md'))).toBe(true)
      expect(await fs.pathExists(path.join(target1, 'skill2.md'))).toBe(true)
      expect(await fs.pathExists(path.join(target2, 'skill1.md'))).toBe(true)
      expect(await fs.pathExists(path.join(target2, 'skill2.md'))).toBe(true)
    })

    it('should handle empty targets array', async () => {
      const skillsDir = path.join(sourceDir, 'skills')
      await fs.ensureDir(skillsDir)
      await fs.writeFile(path.join(skillsDir, 'skill1.md'), '# Skill 1', 'utf-8')

      const result = await service.syncSkills(skillsDir, [], {
        logger,
      })

      expect(result.copied).toBe(0)
      expect(result.errors).toHaveLength(0)
    })

    it('should return error when source does not exist', async () => {
      const nonexistentSource = path.join(tempDir, 'nonexistent')
      const target1 = path.join(tempDir, 'target1')

      const result = await service.syncSkills(nonexistentSource, [target1], {
        logger,
      })

      expect(result.copied).toBe(0)
      expect(result.errors.length).toBeGreaterThan(0)
      expect(result.errors[0]).toContain('not found')
    })

    it('should handle partial failures', async () => {
      const skillsDir = path.join(sourceDir, 'skills')
      await fs.ensureDir(skillsDir)
      await fs.writeFile(path.join(skillsDir, 'skill1.md'), '# Skill 1', 'utf-8')

      const target1 = path.join(tempDir, 'target1')
      const target2 = path.join(tempDir, 'target2')

      const result = await service.syncSkills(skillsDir, [target1, target2], {
        logger,
      })

      expect(result.copied).toBeGreaterThanOrEqual(1)
    })

    it('should clean target directories before syncing', async () => {
      const skillsDir = path.join(sourceDir, 'skills')
      await fs.ensureDir(skillsDir)
      await fs.writeFile(path.join(skillsDir, 'skill1.md'), '# Skill 1', 'utf-8')

      const target1 = path.join(tempDir, 'target1')
      await fs.ensureDir(target1)
      await fs.writeFile(path.join(target1, 'old-file.md'), '# Old', 'utf-8')

      const result = await service.syncSkills(skillsDir, [target1], {
        logger,
      })

      expect(result.copied).toBe(1)
      expect(await fs.pathExists(path.join(target1, 'skill1.md'))).toBe(true)
      expect(await fs.pathExists(path.join(target1, 'old-file.md'))).toBe(false)
    })
  })
})
