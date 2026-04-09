import { describe, expect, it } from 'vitest'

import type { LogEntry } from '@/utils/logFilter'
import { filterLogsByStream, isMatchingStream } from '@/utils/logFilter'

const makeEntry = (stream: LogEntry['stream'], markdown: string): LogEntry => ({
  stream,
  source: 'test',
  markdown,
})

describe('isMatchingStream', () => {
  it('matches stdout to stdout', () => {
    expect(isMatchingStream('stdout', 'stdout')).toBe(true)
  })

  it('does not match stdout to stderr', () => {
    expect(isMatchingStream('stdout', 'stderr')).toBe(false)
  })
})

describe('filterLogsByStream', () => {
  const entries: readonly LogEntry[] = [
    makeEntry('stdout', 'sync complete'),
    makeEntry('stderr', 'warning'),
    makeEntry('stdout', 'cleanup complete'),
    makeEntry('stderr', 'error'),
  ]

  it('filters stdout entries', () => {
    const result = filterLogsByStream(entries, 'stdout')
    expect(result).toHaveLength(2)
    expect(result.every((entry) => entry.stream === 'stdout')).toBe(true)
  })

  it('filters stderr entries', () => {
    const result = filterLogsByStream(entries, 'stderr')
    expect(result).toHaveLength(2)
    expect(result.every((entry) => entry.stream === 'stderr')).toBe(true)
  })

  it('preserves original order', () => {
    const mixed: readonly LogEntry[] = [
      makeEntry('stderr', 'e1'),
      makeEntry('stdout', 'o1'),
      makeEntry('stderr', 'e2'),
      makeEntry('stdout', 'o2'),
    ]
    const result = filterLogsByStream(mixed, 'stderr')
    expect(result.map((e) => e.markdown)).toEqual(['e1', 'e2'])
  })

  it('returns empty array for empty input', () => {
    expect(filterLogsByStream([], 'stdout')).toEqual([])
  })

  it('does not mutate the original array', () => {
    const original: LogEntry[] = [makeEntry('stdout', 'a'), makeEntry('stderr', 'b')]
    const copy = [...original]
    filterLogsByStream(original, 'stderr')
    expect(original).toEqual(copy)
  })
})
