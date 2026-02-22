import type {WriteLogger} from './index'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import * as fc from 'fast-check'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import {
  createFileRelativePath,
  createRelativePath,
  deleteDirectories,
  deleteFiles,
  ensureDir,
  FilePathKind,
  readFileSync,
  writeFileSafe,
  writeFileSync

} from './index'

let tmpDir: string

beforeEach(() => tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'desk-paths-test-')))

afterEach(() => fs.rmSync(tmpDir, {recursive: true, force: true}))

/** Generate safe relative path segments (no special chars, no empty) */
const alphaNum = 'abcdefghijklmnopqrstuvwxyz0123456789'
const safeSegment = fc.array(fc.constantFrom(...alphaNum), {minLength: 1, maxLength: 8}).map(chars => chars.join(''))
const safePath = fc.array(safeSegment, {minLength: 1, maxLength: 4}).map(segs => segs.join('/'))

describe('ensureDir', () => { // Property 1: ensureDir idempotence
  it('property: calling ensureDir multiple times is idempotent', () => {
    fc.assert(fc.property(safePath, relPath => {
      const dir = path.join(tmpDir, relPath)
      ensureDir(dir)
      expect(fs.existsSync(dir)).toBe(true)
      expect(fs.statSync(dir).isDirectory()).toBe(true)

      ensureDir(dir) // Second call should not throw and dir still exists
      expect(fs.existsSync(dir)).toBe(true)
      expect(fs.statSync(dir).isDirectory()).toBe(true)
    }), {numRuns: 30})
  })
})

describe('writeFileSync / readFileSync', () => { // Property 2: writeFileSync/readFileSync round-trip
  it('property: round-trip preserves content', () => {
    fc.assert(fc.property(safeSegment, fc.string({minLength: 0, maxLength: 500}), (name, content) => {
      const filePath = path.join(tmpDir, `${name}.txt`)
      writeFileSync(filePath, content)
      const read = readFileSync(filePath)
      expect(read).toBe(content)
    }), {numRuns: 30})
  })

  it('property: writeFileSync auto-creates parent directories', () => {
    fc.assert(fc.property(safePath, safeSegment, (relDir, name) => {
      const filePath = path.join(tmpDir, relDir, `${name}.txt`)
      writeFileSync(filePath, 'test')
      expect(fs.existsSync(filePath)).toBe(true)
    }), {numRuns: 20})
  })

  it('readFileSync throws with path context on missing file', () => {
    const missing = path.join(tmpDir, 'nonexistent.txt')
    expect(() => readFileSync(missing)).toThrow(missing)
  })
})

describe('deleteFiles', () => { // Property 3: deleteFiles removes all existing files
  it('property: deletes all existing files and skips non-existent', () => {
    fc.assert(fc.property(
      fc.array(safeSegment, {minLength: 1, maxLength: 5}),
      names => {
        const uniqueNames = [...new Set(names)]
        const existingFiles = uniqueNames.map(n => {
          const p = path.join(tmpDir, `${n}.txt`)
          fs.writeFileSync(p, 'data')
          return p
        })
        const nonExistent = path.join(tmpDir, 'ghost.txt')
        const allFiles = [...existingFiles, nonExistent]

        const result = deleteFiles(allFiles)
        expect(result.deleted).toBe(existingFiles.length)
        expect(result.errors).toHaveLength(0)

        for (const f of existingFiles) expect(fs.existsSync(f)).toBe(false)
      }
    ), {numRuns: 20})
  })
})

describe('deleteDirectories', () => { // Property 4: deleteDirectories removes all directories regardless of input order
  it('property: removes nested directories in correct order', () => {
    fc.assert(fc.property(
      fc.array(safeSegment, {minLength: 2, maxLength: 4}),
      segments => {
        const dirs: string[] = [] // Create nested directory structure
        for (let i = 1; i <= segments.length; i++) {
          const dir = path.join(tmpDir, ...segments.slice(0, i))
          fs.mkdirSync(dir, {recursive: true})
          dirs.push(dir)
        }

        const shuffled = [...dirs].sort(() => Math.random() - 0.5) // Shuffle to test order independence
        const result = deleteDirectories(shuffled)

        expect(result.errors).toHaveLength(0)
        for (const d of dirs) { // At least the deepest should be deleted; parents may already be gone
          expect(fs.existsSync(d)).toBe(false)
        }
      }
    ), {numRuns: 20})
  })
})

describe('createRelativePath', () => { // Property 5: createRelativePath construction correctness
  it('property: pathKind is always Relative, path and basePath match inputs', () => {
    fc.assert(fc.property(safePath, safePath, (pathStr, basePath) => {
      const rp = createRelativePath(pathStr, basePath, () => 'dir')
      expect(rp.pathKind).toBe(FilePathKind.Relative)
      expect(rp.path).toBe(pathStr)
      expect(rp.basePath).toBe(basePath)
      expect(rp.getDirectoryName()).toBe('dir')
      expect(rp.getAbsolutePath()).toBe(path.join(basePath, pathStr))
    }), {numRuns: 30})
  })
})

describe('createFileRelativePath', () => { // Property 6: createFileRelativePath construction correctness
  it('property: file path is parent path joined with filename', () => {
    fc.assert(fc.property(safePath, safePath, safeSegment, (dirPath, basePath, fileName) => {
      const parent = createRelativePath(dirPath, basePath, () => 'parentDir')
      const file = createFileRelativePath(parent, fileName)

      expect(file.pathKind).toBe(FilePathKind.Relative)
      expect(file.path).toBe(path.join(dirPath, fileName))
      expect(file.basePath).toBe(basePath)
      expect(file.getDirectoryName()).toBe('parentDir')
      expect(file.getAbsolutePath()).toBe(path.join(basePath, dirPath, fileName))
    }), {numRuns: 30})
  })
})

describe('writeFileSafe', () => { // Property for writeFileSafe
  const noopLogger: WriteLogger = {
    trace: () => {},
    error: () => {}
  }

  it('property: dry-run never creates files', () => {
    fc.assert(fc.property(safeSegment, fc.string({minLength: 1, maxLength: 100}), (name, content) => {
      const fullPath = path.join(tmpDir, 'dryrun', `${name}.txt`)
      const rp = createRelativePath(`${name}.txt`, path.join(tmpDir, 'dryrun'), () => 'dryrun')

      const result = writeFileSafe({fullPath, content, type: 'test', relativePath: rp, dryRun: true, logger: noopLogger})
      expect(result.success).toBe(true)
      expect(result.skipped).toBe(false)
      expect(fs.existsSync(fullPath)).toBe(false)
    }), {numRuns: 20})
  })

  it('property: non-dry-run creates files with correct content', () => {
    fc.assert(fc.property(safeSegment, fc.string({minLength: 1, maxLength: 100}), (name, content) => {
      const fullPath = path.join(tmpDir, 'write', `${name}.txt`)
      const rp = createRelativePath(`${name}.txt`, path.join(tmpDir, 'write'), () => 'write')

      const result = writeFileSafe({fullPath, content, type: 'test', relativePath: rp, dryRun: false, logger: noopLogger})
      expect(result.success).toBe(true)
      expect(fs.readFileSync(fullPath, 'utf8')).toBe(content)
    }), {numRuns: 20})
  })
})
