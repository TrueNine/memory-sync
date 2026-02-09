/**
 * Property-Based Tests for logFilter utility
 *
 * Feature: tauri-ui-module, Property 6: 日志级别过滤
 * Validates: Requirements 10.2
 */
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import type { LogEntry, LogLevel } from '@/utils/logFilter'
import { filterLogsByLevel, isLevelAtLeast } from '@/utils/logFilter'

const LOG_LEVELS: readonly LogLevel[] = ['error', 'warn', 'info', 'debug'] as const

const LOG_LEVEL_SEVERITY: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
}

/** Arbitrary for a valid LogLevel */
const arbLogLevel: fc.Arbitrary<LogLevel> = fc.constantFrom(...LOG_LEVELS)

/** Arbitrary for a LogEntry with a random level. Use integer timestamps to avoid Invalid Date issues. */
const arbTimestamp: fc.Arbitrary<string> = fc
  .integer({ min: 946684800000, max: 4102444799000 }) // 2000-01-01 to 2099-12-31
  .map((ms) => new Date(ms).toISOString())

const arbLogEntry: fc.Arbitrary<LogEntry> = fc.record({
  timestamp: arbTimestamp,
  level: arbLogLevel,
  namespace: fc.string({ minLength: 1, maxLength: 20 }),
  message: fc.string({ minLength: 0, maxLength: 100 }),
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
  it('filtered result only contains entries with severity >= filter level', () => {
    fc.assert(
      fc.property(arbLogEntries, arbLogLevel, (entries, minLevel) => {
        const filtered = filterLogsByLevel(entries, minLevel)

        for (const entry of filtered) {
          expect(isLevelAtLeast(entry.level, minLevel)).toBe(true)
          expect(LOG_LEVEL_SEVERITY[entry.level]).toBeLessThanOrEqual(LOG_LEVEL_SEVERITY[minLevel])
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
      fc.property(arbLogEntries, arbLogLevel, (entries, minLevel) => {
        const filtered = filterLogsByLevel(entries, minLevel)

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
      fc.property(arbLogEntries, arbLogLevel, (entries, minLevel) => {
        const filtered = filterLogsByLevel(entries, minLevel)
        const expectedCount = entries.filter((e) => isLevelAtLeast(e.level, minLevel)).length
        expect(filtered.length).toBe(expectedCount)
      }),
      { numRuns: 200 },
    )
  })
})
