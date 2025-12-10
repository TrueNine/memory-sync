import { describe, expect, it } from 'vitest'
import path from 'node:path'
import {
  calculateGlobPattern,
  calculateRelativePath,
  generateRefFileName,
  generateUniqueFileName,
  isInsideDirectory,
} from './pathResolver'

describe('pathResolver', () => {
  describe('calculateRelativePath', () => {
    it('should calculate relative path from base to source', () => {
      const result = calculateRelativePath({
        sourcePath: '/project/src/api',
        basePath: '/project',
      })
      // Unix-style paths return posix-style relative paths
      expect(result).toBe('src/api')
    })

    it('should handle same path', () => {
      const result = calculateRelativePath({
        sourcePath: '/project',
        basePath: '/project',
      })
      expect(result).toBe('')
    })
  })

  describe('calculateGlobPattern', () => {
    it('should return **/* for root files', () => {
      const result = calculateGlobPattern({
        sourcePath: '/project/AGENTS.md',
        basePath: '/project',
      })
      expect(result).toBe('**/*')
    })

    it('should return dir/**/* for nested files', () => {
      const result = calculateGlobPattern({
        sourcePath: '/project/src/api/AGENTS.md',
        basePath: '/project',
      })
      expect(result).toBe('src/api/**/*')
    })

    it('should handle Windows paths correctly', () => {
      const result = calculateGlobPattern({
        sourcePath: 'C:\\project\\src\\api\\AGENTS.md',
        basePath: 'C:\\project',
      })
      expect(result).toBe('src/api/**/*')
    })

    it('should handle deeply nested paths', () => {
      const result = calculateGlobPattern({
        sourcePath: '/project/src/services/auth/AGENTS.md',
        basePath: '/project',
      })
      expect(result).toBe('src/services/auth/**/*')
    })
  })

  describe('generateUniqueFileName', () => {
    it('should return _project.md for root files', () => {
      const result = generateUniqueFileName({
        sourcePath: '/project/AGENTS.md',
        basePath: '/project',
      })
      expect(result).toBe('_project.md')
    })

    it('should generate unique filename for nested files', () => {
      const result = generateUniqueFileName({
        sourcePath: '/project/src/api/AGENTS.md',
        basePath: '/project',
      })
      expect(result).toBe('_src_api.md')
    })

    it('should handle Windows paths correctly', () => {
      const result = generateUniqueFileName({
        sourcePath: 'C:\\project\\src\\api\\AGENTS.md',
        basePath: 'C:\\project',
      })
      expect(result).toBe('_src_api.md')
    })

    it('should escape dots in directory names', () => {
      const result = generateUniqueFileName({
        sourcePath: '/project/.scripts/src/AGENTS.md',
        basePath: '/project',
      })
      expect(result).toBe('____scripts_src.md')
    })

    it('should handle deeply nested paths', () => {
      const result = generateUniqueFileName({
        sourcePath: '/project/src/services/auth/AGENTS.md',
        basePath: '/project',
      })
      expect(result).toBe('_src_services_auth.md')
    })
  })

  describe('isInsideDirectory', () => {
    it('should return true for files inside directory', () => {
      const result = isInsideDirectory('/project/src/file.ts', '/project')
      expect(result).toBe(true)
    })

    it('should return false for files outside directory', () => {
      const result = isInsideDirectory('/other/file.ts', '/project')
      expect(result).toBe(false)
    })

    it('should return false for parent directory', () => {
      const result = isInsideDirectory('/project', '/project/src')
      expect(result).toBe(false)
    })

    it('should return false for same path', () => {
      const result = isInsideDirectory('/project', '/project')
      expect(result).toBe(false)
    })

    it('should handle deeply nested paths', () => {
      const result = isInsideDirectory('/project/src/services/auth/file.ts', '/project')
      expect(result).toBe(true)
    })

    it('should handle paths with similar prefixes', () => {
      const result = isInsideDirectory('/project-other/file.ts', '/project')
      expect(result).toBe(false)
    })
  })

  describe('generateRefFileName', () => {
    it('should generate ref filename with project name and path', () => {
      const result = generateRefFileName({
        projectName: 'TrueNine',
        relativePath: 'dist',
      })
      expect(result).toBe('_ref_TrueNine_dist.md')
    })

    it('should replace forward slashes with underscores', () => {
      const result = generateRefFileName({
        projectName: 'compose-server',
        relativePath: 'dist/gradle',
      })
      expect(result).toBe('_ref_compose-server_dist_gradle.md')
    })

    it('should replace backslashes with underscores', () => {
      const result = generateRefFileName({
        projectName: 'TrueNine',
        relativePath: 'dist\\oss',
      })
      expect(result).toBe('_ref_TrueNine_dist_oss.md')
    })

    it('should handle deeply nested paths', () => {
      const result = generateRefFileName({
        projectName: 'compose-server',
        relativePath: 'dist/oss/oss-minio',
      })
      expect(result).toBe('_ref_compose-server_dist_oss_oss-minio.md')
    })

    it('should escape dots in paths', () => {
      const result = generateRefFileName({
        projectName: 'project',
        relativePath: 'dist/.hidden',
      })
      expect(result).toBe('_ref_project_dist____hidden.md')
    })

    it('should handle mixed separators', () => {
      const result = generateRefFileName({
        projectName: 'project',
        relativePath: 'dist/sub\\folder',
      })
      expect(result).toBe('_ref_project_dist_sub_folder.md')
    })
  })
})
