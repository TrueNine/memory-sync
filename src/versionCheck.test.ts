import {describe, expect, it, vi} from 'vitest'
import {compareVersions, parseVersion, shouldCheckVersion} from './versionCheck'

describe('versionCheck', () => {
  describe('parseVersion', () => {
    it('should parse valid semver versions', () => {
      expect(parseVersion('1.0.0')).toEqual([1, 0, 0])
      expect(parseVersion('1.2.3')).toEqual([1, 2, 3])
      expect(parseVersion('10.20.30')).toEqual([10, 20, 30])
    })

    it('should handle leading v prefix', () => {
      expect(parseVersion('v1.0.0')).toEqual([1, 0, 0])
      expect(parseVersion('v2.3.4')).toEqual([2, 3, 4])
    })

    it('should handle versions with prerelease suffix', () => {
      expect(parseVersion('1.0.0-beta')).toEqual([1, 0, 0])
      expect(parseVersion('2.0.0-rc.1')).toEqual([2, 0, 0])
    })

    it('should return null for invalid versions', () => {
      expect(parseVersion('invalid')).toBeNull()
      expect(parseVersion('1.0')).toBeNull()
      expect(parseVersion('dev')).toBeNull()
      expect(parseVersion('')).toBeNull()
    })
  })

  describe('compareVersions', () => {
    it('should return 0 for equal versions', () => {
      expect(compareVersions('1.0.0', '1.0.0')).toBe(0)
      expect(compareVersions('2.3.4', '2.3.4')).toBe(0)
    })

    it('should return -1 when first version is older', () => {
      expect(compareVersions('1.0.0', '2.0.0')).toBe(-1)
      expect(compareVersions('1.0.0', '1.1.0')).toBe(-1)
      expect(compareVersions('1.0.0', '1.0.1')).toBe(-1)
      expect(compareVersions('1.9.9', '2.0.0')).toBe(-1)
    })

    it('should return 1 when first version is newer', () => {
      expect(compareVersions('2.0.0', '1.0.0')).toBe(1)
      expect(compareVersions('1.1.0', '1.0.0')).toBe(1)
      expect(compareVersions('1.0.1', '1.0.0')).toBe(1)
      expect(compareVersions('2.0.0', '1.9.9')).toBe(1)
    })

    it('should return 0 for invalid versions', () => {
      expect(compareVersions('invalid', '1.0.0')).toBe(0)
      expect(compareVersions('1.0.0', 'invalid')).toBe(0)
      expect(compareVersions('dev', 'dev')).toBe(0)
    })
  })

  describe('shouldCheckVersion', () => {
    it('should return true for even minutes', () => {
      vi.useFakeTimers()

      vi.setSystemTime(new Date('2025-01-01T12:00:00'))
      expect(shouldCheckVersion()).toBe(true)

      vi.setSystemTime(new Date('2025-01-01T12:02:00'))
      expect(shouldCheckVersion()).toBe(true)

      vi.setSystemTime(new Date('2025-01-01T12:58:00'))
      expect(shouldCheckVersion()).toBe(true)

      vi.useRealTimers()
    })

    it('should return false for odd minutes', () => {
      vi.useFakeTimers()

      vi.setSystemTime(new Date('2025-01-01T12:01:00'))
      expect(shouldCheckVersion()).toBe(false)

      vi.setSystemTime(new Date('2025-01-01T12:03:00'))
      expect(shouldCheckVersion()).toBe(false)

      vi.setSystemTime(new Date('2025-01-01T12:59:00'))
      expect(shouldCheckVersion()).toBe(false)

      vi.useRealTimers()
    })
  })
})
