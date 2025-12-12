import { describe, expect, it } from 'vitest'
import { resolvePathVariables, hasUnresolvedVariables, getAvailableVariables } from './PathResolver'

describe('PathResolver', () => {
  describe('resolvePathVariables', () => {
    it('should resolve $USER_HOME variable', () => {
      const result = resolvePathVariables('$USER_HOME/.codex')
      expect(result).toContain('.codex')
      expect(hasUnresolvedVariables(result)).toBe(false)
    })

    it('should resolve ${USER_HOME} variable', () => {
      const result = resolvePathVariables('${USER_HOME}/.codex')
      expect(result).toContain('.codex')
      expect(hasUnresolvedVariables(result)).toBe(false)
    })

    it('should resolve $HOME variable', () => {
      const result = resolvePathVariables('$HOME/.codex')
      expect(result).toContain('.codex')
      expect(hasUnresolvedVariables(result)).toBe(false)
    })

    it('should handle paths without variables', () => {
      const result = resolvePathVariables('/absolute/path/.codex')
      expect(result).toBe('/absolute/path/.codex')
    })

    it('should handle mixed variables and regular paths', () => {
      const result = resolvePathVariables('$USER_HOME/projects/$HOME/config')
      expect(result).toContain('projects')
      expect(result).toContain('config')
      expect(hasUnresolvedVariables(result)).toBe(false)
    })

    it('should preserve path separators as forward slashes', () => {
      const result = resolvePathVariables('$USER_HOME\\.codex')
      expect(result).toBe(resolvePathVariables('$USER_HOME/.codex'))
    })
  })

  describe('hasUnresolvedVariables', () => {
    it('should detect unresolved variables', () => {
      expect(hasUnresolvedVariables('$UNKNOWN_VAR/.codex')).toBe(true)
      expect(hasUnresolvedVariables('${UNKNOWN_VAR}/.codex')).toBe(true)
    })

    it('should not detect resolved variables', () => {
      expect(hasUnresolvedVariables('$USER_HOME/.codex')).toBe(false)
      expect(hasUnresolvedVariables('${HOME}/.codex')).toBe(false)
    })

    it('should not detect non-variable strings', () => {
      expect(hasUnresolvedVariables('regular/path/.codex')).toBe(false)
      expect(hasUnresolvedVariables('dollar$sign/path')).toBe(false)
    })
  })

  describe('getAvailableVariables', () => {
    it('should return available variables', () => {
      const vars = getAvailableVariables()
      expect(vars).toContain('USER_HOME')
      expect(vars).toContain('HOME')
    })
  })
})