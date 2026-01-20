import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import {createLogger} from '@/log'
import {cleanStaleDistFiles, syncDirectory} from './EffectUtils'

describe('cleanStaleDistFiles', () => {
  let tempDir: string,
    srcDir: string,
    distDir: string,
    mockLogger: ReturnType<typeof createLogger>

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-clean-stale-'))
    srcDir = path.join(tempDir, 'src')
    distDir = path.join(tempDir, 'dist')
    fs.mkdirSync(srcDir, {recursive: true})
    fs.mkdirSync(distDir, {recursive: true})
    mockLogger = createLogger('test')
  })

  afterEach(() => fs.rmSync(tempDir, {recursive: true, force: true}))

  it('should delete dist files without corresponding src files', () => {
    fs.mkdirSync(path.join(srcDir, 'skill-a')) // Create src file
    fs.writeFileSync(path.join(srcDir, 'skill-a', 'skill.md'), '# Skill A')

    fs.writeFileSync(path.join(distDir, 'skill-a.md'), '# Skill A compiled') // Create dist files (one valid, one stale)
    fs.writeFileSync(path.join(distDir, 'skill-b.md'), '# Skill B compiled (stale)')

    const result = cleanStaleDistFiles({fs, path, logger: mockLogger}, {srcDir, distDir, logger: mockLogger})

    expect(result.deletedFiles).toHaveLength(1)
    expect(result.deletedFiles[0]).toContain('skill-b.md')
    expect(fs.existsSync(path.join(distDir, 'skill-a.md'))).toBe(true)
    expect(fs.existsSync(path.join(distDir, 'skill-b.md'))).toBe(false)
  })

  it('should handle dry-run mode', () => {
    fs.writeFileSync(path.join(distDir, 'stale.md'), '# Stale')

    const result = cleanStaleDistFiles({fs, path, logger: mockLogger}, {srcDir, distDir, dryRun: true, logger: mockLogger})

    expect(result.wouldDelete).toHaveLength(1)
    expect(result.deletedFiles).toHaveLength(0)
    expect(fs.existsSync(path.join(distDir, 'stale.md'))).toBe(true)
  })

  it('should recursively clean subdirectories', () => {
    fs.mkdirSync(path.join(srcDir, 'sub', 'skill-a'), {recursive: true}) // Create src structure
    fs.writeFileSync(path.join(srcDir, 'sub', 'skill-a', 'skill.md'), '# Skill A')

    fs.mkdirSync(path.join(distDir, 'sub'), {recursive: true}) // Create dist structure with stale directory
    fs.writeFileSync(path.join(distDir, 'sub', 'skill-a.md'), '# Skill A')
    fs.mkdirSync(path.join(distDir, 'stale-dir'), {recursive: true})
    fs.writeFileSync(path.join(distDir, 'stale-dir', 'file.md'), '# Stale')

    const result = cleanStaleDistFiles({fs, path, logger: mockLogger}, {srcDir, distDir, logger: mockLogger})

    expect(result.deletedFiles.some(f => f.includes('stale-dir'))).toBe(true)
    expect(fs.existsSync(path.join(distDir, 'stale-dir'))).toBe(false)
  })

  it('should return empty result when dist directory does not exist', () => {
    fs.rmSync(distDir, {recursive: true})

    const result = cleanStaleDistFiles({fs, path, logger: mockLogger}, {srcDir, distDir, logger: mockLogger})

    expect(result.deletedFiles).toHaveLength(0)
    expect(result.wouldDelete).toHaveLength(0)
    expect(result.errors).toHaveLength(0)
  })
})

describe('syncDirectory', () => {
  let tempDir: string,
    srcDir: string,
    targetDir: string,
    mockLogger: ReturnType<typeof createLogger>

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-sync-'))
    srcDir = path.join(tempDir, 'src')
    targetDir = path.join(tempDir, 'target')
    fs.mkdirSync(srcDir, {recursive: true})
    mockLogger = createLogger('test')
  })

  afterEach(() => fs.rmSync(tempDir, {recursive: true, force: true}))

  it('should copy files from src to target', () => {
    fs.writeFileSync(path.join(srcDir, 'file1.md'), '# File 1')
    fs.writeFileSync(path.join(srcDir, 'file2.md'), '# File 2')

    const result = syncDirectory({fs, path, logger: mockLogger}, {srcDir, targetDir, logger: mockLogger})

    expect(result.copiedFiles).toHaveLength(2)
    expect(fs.existsSync(path.join(targetDir, 'file1.md'))).toBe(true)
    expect(fs.existsSync(path.join(targetDir, 'file2.md'))).toBe(true)
  })

  it('should delete orphaned files when deleteOrphans is true', () => {
    fs.writeFileSync(path.join(srcDir, 'keep.md'), '# Keep')
    fs.mkdirSync(targetDir, {recursive: true})
    fs.writeFileSync(path.join(targetDir, 'keep.md'), '# Old Keep')
    fs.writeFileSync(path.join(targetDir, 'orphan.md'), '# Orphan')

    const result = syncDirectory({fs, path, logger: mockLogger}, {srcDir, targetDir, deleteOrphans: true, logger: mockLogger})

    expect(result.deletedFiles).toHaveLength(1)
    expect(result.deletedFiles[0]).toContain('orphan.md')
    expect(fs.existsSync(path.join(targetDir, 'keep.md'))).toBe(true)
    expect(fs.existsSync(path.join(targetDir, 'orphan.md'))).toBe(false)
  })

  it('should handle dry-run mode', () => {
    fs.writeFileSync(path.join(srcDir, 'file.md'), '# File')

    const result = syncDirectory({fs, path, logger: mockLogger}, {srcDir, targetDir, dryRun: true, logger: mockLogger})

    expect(result.copiedFiles).toHaveLength(1)
    expect(fs.existsSync(targetDir)).toBe(false)
  })

  it('should recursively sync subdirectories', () => {
    fs.mkdirSync(path.join(srcDir, 'sub'), {recursive: true})
    fs.writeFileSync(path.join(srcDir, 'sub', 'nested.md'), '# Nested')

    const result = syncDirectory({fs, path, logger: mockLogger}, {srcDir, targetDir, logger: mockLogger})

    expect(result.copiedFiles.some(f => f.includes('nested.md'))).toBe(true)
    expect(fs.existsSync(path.join(targetDir, 'sub', 'nested.md'))).toBe(true)
  })
})
