import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import path from 'node:path'
import {
  calculateGlobPattern,
  calculateRelativePath,
  generateRefFileName,
  generateUniqueFileName,
  isInsideDirectory,
} from './pathResolver'

/**
 * Feature: scripts-refactor, Property 5: Path calculation consistency
 * Validates: Requirements 2.4
 */
describe('pathResolver properties', () => {
  describe('calculateRelativePath', () => {
    it('should produce consistent results for same inputs', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(
            { basePath: '/project', sourcePath: '/project/src' },
            { basePath: '/other', sourcePath: '/other/api' },
            { basePath: '/base', sourcePath: '/base/lib' },
          ),
          ({ basePath, sourcePath }) => {
            const result1 = calculateRelativePath({ sourcePath, basePath })
            const result2 = calculateRelativePath({ sourcePath, basePath })

            expect(result1).toBe(result2)
          },
        ),
        { numRuns: 100 },
      )
    })
  })

  describe('calculateGlobPattern', () => {
    it('should produce consistent glob patterns for same inputs', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(
            { basePath: '/project', sourcePath: '/project/AGENTS.md' },
            { basePath: '/project', sourcePath: '/project/src/api/AGENTS.md' },
            { basePath: '/other', sourcePath: '/other/lib/AGENTS.md' },
          ),
          ({ basePath, sourcePath }) => {
            const result1 = calculateGlobPattern({ sourcePath, basePath })
            const result2 = calculateGlobPattern({ sourcePath, basePath })

            expect(result1).toBe(result2)
            expect(result1).toMatch(/^(\*\*\/\*|[\w/]+\/\*\*\/\*)$/)
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should return **/* for root files consistently', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('/project', '/other', '/base'),
          (basePath) => {
            // Use posix-style path joining to ensure consistent behavior across platforms
            const sourcePath = `${basePath}/AGENTS.md`
            const result = calculateGlobPattern({ sourcePath, basePath })

            expect(result).toBe('**/*')
          },
        ),
        { numRuns: 100 },
      )
    })
  })

  describe('generateUniqueFileName', () => {
    it('should generate consistent unique filenames for same inputs', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(
            { basePath: '/project', sourcePath: '/project/src/api/AGENTS.md' },
            { basePath: '/other', sourcePath: '/other/lib/AGENTS.md' },
          ),
          ({ basePath, sourcePath }) => {
            const result1 = generateUniqueFileName({ sourcePath, basePath })
            const result2 = generateUniqueFileName({ sourcePath, basePath })

            expect(result1).toBe(result2)
            expect(result1).toMatch(/^_.*\.md$/)
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should return _project.md for root files consistently', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('/project', '/other', '/base'),
          (basePath) => {
            // Use posix-style path joining to ensure consistent behavior across platforms
            const sourcePath = `${basePath}/AGENTS.md`
            const result = generateUniqueFileName({ sourcePath, basePath })

            expect(result).toBe('_project.md')
          },
        ),
        { numRuns: 100 },
      )
    })
  })

  describe('isInsideDirectory', () => {
    it('should produce consistent results for same inputs', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(
            { directoryPath: '/project', filePath: '/project/src/file.ts' },
            { directoryPath: '/other', filePath: '/other/api/file.ts' },
            { directoryPath: '/project', filePath: '/external/file.ts' },
          ),
          ({ directoryPath, filePath }) => {
            const result1 = isInsideDirectory(filePath, directoryPath)
            const result2 = isInsideDirectory(filePath, directoryPath)

            expect(result1).toBe(result2)
            expect(typeof result1).toBe('boolean')
          },
        ),
        { numRuns: 100 },
      )
    })
  })

  /**
   * Feature: ref-dist-memory-sync, Property 2: Ref Filename Generation
   * Validates: Requirements 3.1, 3.2, 3.3
   */
  describe('generateRefFileName', () => {
    it('should generate unique prefixed filenames for all project names and paths', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }).filter(s => !s.includes('/') && !s.includes('\\')),
          fc.array(fc.string({ minLength: 1, maxLength: 20 }).filter(s => !s.includes('/') && !s.includes('\\')), { minLength: 1, maxLength: 5 }),
          (projectName, pathSegments) => {
            const relativePath = pathSegments.join('/')
            const filename = generateRefFileName({ projectName, relativePath })

            expect(filename).toMatch(/^_ref_.+\.md$/)
            expect(filename).toContain(projectName)
            expect(filename).not.toContain('/')
            expect(filename).not.toContain('\\')
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should replace path separators with underscores', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }).filter(s => !s.includes('/') && !s.includes('\\')),
          fc.array(fc.string({ minLength: 1, maxLength: 20 }).filter(s => !s.includes('/') && !s.includes('\\')), { minLength: 1, maxLength: 5 }),
          (projectName, pathSegments) => {
            const relativePathForward = pathSegments.join('/')
            const relativePathBackward = pathSegments.join('\\')

            const filenameForward = generateRefFileName({ projectName, relativePath: relativePathForward })
            const filenameBackward = generateRefFileName({ projectName, relativePath: relativePathBackward })

            expect(filenameForward).toBe(filenameBackward)
            expect(filenameForward).not.toContain('/')
            expect(filenameForward).not.toContain('\\')
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should produce unique filenames for different project names', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }).filter(s => !s.includes('/') && !s.includes('\\')),
          fc.string({ minLength: 1, maxLength: 50 }).filter(s => !s.includes('/') && !s.includes('\\')),
          fc.string({ minLength: 1, maxLength: 20 }).filter(s => !s.includes('/') && !s.includes('\\')),
          (projectName1, projectName2, relativePath) => {
            fc.pre(projectName1 !== projectName2)

            const filename1 = generateRefFileName({ projectName: projectName1, relativePath })
            const filename2 = generateRefFileName({ projectName: projectName2, relativePath })

            expect(filename1).not.toBe(filename2)
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should produce unique filenames for different relative paths', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }).filter(s => !s.includes('/') && !s.includes('\\')),
          fc.array(fc.string({ minLength: 1, maxLength: 20 }).filter(s => !s.includes('/') && !s.includes('\\')), { minLength: 1, maxLength: 5 }),
          fc.array(fc.string({ minLength: 1, maxLength: 20 }).filter(s => !s.includes('/') && !s.includes('\\')), { minLength: 1, maxLength: 5 }),
          (projectName, pathSegments1, pathSegments2) => {
            const relativePath1 = pathSegments1.join('/')
            const relativePath2 = pathSegments2.join('/')
            fc.pre(relativePath1 !== relativePath2)

            const filename1 = generateRefFileName({ projectName, relativePath: relativePath1 })
            const filename2 = generateRefFileName({ projectName, relativePath: relativePath2 })

            expect(filename1).not.toBe(filename2)
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should escape dots in relative paths', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('TrueNine', 'compose-server', 'project'),
          fc.constantFrom('dist/.hidden', '.scripts/src', 'path/.config/file'),
          (projectName, relativePath) => {
            const filename = generateRefFileName({ projectName, relativePath })

            expect(filename).toContain('___')
            expect(filename.endsWith('.md')).toBe(true)
            const pathPart = relativePath.replace(/[\\/]/g, '_').replace(/\./g, '___')
            expect(filename).toContain(pathPart)
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should produce consistent results for same inputs', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }).filter(s => !s.includes('/') && !s.includes('\\')),
          fc.array(fc.string({ minLength: 1, maxLength: 20 }).filter(s => !s.includes('/') && !s.includes('\\')), { minLength: 1, maxLength: 5 }),
          (projectName, pathSegments) => {
            const relativePath = pathSegments.join('/')
            const filename1 = generateRefFileName({ projectName, relativePath })
            const filename2 = generateRefFileName({ projectName, relativePath })

            expect(filename1).toBe(filename2)
          },
        ),
        { numRuns: 100 },
      )
    })
  })
})
