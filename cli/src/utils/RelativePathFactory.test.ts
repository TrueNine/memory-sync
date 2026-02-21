import {FilePathKind} from '@truenine/plugin-shared'
import {describe, expect, it} from 'vitest'
import {
  createFileRelativePath,
  createRelativePath,
  createRelativePathWithDirName,
  createSubdirRelativePath
} from './RelativePathFactory'

describe('relativePathFactory', () => {
  describe('createRelativePath', () => {
    it('should create a RelativePath with correct properties', () => {
      const rp = createRelativePath({pathStr: 'skills/docker', basePath: '/home/user/.gemini'})

      expect(rp.pathKind).toBe(FilePathKind.Relative)
      expect(rp.path).toBe('skills/docker')
      expect(rp.basePath).toBe('/home/user/.gemini')
    })

    it('should return correct directory name', () => {
      const rp = createRelativePath({pathStr: 'skills/docker', basePath: '/home/user/.gemini'})

      expect(rp.getDirectoryName()).toBe('skills')
    })

    it('should return correct absolute path', () => {
      const rp = createRelativePath({pathStr: 'skills/docker', basePath: '/home/user/.gemini'})

      expect(rp.getAbsolutePath()).toContain('skills')
      expect(rp.getAbsolutePath()).toContain('docker')
    })
  })

  describe('createRelativePathWithDirName', () => {
    it('should use custom directory name', () => {
      const rp = createRelativePathWithDirName({
        pathStr: 'commands/build.md',
        basePath: '/project/.claude',
        dirName: 'build'
      })

      expect(rp.getDirectoryName()).toBe('build')
      expect(rp.path).toBe('commands/build.md')
    })
  })

  describe('createFileRelativePath', () => {
    it('should create file path within directory', () => {
      const dir = createRelativePath({pathStr: 'skills/docker', basePath: '/home/user/.gemini'})
      const file = createFileRelativePath(dir, 'SKILL.md')

      expect(file.path).toContain('SKILL.md')
      expect(file.getDirectoryName()).toBe('skills')
      expect(file.getAbsolutePath()).toContain('SKILL.md')
    })
  })

  describe('createSubdirRelativePath', () => {
    it('should create subdirectory path', () => {
      const parent = createRelativePath({pathStr: '.claude', basePath: '/home/user'})
      const subdir = createSubdirRelativePath(parent, 'commands')

      expect(subdir.path).toContain('commands')
      expect(subdir.getDirectoryName()).toBe('commands')
      expect(subdir.basePath).toBe('/home/user')
    })
  })
})
