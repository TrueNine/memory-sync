import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {deleteEmptyDirectories, deleteFiles, deleteTargets, getPlatformFixedDir} from '../../test/native-binding/desk-paths'

const defaultNativeBinding = globalThis.__TNMSC_TEST_NATIVE_BINDING__

describe('desk paths', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
    globalThis.__TNMSC_TEST_NATIVE_BINDING__ = defaultNativeBinding
  })

  it('delegates getPlatformFixedDir to the native binding', () => {
    const getPlatformFixedDirMock = vi.fn(() => '/tmp/native-fixed-dir')
    globalThis.__TNMSC_TEST_NATIVE_BINDING__ = {
      ...defaultNativeBinding,
      getPlatformFixedDir: getPlatformFixedDirMock
    }

    expect(getPlatformFixedDir()).toBe('/tmp/native-fixed-dir')
    expect(getPlatformFixedDirMock).toHaveBeenCalledOnce()
  })

  it('falls back to platform-specific fixed dir when the native binding is unavailable', () => {
    globalThis.__TNMSC_TEST_NATIVE_BINDING__ = void 0

    const result = getPlatformFixedDir()
    expect(result.length).toBeGreaterThan(0)
    expect(path.isAbsolute(result)).toBe(true)
  })

  it('deletes mixed file and directory targets in one batch', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-desk-paths-delete-targets-'))
    const outputFile = path.join(tempDir, 'output.txt')
    const outputDir = path.join(tempDir, 'nested')
    const nestedFile = path.join(outputDir, 'artifact.txt')

    try {
      fs.mkdirSync(outputDir, {recursive: true})
      fs.writeFileSync(outputFile, 'file', 'utf8')
      fs.writeFileSync(nestedFile, 'nested', 'utf8')

      const result = await deleteTargets({
        files: [outputFile],
        dirs: [outputDir]
      })

      expect(result.deletedFiles).toEqual([outputFile])
      expect(result.deletedDirs).toEqual([outputDir])
      expect(result.fileErrors).toEqual([])
      expect(result.dirErrors).toEqual([])
      expect(fs.existsSync(outputFile)).toBe(false)
      expect(fs.existsSync(outputDir)).toBe(false)
    }
    finally {
      fs.rmSync(tempDir, {recursive: true, force: true})
    }
  })

  it('caps delete file concurrency to the configured worker limit', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-desk-paths-concurrency-'))
    const files = Array.from({length: 40}, (_, index) => path.join(tempDir, `artifact-${index}.txt`))
    let active = 0
    let maxActive = 0
    const originalLstat = fs.promises.lstat.bind(fs.promises)

    try {
      fs.mkdirSync(tempDir, {recursive: true})
      for (const filePath of files) fs.writeFileSync(filePath, 'artifact', 'utf8')

      vi.spyOn(fs.promises, 'lstat').mockImplementation(async filePath => {
        active += 1
        maxActive = Math.max(maxActive, active)
        await new Promise(resolve => setTimeout(resolve, 20))

        try {
          return await originalLstat(filePath)
        }
        finally {
          active -= 1
        }
      })

      const result = await deleteFiles(files)

      expect(result.deleted).toBe(files.length)
      expect(result.errors).toEqual([])
      expect(maxActive).toBeLessThanOrEqual(32)
      expect(maxActive).toBeGreaterThan(1)
    }
    finally {
      fs.rmSync(tempDir, {recursive: true, force: true})
    }
  })

  it('deletes only empty directories from deepest to shallowest', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-desk-paths-empty-dirs-'))
    const parentDir = path.join(tempDir, 'empty-parent')
    const childDir = path.join(parentDir, 'leaf')
    const nonEmptyDir = path.join(tempDir, 'non-empty')

    try {
      fs.mkdirSync(childDir, {recursive: true})
      fs.mkdirSync(nonEmptyDir, {recursive: true})
      fs.writeFileSync(path.join(nonEmptyDir, 'keep.txt'), 'keep', 'utf8')

      const result = await deleteEmptyDirectories([parentDir, childDir, nonEmptyDir])

      expect(result.deleted).toBe(2)
      expect(result.deletedPaths).toEqual([childDir, parentDir])
      expect(result.errors).toEqual([])
      expect(fs.existsSync(parentDir)).toBe(false)
      expect(fs.existsSync(nonEmptyDir)).toBe(true)
    }
    finally {
      fs.rmSync(tempDir, {recursive: true, force: true})
    }
  })

  it('skips directories that become non-empty before empty-directory deletion runs', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-desk-paths-empty-race-'))
    const targetDir = path.join(tempDir, 'maybe-empty')

    try {
      fs.mkdirSync(targetDir, {recursive: true})
      fs.writeFileSync(path.join(targetDir, 'new-file.txt'), 'late write', 'utf8')

      const result = await deleteEmptyDirectories([targetDir, path.join(tempDir, 'missing')])

      expect(result.deleted).toBe(0)
      expect(result.deletedPaths).toEqual([])
      expect(result.errors).toEqual([])
      expect(fs.existsSync(targetDir)).toBe(true)
    }
    finally {
      fs.rmSync(tempDir, {recursive: true, force: true})
    }
  })
})
