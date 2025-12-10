import { describe, expect, it } from 'vitest'
import { getProjectExcludePatterns, PathBuilder, USER_HOME, USER_PROJECTS_DIR } from './paths'

describe('PathBuilder', () => {
  describe('static factory methods', () => {
    it('should create PathBuilder for project', () => {
      const builder = PathBuilder.forProject('aindex')

      expect(builder.root()).toContain('aindex')
    })

    it('should create PathBuilder from absolute path', () => {
      const testPath = '/test/path'
      const builder = PathBuilder.fromPath(testPath)

      expect(builder.root()).toBe(testPath)
    })
  })

  describe('path building', () => {
    it('should build dist path', () => {
      const builder = PathBuilder.forProject('aindex')

      expect(builder.dist()).toContain('dist')
    })

    it('should build ref path', () => {
      const builder = PathBuilder.forProject('aindex')

      expect(builder.ref()).toContain('ref')
    })

    it('should build claude paths', () => {
      const builder = PathBuilder.forProject('aindex')
      const claude = builder.claude()

      expect(claude.root()).toContain('.claude')
      expect(claude.skills()).toContain('skills')
      expect(claude.commands()).toContain('commands')
      expect(claude.agents()).toContain('agents')
    })

    it('should build kiro paths', () => {
      const builder = PathBuilder.forProject('aindex')
      const kiro = builder.kiro()

      expect(kiro.root()).toContain('.kiro')
      expect(kiro.steering()).toContain('steering')
    })

    it('should build qoder paths', () => {
      const builder = PathBuilder.forProject('aindex')
      const qoder = builder.qoder()

      expect(qoder.root()).toContain('.qoder')
      expect(qoder.rules()).toContain('rules')
    })
  })

  describe('resolve', () => {
    it('should resolve arbitrary path segments', () => {
      const builder = PathBuilder.forProject('aindex')
      const resolved = builder.resolve('some', 'nested', 'path')

      expect(resolved).toContain('some')
      expect(resolved).toContain('nested')
      expect(resolved).toContain('path')
    })
  })
})

describe('getProjectExcludePatterns', () => {
  it('should return default exclude patterns for any project', () => {
    const patterns = getProjectExcludePatterns('aindex')

    expect(patterns).toContain('ref/*/dist')
  })

  it('should return same patterns for different projects', () => {
    const aindexPatterns = getProjectExcludePatterns('aindex')
    const otherPatterns = getProjectExcludePatterns('other-project')

    expect(aindexPatterns).toEqual(otherPatterns)
  })
})

describe('Constants', () => {
  it('should export USER_HOME', () => {
    expect(USER_HOME).toBeDefined()
    expect(typeof USER_HOME).toBe('string')
  })

  it('should export USER_PROJECTS_DIR', () => {
    expect(USER_PROJECTS_DIR).toBeDefined()
    expect(USER_PROJECTS_DIR).toContain('project')
  })
})
