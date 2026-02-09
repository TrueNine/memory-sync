import { describe, expect, it } from 'vitest'

import type { LogEntry } from '@/utils/logFilter'
import { filterLogsByLevel, isLevelAtLeast } from '@/utils/logFilter'

const makeEntry = (level: LogEntry['level'], message: string): LogEntry => ({
  timestamp: '2025-01-01T00:00:00Z',
  level,
  namespace: 'test',
  message,
})

describe('isLevelAtLeast', () => {
  it('error meets all thresholds', () => {
    expect(isLevelAtLeast('error', 'error')).toBe(true)
    expect(isLevelAtLeast('error', 'warn')).toBe(true)
    expect(isLevelAtLeast('error', 'info')).toBe(true)
    expect(isLevelAtLeast('error', 'debug')).toBe(true)
  })

  it('debug only meets debug threshold', () => {
    expect(isLevelAtLeast('debug', 'debug')).toBe(true)
    expect(isLevelAtLeast('debug', 'info')).toBe(false)
    expect(isLevelAtLeast('debug', 'warn')).toBe(false)
    expect(isLevelAtLeast('debug', 'error')).toBe(false)
  })

  it('warn meets warn and below', () => {
    expect(isLevelAtLeast('warn', 'error')).toBe(false)
    expect(isLevelAtLeast('warn', 'warn')).toBe(true)
    expect(isLevelAtLeast('warn', 'info')).toBe(true)
    expect(isLevelAtLeast('warn', 'debug')).toBe(true)
  })
})

describe('filterLogsByLevel', () => {
  const entries: readonly LogEntry[] = [
    makeEntry('debug', 'debug msg'),
    makeEntry('info', 'info msg'),
    makeEntry('warn', 'warn msg'),
    makeEntry('error', 'error msg'),
  ]

  it('filters to error only', () => {
    const result = filterLogsByLevel(entries, 'error')
    expect(result).toHaveLength(1)
    expect(result[0].level).toBe('error')
  })

  it('filters to warn and above', () => {
    const result = filterLogsByLevel(entries, 'warn')
    expect(result).toHaveLength(2)
    expect(result.map((e) => e.level)).toEqual(['warn', 'error'])
  })

  it('filters to info and above', () => {
    const result = filterLogsByLevel(entries, 'info')
    expect(result).toHaveLength(3)
    expect(result.map((e) => e.level)).toEqual(['info', 'warn', 'error'])
  })

  it('debug shows all entries', () => {
    const result = filterLogsByLevel(entries, 'debug')
    expect(result).toHaveLength(4)
  })

  it('preserves original order', () => {
    const mixed: readonly LogEntry[] = [
      makeEntry('error', 'e1'),
      makeEntry('debug', 'd1'),
      makeEntry('error', 'e2'),
      makeEntry('info', 'i1'),
    ]
    const result = filterLogsByLevel(mixed, 'error')
    expect(result.map((e) => e.message)).toEqual(['e1', 'e2'])
  })

  it('returns empty array for empty input', () => {
    expect(filterLogsByLevel([], 'debug')).toEqual([])
  })

  it('does not mutate the original array', () => {
    const original: LogEntry[] = [makeEntry('debug', 'a'), makeEntry('error', 'b')]
    const copy = [...original]
    filterLogsByLevel(original, 'error')
    expect(original).toEqual(copy)
  })
})
