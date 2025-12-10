import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import path from 'node:path'
import fs from 'fs-extra'
import os from 'node:os'
import { RuleGeneratorService } from './RuleGeneratorService'
import { FrontMatterType } from '../../utils/frontMatter'
import { LogAdapter } from '../../utils/log'

describe('RuleGeneratorService', () => {
  let service: RuleGeneratorService
  let tempDir: string
  let sourceDir: string
  let targetDir: string
  let logger: LogAdapter

  beforeEach(async () => {
    service = new RuleGeneratorService()
    logger = new LogAdapter('test')

    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rule-gen-test-'))
    sourceDir = path.join(tempDir, 'source')
    targetDir = path.join(tempDir, 'target')

    await fs.ensureDir(sourceDir)
    await fs.ensureDir(targetDir)
  })

  afterEach(async () => {
    await fs.remove(tempDir)
  })

  describe('generateRuleFile', () => {
    it('should generate rule file with KIRO_ALWAYS front matter', async () => {
      const sourceFile = path.join(sourceDir, 'AGENTS.md')
      await fs.writeFile(sourceFile, '# Test Content\n\nThis is a test.', 'utf-8')

      const result = await service.generateRuleFile({
        sourceFile,
        targetDir,
        frontMatterOptions: {
          type: FrontMatterType.KIRO_ALWAYS,
        },
        basePath: sourceDir,
        logger,
      })

      expect(result).toBe(true)

      const targetFile = path.join(targetDir, '_project.md')
      const content = await fs.readFile(targetFile, 'utf-8')

      expect(content).toContain('---')
      expect(content).toContain('inclusion: always')
      expect(content).toContain('# Test Content')
    })

    it('should generate rule file with KIRO_FILE_MATCH front matter', async () => {
      const sourceFile = path.join(sourceDir, 'src', 'api', 'AGENTS.md')
      await fs.ensureDir(path.dirname(sourceFile))
      await fs.writeFile(sourceFile, '# API Rules', 'utf-8')

      const result = await service.generateRuleFile({
        sourceFile,
        targetDir,
        frontMatterOptions: {
          type: FrontMatterType.KIRO_FILE_MATCH,
        },
        basePath: sourceDir,
        logger,
      })

      expect(result).toBe(true)

      const targetFile = path.join(targetDir, '_src_api.md')
      const content = await fs.readFile(targetFile, 'utf-8')

      expect(content).toContain('---')
      expect(content).toContain('inclusion: fileMatch')
      expect(content).toContain('fileMatchPattern: "src/api/**/*"')
      expect(content).toContain('# API Rules')
    })

    it('should generate rule file with QODER_ALWAYS front matter', async () => {
      const sourceFile = path.join(sourceDir, 'AGENTS.md')
      await fs.writeFile(sourceFile, '# Qoder Rules', 'utf-8')

      const result = await service.generateRuleFile({
        sourceFile,
        targetDir,
        frontMatterOptions: {
          type: FrontMatterType.QODER_ALWAYS,
        },
        basePath: sourceDir,
        logger,
      })

      expect(result).toBe(true)

      const targetFile = path.join(targetDir, '_project.md')
      const content = await fs.readFile(targetFile, 'utf-8')

      expect(content).toContain('---')
      expect(content).toContain('trigger: always_on')
      expect(content).toContain('alwaysApply: true')
      expect(content).toContain('# Qoder Rules')
    })

    it('should generate rule file with QODER_GLOB front matter', async () => {
      const sourceFile = path.join(sourceDir, 'src', 'utils', 'AGENTS.md')
      await fs.ensureDir(path.dirname(sourceFile))
      await fs.writeFile(sourceFile, '# Utils Rules', 'utf-8')

      const result = await service.generateRuleFile({
        sourceFile,
        targetDir,
        frontMatterOptions: {
          type: FrontMatterType.QODER_GLOB,
        },
        basePath: sourceDir,
        logger,
      })

      expect(result).toBe(true)

      const targetFile = path.join(targetDir, '_src_utils.md')
      const content = await fs.readFile(targetFile, 'utf-8')

      expect(content).toContain('---')
      expect(content).toContain('trigger: glob')
      expect(content).toContain('glob: src/utils/**/*')
      expect(content).toContain('# Utils Rules')
    })

    it('should use custom file name generator', async () => {
      const sourceFile = path.join(sourceDir, 'AGENTS.md')
      await fs.writeFile(sourceFile, '# Custom Name', 'utf-8')

      const customGenerator = () => 'custom-name.md'

      const result = await service.generateRuleFile({
        sourceFile,
        targetDir,
        frontMatterOptions: {
          type: FrontMatterType.KIRO_ALWAYS,
        },
        basePath: sourceDir,
        fileNameGenerator: customGenerator,
        logger,
      })

      expect(result).toBe(true)

      const targetFile = path.join(targetDir, 'custom-name.md')
      expect(await fs.pathExists(targetFile)).toBe(true)
    })

    it('should use custom glob pattern generator', async () => {
      const sourceFile = path.join(sourceDir, 'src', 'AGENTS.md')
      await fs.ensureDir(path.dirname(sourceFile))
      await fs.writeFile(sourceFile, '# Custom Pattern', 'utf-8')

      const customPatternGenerator = () => 'custom/**'

      const result = await service.generateRuleFile({
        sourceFile,
        targetDir,
        frontMatterOptions: {
          type: FrontMatterType.KIRO_FILE_MATCH,
        },
        basePath: sourceDir,
        globPatternGenerator: customPatternGenerator,
        logger,
      })

      expect(result).toBe(true)

      const targetFile = path.join(targetDir, '_src.md')
      const content = await fs.readFile(targetFile, 'utf-8')

      expect(content).toContain('fileMatchPattern: "custom/**"')
    })

    it('should use provided pattern when specified', async () => {
      const sourceFile = path.join(sourceDir, 'AGENTS.md')
      await fs.writeFile(sourceFile, '# Explicit Pattern', 'utf-8')

      const result = await service.generateRuleFile({
        sourceFile,
        targetDir,
        frontMatterOptions: {
          type: FrontMatterType.KIRO_FILE_MATCH,
          pattern: 'explicit/pattern/**',
        },
        basePath: sourceDir,
        logger,
      })

      expect(result).toBe(true)

      const targetFile = path.join(targetDir, '_project.md')
      const content = await fs.readFile(targetFile, 'utf-8')

      expect(content).toContain('fileMatchPattern: "explicit/pattern/**"')
    })

    it('should return false when source file does not exist', async () => {
      const sourceFile = path.join(sourceDir, 'nonexistent.md')

      const result = await service.generateRuleFile({
        sourceFile,
        targetDir,
        frontMatterOptions: {
          type: FrontMatterType.KIRO_ALWAYS,
        },
        basePath: sourceDir,
        logger,
      })

      expect(result).toBe(false)
    })

    it('should create target directory if it does not exist', async () => {
      const sourceFile = path.join(sourceDir, 'AGENTS.md')
      await fs.writeFile(sourceFile, '# Test', 'utf-8')

      const newTargetDir = path.join(tempDir, 'new-target', 'nested')

      const result = await service.generateRuleFile({
        sourceFile,
        targetDir: newTargetDir,
        frontMatterOptions: {
          type: FrontMatterType.KIRO_ALWAYS,
        },
        basePath: sourceDir,
        logger,
      })

      expect(result).toBe(true)
      expect(await fs.pathExists(newTargetDir)).toBe(true)
    })

    it('should handle BOM in source files', async () => {
      const sourceFile = path.join(sourceDir, 'AGENTS.md')
      await fs.writeFile(sourceFile, '\uFEFF# Content with BOM', 'utf-8')

      const result = await service.generateRuleFile({
        sourceFile,
        targetDir,
        frontMatterOptions: {
          type: FrontMatterType.KIRO_ALWAYS,
        },
        basePath: sourceDir,
        logger,
      })

      expect(result).toBe(true)

      const targetFile = path.join(targetDir, '_project.md')
      const content = await fs.readFile(targetFile, 'utf-8')

      expect(content).not.toContain('\uFEFF')
      expect(content).toContain('# Content with BOM')
    })
  })

  describe('batchGenerateRules', () => {
    it('should generate multiple rule files', async () => {
      const file1 = path.join(sourceDir, 'AGENTS.md')
      const file2 = path.join(sourceDir, 'src', 'AGENTS.md')
      const file3 = path.join(sourceDir, 'docs', 'AGENTS.md')

      await fs.writeFile(file1, '# Root', 'utf-8')
      await fs.ensureDir(path.dirname(file2))
      await fs.writeFile(file2, '# Src', 'utf-8')
      await fs.ensureDir(path.dirname(file3))
      await fs.writeFile(file3, '# Docs', 'utf-8')

      const result = await service.batchGenerateRules(
        [file1, file2, file3],
        {
          targetDir,
          frontMatterOptions: {
            type: FrontMatterType.KIRO_ALWAYS,
          },
          basePath: sourceDir,
          logger,
        },
      )

      expect(result.generated).toBe(3)
      expect(result.failed).toBe(0)
      expect(result.errors).toHaveLength(0)

      expect(await fs.pathExists(path.join(targetDir, '_project.md'))).toBe(true)
      expect(await fs.pathExists(path.join(targetDir, '_src.md'))).toBe(true)
      expect(await fs.pathExists(path.join(targetDir, '_docs.md'))).toBe(true)
    })

    it('should handle partial failures', async () => {
      const file1 = path.join(sourceDir, 'AGENTS.md')
      const file2 = path.join(sourceDir, 'nonexistent.md')
      const file3 = path.join(sourceDir, 'docs', 'AGENTS.md')

      await fs.writeFile(file1, '# Root', 'utf-8')
      await fs.ensureDir(path.join(sourceDir, 'docs'))
      await fs.writeFile(file3, '# Docs', 'utf-8')

      const result = await service.batchGenerateRules(
        [file1, file2, file3],
        {
          targetDir,
          frontMatterOptions: {
            type: FrontMatterType.KIRO_ALWAYS,
          },
          basePath: sourceDir,
          logger,
        },
      )

      expect(result.generated).toBe(2)
      expect(result.failed).toBe(1)
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0]).toContain('nonexistent.md')
    })

    it('should handle empty file list', async () => {
      const result = await service.batchGenerateRules(
        [],
        {
          targetDir,
          frontMatterOptions: {
            type: FrontMatterType.KIRO_ALWAYS,
          },
          basePath: sourceDir,
          logger,
        },
      )

      expect(result.generated).toBe(0)
      expect(result.failed).toBe(0)
      expect(result.errors).toHaveLength(0)
    })

    it('should generate files with different front matter types', async () => {
      const file1 = path.join(sourceDir, 'AGENTS.md')
      const file2 = path.join(sourceDir, 'src', 'AGENTS.md')

      await fs.writeFile(file1, '# Root', 'utf-8')
      await fs.ensureDir(path.dirname(file2))
      await fs.writeFile(file2, '# Src', 'utf-8')

      const result = await service.batchGenerateRules(
        [file1, file2],
        {
          targetDir,
          frontMatterOptions: {
            type: FrontMatterType.QODER_GLOB,
          },
          basePath: sourceDir,
          logger,
        },
      )

      expect(result.generated).toBe(2)
      expect(result.failed).toBe(0)

      const content1 = await fs.readFile(path.join(targetDir, '_project.md'), 'utf-8')
      const content2 = await fs.readFile(path.join(targetDir, '_src.md'), 'utf-8')

      expect(content1).toContain('trigger: glob')
      expect(content1).toContain('glob: **/*')
      expect(content2).toContain('trigger: glob')
      expect(content2).toContain('glob: src/**/*')
    })
  })
})

