import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import path from 'node:path'
import fs from 'fs-extra'
import os from 'node:os'
import { FrontMatterType } from '../../core/types'
import { LogAdapter } from '../../utils/log'
import { ExportService } from './ExportService'

describe('ExportService', () => {
  let service: ExportService
  let tempDir: string
  let logger: LogAdapter

  beforeEach(async () => {
    service = new ExportService()
    logger = new LogAdapter('test')
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'export-service-test-'))
  })

  afterEach(async () => {
    await fs.remove(tempDir)
  })

  describe('exportAgentsFiles', () => {
    it('should export with KIRO_FILE_MATCH front matter', async () => {
      const sourcePath = path.join(tempDir, 'source')
      const targetPath = path.join(tempDir, 'target')

      await fs.ensureDir(sourcePath)
      const subdir = path.join(sourcePath, 'src', 'api')
      await fs.ensureDir(subdir)
      await fs.writeFile(path.join(subdir, 'AGENTS.md'), '# API Rules', 'utf-8')

      const result = await service.exportAgentsFiles({
        sourcePath,
        targetPath,
        frontMatterType: FrontMatterType.KIRO_FILE_MATCH,
        skipRoot: true,
        processRefProjects: false,
        logger,
      })

      expect(result.exported).toBe(1)
      expect(result.skipped).toBe(0)
      expect(result.errors).toHaveLength(0)

      const exportedFile = path.join(targetPath, '_src_api.md')
      expect(await fs.pathExists(exportedFile)).toBe(true)

      const content = await fs.readFile(exportedFile, 'utf-8')
      expect(content).toContain('inclusion: fileMatch')
      expect(content).toContain('fileMatchPattern:')
      expect(content).toContain('src/api/**/*')
      expect(content).toContain('# API Rules')
    })

    it('should export with QODER_GLOB front matter', async () => {
      const sourcePath = path.join(tempDir, 'source')
      const targetPath = path.join(tempDir, 'target')

      await fs.ensureDir(sourcePath)
      const subdir = path.join(sourcePath, 'utils')
      await fs.ensureDir(subdir)
      await fs.writeFile(path.join(subdir, 'AGENTS.md'), '# Utils Rules', 'utf-8')

      const result = await service.exportAgentsFiles({
        sourcePath,
        targetPath,
        frontMatterType: FrontMatterType.QODER_GLOB,
        skipRoot: true,
        processRefProjects: false,
        logger,
      })

      expect(result.exported).toBe(1)
      expect(result.skipped).toBe(0)
      expect(result.errors).toHaveLength(0)

      const exportedFile = path.join(targetPath, '_utils.md')
      expect(await fs.pathExists(exportedFile)).toBe(true)

      const content = await fs.readFile(exportedFile, 'utf-8')
      expect(content).toContain('trigger: glob')
      expect(content).toContain('glob: utils/**/*')
      expect(content).toContain('# Utils Rules')
    })

    it('should skip root files when skipRoot is true', async () => {
      const sourcePath = path.join(tempDir, 'source')
      const targetPath = path.join(tempDir, 'target')

      await fs.ensureDir(sourcePath)
      await fs.writeFile(path.join(sourcePath, 'AGENTS.md'), '# Root', 'utf-8')

      const subdir = path.join(sourcePath, 'src')
      await fs.ensureDir(subdir)
      await fs.writeFile(path.join(subdir, 'AGENTS.md'), '# Src', 'utf-8')

      const result = await service.exportAgentsFiles({
        sourcePath,
        targetPath,
        frontMatterType: FrontMatterType.KIRO_FILE_MATCH,
        skipRoot: true,
        processRefProjects: false,
        logger,
      })

      expect(result.exported).toBe(1)
      expect(await fs.pathExists(path.join(targetPath, '_project.md'))).toBe(false)
      expect(await fs.pathExists(path.join(targetPath, '_src.md'))).toBe(true)
    })

    it('should include root files when skipRoot is false', async () => {
      const sourcePath = path.join(tempDir, 'source')
      const targetPath = path.join(tempDir, 'target')

      await fs.ensureDir(sourcePath)
      await fs.writeFile(path.join(sourcePath, 'AGENTS.md'), '# Root', 'utf-8')

      const result = await service.exportAgentsFiles({
        sourcePath,
        targetPath,
        frontMatterType: FrontMatterType.KIRO_FILE_MATCH,
        skipRoot: false,
        processRefProjects: false,
        logger,
      })

      expect(result.exported).toBe(1)
      expect(await fs.pathExists(path.join(targetPath, '_project.md'))).toBe(true)
    })

    it('should filter out ref directory files when not processing ref projects', async () => {
      const sourcePath = path.join(tempDir, 'source')
      const targetPath = path.join(tempDir, 'target')
      const refPath = path.join(sourcePath, 'ref')

      await fs.ensureDir(sourcePath)

      const srcDir = path.join(sourcePath, 'src')
      await fs.ensureDir(srcDir)
      await fs.writeFile(path.join(srcDir, 'AGENTS.md'), '# Src', 'utf-8')

      await fs.ensureDir(refPath)
      const refSubdir = path.join(refPath, 'project1')
      await fs.ensureDir(refSubdir)
      await fs.writeFile(path.join(refSubdir, 'AGENTS.md'), '# Ref Project', 'utf-8')

      const result = await service.exportAgentsFiles({
        sourcePath,
        targetPath,
        frontMatterType: FrontMatterType.KIRO_FILE_MATCH,
        skipRoot: true,
        processRefProjects: false,
        refPath,
        logger,
      })

      expect(result.exported).toBe(1)
      expect(result.skipped).toBe(1)
      expect(await fs.pathExists(path.join(targetPath, '_src.md'))).toBe(true)
      expect(await fs.pathExists(path.join(targetPath, '_ref_project1.md'))).toBe(false)
    })

    it('should handle empty source directory', async () => {
      const sourcePath = path.join(tempDir, 'source')
      const targetPath = path.join(tempDir, 'target')

      await fs.ensureDir(sourcePath)

      const result = await service.exportAgentsFiles({
        sourcePath,
        targetPath,
        frontMatterType: FrontMatterType.KIRO_FILE_MATCH,
        skipRoot: true,
        processRefProjects: false,
        logger,
      })

      expect(result.exported).toBe(0)
      expect(result.skipped).toBe(0)
      expect(result.errors).toHaveLength(0)
    })

    it('should handle non-existent source path', async () => {
      const sourcePath = path.join(tempDir, 'nonexistent')
      const targetPath = path.join(tempDir, 'target')

      const result = await service.exportAgentsFiles({
        sourcePath,
        targetPath,
        frontMatterType: FrontMatterType.KIRO_FILE_MATCH,
        skipRoot: true,
        processRefProjects: false,
        logger,
      })

      expect(result.exported).toBe(0)
      expect(result.errors.length).toBeGreaterThan(0)
      expect(result.errors[0]).toContain('not found')
    })

    it('should clean target directory before export', async () => {
      const sourcePath = path.join(tempDir, 'source')
      const targetPath = path.join(tempDir, 'target')

      await fs.ensureDir(sourcePath)
      await fs.ensureDir(targetPath)
      await fs.writeFile(path.join(targetPath, 'old-file.md'), 'old content', 'utf-8')

      const subdir = path.join(sourcePath, 'src')
      await fs.ensureDir(subdir)
      await fs.writeFile(path.join(subdir, 'AGENTS.md'), '# New', 'utf-8')

      await service.exportAgentsFiles({
        sourcePath,
        targetPath,
        frontMatterType: FrontMatterType.KIRO_FILE_MATCH,
        skipRoot: true,
        processRefProjects: false,
        logger,
      })

      expect(await fs.pathExists(path.join(targetPath, 'old-file.md'))).toBe(false)
      expect(await fs.pathExists(path.join(targetPath, '_src.md'))).toBe(true)
    })
  })

  describe('exportToKiro', () => {
    it('should use KIRO_FILE_MATCH front matter type', async () => {
      const sourcePath = path.join(tempDir, 'source')
      const targetPath = path.join(tempDir, 'target')

      await fs.ensureDir(sourcePath)
      const subdir = path.join(sourcePath, 'components')
      await fs.ensureDir(subdir)
      await fs.writeFile(path.join(subdir, 'AGENTS.md'), '# Components', 'utf-8')

      const result = await service.exportToKiro({
        sourcePath,
        targetPath,
        skipRoot: true,
        processRefProjects: false,
        logger,
      })

      expect(result.exported).toBe(1)

      const exportedFile = path.join(targetPath, '_components.md')
      const content = await fs.readFile(exportedFile, 'utf-8')
      expect(content).toContain('inclusion: fileMatch')
    })
  })

  describe('exportToQoder', () => {
    it('should use QODER_GLOB front matter type', async () => {
      const sourcePath = path.join(tempDir, 'source')
      const targetPath = path.join(tempDir, 'target')

      await fs.ensureDir(sourcePath)
      const subdir = path.join(sourcePath, 'services')
      await fs.ensureDir(subdir)
      await fs.writeFile(path.join(subdir, 'AGENTS.md'), '# Services', 'utf-8')

      const result = await service.exportToQoder({
        sourcePath,
        targetPath,
        skipRoot: true,
        processRefProjects: false,
        logger,
      })

      expect(result.exported).toBe(1)

      const exportedFile = path.join(targetPath, '_services.md')
      const content = await fs.readFile(exportedFile, 'utf-8')
      expect(content).toContain('trigger: glob')
    })
  })

  describe('ref project processing', () => {
    it('should process ref projects when enabled', async () => {
      const sourcePath = path.join(tempDir, 'source')
      const targetPath = path.join(tempDir, 'target')
      const refPath = path.join(sourcePath, 'ref')

      await fs.ensureDir(sourcePath)

      const project1Dist = path.join(refPath, 'project1', 'dist')
      await fs.ensureDir(project1Dist)
      const project1Subdir = path.join(project1Dist, 'src')
      await fs.ensureDir(project1Subdir)
      await fs.writeFile(path.join(project1Subdir, 'AGENTS.md'), '# Project1 Src', 'utf-8')

      const result = await service.exportAgentsFiles({
        sourcePath,
        targetPath,
        frontMatterType: FrontMatterType.KIRO_FILE_MATCH,
        skipRoot: true,
        processRefProjects: true,
        refPath,
        logger,
      })

      expect(result.exported).toBeGreaterThan(0)

      const kiroSteeringDir = path.join(project1Dist, '.kiro', 'steering')
      expect(await fs.pathExists(kiroSteeringDir)).toBe(true)

      const exportedFile = path.join(kiroSteeringDir, '_src.md')
      expect(await fs.pathExists(exportedFile)).toBe(true)

      const content = await fs.readFile(exportedFile, 'utf-8')
      expect(content).toContain('inclusion: fileMatch')
      expect(content).toContain('# Project1 Src')
    })

    it('should skip root AGENTS.md in ref projects', async () => {
      const sourcePath = path.join(tempDir, 'source')
      const targetPath = path.join(tempDir, 'target')
      const refPath = path.join(sourcePath, 'ref')

      await fs.ensureDir(sourcePath)

      const project1Dist = path.join(refPath, 'project1', 'dist')
      await fs.ensureDir(project1Dist)
      await fs.writeFile(path.join(project1Dist, 'AGENTS.md'), '# Root', 'utf-8')

      const result = await service.exportAgentsFiles({
        sourcePath,
        targetPath,
        frontMatterType: FrontMatterType.KIRO_FILE_MATCH,
        skipRoot: true,
        processRefProjects: true,
        refPath,
        logger,
      })

      expect(result.exported).toBeGreaterThanOrEqual(0)

      const kiroSteeringDir = path.join(project1Dist, '.kiro', 'steering')
      if (await fs.pathExists(kiroSteeringDir)) {
        const files = await fs.readdir(kiroSteeringDir)
        expect(files).toHaveLength(0)
      }
    })

    it('should handle multiple ref projects', async () => {
      const sourcePath = path.join(tempDir, 'source')
      const targetPath = path.join(tempDir, 'target')
      const refPath = path.join(sourcePath, 'ref')

      await fs.ensureDir(sourcePath)

      const project1Dist = path.join(refPath, 'project1', 'dist')
      await fs.ensureDir(project1Dist)
      const project1Subdir = path.join(project1Dist, 'api')
      await fs.ensureDir(project1Subdir)
      await fs.writeFile(path.join(project1Subdir, 'AGENTS.md'), '# Project1 API', 'utf-8')

      const project2Dist = path.join(refPath, 'project2', 'dist')
      await fs.ensureDir(project2Dist)
      const project2Subdir = path.join(project2Dist, 'utils')
      await fs.ensureDir(project2Subdir)
      await fs.writeFile(path.join(project2Subdir, 'AGENTS.md'), '# Project2 Utils', 'utf-8')

      const result = await service.exportAgentsFiles({
        sourcePath,
        targetPath,
        frontMatterType: FrontMatterType.KIRO_FILE_MATCH,
        skipRoot: true,
        processRefProjects: true,
        refPath,
        logger,
      })

      expect(result.exported).toBeGreaterThanOrEqual(2)

      expect(await fs.pathExists(path.join(project1Dist, '.kiro', 'steering', '_api.md'))).toBe(true)
      expect(await fs.pathExists(path.join(project2Dist, '.kiro', 'steering', '_utils.md'))).toBe(true)
    })

    it('should export to qoder rules directory for ref projects', async () => {
      const sourcePath = path.join(tempDir, 'source')
      const targetPath = path.join(tempDir, 'target')
      const refPath = path.join(sourcePath, 'ref')

      await fs.ensureDir(sourcePath)

      const project1Dist = path.join(refPath, 'project1', 'dist')
      await fs.ensureDir(project1Dist)
      const project1Subdir = path.join(project1Dist, 'src')
      await fs.ensureDir(project1Subdir)
      await fs.writeFile(path.join(project1Subdir, 'AGENTS.md'), '# Project1 Src', 'utf-8')

      const result = await service.exportAgentsFiles({
        sourcePath,
        targetPath,
        frontMatterType: FrontMatterType.QODER_GLOB,
        skipRoot: true,
        processRefProjects: true,
        refPath,
        logger,
      })

      expect(result.exported).toBeGreaterThan(0)

      const qoderRulesDir = path.join(project1Dist, '.qoder', 'rules')
      expect(await fs.pathExists(qoderRulesDir)).toBe(true)

      const exportedFile = path.join(qoderRulesDir, '_src.md')
      expect(await fs.pathExists(exportedFile)).toBe(true)

      const content = await fs.readFile(exportedFile, 'utf-8')
      expect(content).toContain('trigger: glob')
    })
  })
})
