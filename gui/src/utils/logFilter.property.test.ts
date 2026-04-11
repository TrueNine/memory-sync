/**
 * Property-Based Tests for logFilter utility
 *
 * Feature: tauri-ui-module, Property 6: 日志级别过滤
 * Validates: Requirements 10.2
 */
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import type { LogEntry, LogStream } from '@/utils/logFilter'
import { filterLogsByStream, isMatchingStream } from '@/utils/logFilter'

const LOG_STREAMS: readonly LogStream[] = ['stdout', 'stderr'] as const

/** Arbitrary for a valid LogStream */
const arbLogStream: fc.Arbitrary<LogStream> = fc.constantFrom(...LOG_STREAMS)

const arbLogEntry: fc.Arbitrary<LogEntry> = fc.record({
  stream: arbLogStream,
  source: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
  markdown: fc.string({ minLength: 0, maxLength: 200 }),
})

/** Arbitrary for a non-empty list of LogEntry */
const arbLogEntries: fc.Arbitrary<readonly LogEntry[]> = fc.array(arbLogEntry, { minLength: 0, maxLength: 50 })

describe('Property 6: 日志级别过滤', () => {
  /**
   * **Validates: Requirements 10.2**
   *
   * For any list of log entries and any filter level,
   * every entry in the filtered result has severity >= the filter level.
   */
  it('filtered result only contains entries from the selected stream', () => {
    fc.assert(
      fc.property(arbLogEntries, arbLogStream, (entries, stream) => {
        const filtered = filterLogsByStream(entries, stream)

        for (const entry of filtered) {
          expect(isMatchingStream(entry.stream, stream)).toBe(true)
        }
      }),
      { numRuns: 200 },
    )
  })

  /**
   * **Validates: Requirements 10.2**
   *
   * For any list of log entries and any filter level,
   * the relative order of entries in the filtered result is preserved
   * (i.e., filtered result is a subsequence of the original).
   */
  it('relative order of entries is preserved after filtering', () => {
    fc.assert(
      fc.property(arbLogEntries, arbLogStream, (entries, stream) => {
        const filtered = filterLogsByStream(entries, stream)

        // Verify filtered is a subsequence of entries
        let j = 0
        for (let i = 0; i < entries.length && j < filtered.length; i++) {
          if (entries[i] === filtered[j]) {
            j++
          }
        }
        expect(j).toBe(filtered.length)
      }),
      { numRuns: 200 },
    )
  })

  /**
   * **Validates: Requirements 10.2**
   *
   * For any list of log entries and any filter level,
   * no qualifying entry is dropped — every entry in the original list
   * that meets the threshold must appear in the filtered result.
   */
  it('no qualifying entries are dropped', () => {
    fc.assert(
      fc.property(arbLogEntries, arbLogStream, (entries, stream) => {
        const filtered = filterLogsByStream(entries, stream)
        const expectedCount = entries.filter((entry) => isMatchingStream(entry.stream, stream)).length
        expect(filtered.length).toBe(expectedCount)
      }),
      { numRuns: 200 },
    )
  })
})
