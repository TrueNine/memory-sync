/**
 * Property-based tests for bridge.ts TypeScript interface compatibility.
 *
 * Feature: gui-direct-cli-crate, Property 2: Tauri IPC contract compatibility
 *
 * Validates: Requirements 4.4
 */

import * as fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import type { LogEntry, PipelineResult, PluginExecutionResult } from '@/api/bridge'

// ── Arbitraries ──────────────────────────────────────────────────────────────

const arbPluginExecutionResult: fc.Arbitrary<PluginExecutionResult> = fc.record({
  plugin: fc.string({ minLength: 1, maxLength: 64 }),
  files: fc.nat(),
  dirs: fc.nat(),
  dryRun: fc.boolean(),
})

// Use integer ms in a safe range to avoid Invalid Date during shrinking
const MIN_TS = new Date('2000-01-01T00:00:00.000Z').getTime()
const MAX_TS = new Date('2099-12-31T23:59:59.999Z').getTime()

const arbLogEntry: fc.Arbitrary<LogEntry> = fc.record({
  timestamp: fc.integer({ min: MIN_TS, max: MAX_TS }).map((ms) => new Date(ms).toISOString()),
  level: fc.constantFrom('info', 'warn', 'error', 'debug', 'verbose'),
  logger: fc.string({ minLength: 1, maxLength: 64 }),
  payload: fc.oneof(fc.string(), fc.integer(), fc.boolean(), fc.constant(null)),
})

const arbPipelineResult: fc.Arbitrary<PipelineResult> = fc
  .record({
    success: fc.boolean(),
    totalFiles: fc.nat(),
    totalDirs: fc.nat(),
    dryRun: fc.boolean(),
    pluginResults: fc.array(arbPluginExecutionResult, { maxLength: 8 }),
    logs: fc.array(arbLogEntry, { maxLength: 8 }),
    errors: fc.array(fc.string(), { maxLength: 4 }),
  })

// ── Property tests ────────────────────────────────────────────────────────────

describe('PipelineResult interface field integrity', () => {
  /**
   * Validates: Requirements 4.4
   * For any valid PipelineResult, serialized JSON must contain all required
   * camelCase fields with correct types.
   */
  it('serialized JSON contains all required fields with correct types', () => {
    fc.assert(
      fc.property(arbPipelineResult, (result) => {
        const json = JSON.stringify(result)
        const parsed = JSON.parse(json) as Record<string, unknown>

        expect(typeof parsed['success']).toBe('boolean')
        expect(typeof parsed['totalFiles']).toBe('number')
        expect(typeof parsed['totalDirs']).toBe('number')
        expect(typeof parsed['dryRun']).toBe('boolean')
        expect(Array.isArray(parsed['pluginResults'])).toBe(true)
        expect(Array.isArray(parsed['logs'])).toBe(true)
        expect(Array.isArray(parsed['errors'])).toBe(true)
      }),
      { numRuns: 200 },
    )
  })

  it('round-trip serialization preserves all field values', () => {
    fc.assert(
      fc.property(arbPipelineResult, (result) => {
        const roundTripped = JSON.parse(JSON.stringify(result)) as PipelineResult

        expect(roundTripped.success).toBe(result.success)
        expect(roundTripped.totalFiles).toBe(result.totalFiles)
        expect(roundTripped.totalDirs).toBe(result.totalDirs)
        expect(roundTripped.dryRun).toBe(result.dryRun)
        expect(roundTripped.pluginResults).toHaveLength(result.pluginResults.length)
        expect(roundTripped.logs).toHaveLength(result.logs.length)
        expect(roundTripped.errors).toHaveLength(result.errors.length)
      }),
      { numRuns: 200 },
    )
  })
})

describe('PluginExecutionResult interface field integrity', () => {
  it('serialized JSON contains all required fields with correct types', () => {
    fc.assert(
      fc.property(arbPluginExecutionResult, (result) => {
        const parsed = JSON.parse(JSON.stringify(result)) as Record<string, unknown>

        expect(typeof parsed['plugin']).toBe('string')
        expect(typeof parsed['files']).toBe('number')
        expect(typeof parsed['dirs']).toBe('number')
        expect(typeof parsed['dryRun']).toBe('boolean')
      }),
      { numRuns: 200 },
    )
  })

  it('round-trip serialization preserves all field values', () => {
    fc.assert(
      fc.property(arbPluginExecutionResult, (result) => {
        const roundTripped = JSON.parse(JSON.stringify(result)) as PluginExecutionResult

        expect(roundTripped.plugin).toBe(result.plugin)
        expect(roundTripped.files).toBe(result.files)
        expect(roundTripped.dirs).toBe(result.dirs)
        expect(roundTripped.dryRun).toBe(result.dryRun)
      }),
      { numRuns: 200 },
    )
  })
})

describe('LogEntry interface field integrity', () => {
  it('serialized JSON contains all required fields with correct types', () => {
    fc.assert(
      fc.property(arbLogEntry, (entry) => {
        const parsed = JSON.parse(JSON.stringify(entry)) as Record<string, unknown>

        expect(typeof parsed['timestamp']).toBe('string')
        expect(typeof parsed['level']).toBe('string')
        expect(typeof parsed['logger']).toBe('string')
        expect('payload' in parsed).toBe(true)
      }),
      { numRuns: 200 },
    )
  })

  it('round-trip serialization preserves all field values', () => {
    fc.assert(
      fc.property(arbLogEntry, (entry) => {
        const roundTripped = JSON.parse(JSON.stringify(entry)) as LogEntry

        expect(roundTripped.timestamp).toBe(entry.timestamp)
        expect(roundTripped.level).toBe(entry.level)
        expect(roundTripped.logger).toBe(entry.logger)
        expect(roundTripped.payload).toStrictEqual(entry.payload)
      }),
      { numRuns: 200 },
    )
  })
})

describe('PipelineResult nested structure integrity', () => {
  it('pluginResults array elements have correct field types', () => {
    fc.assert(
      fc.property(arbPipelineResult, (result) => {
        const parsed = JSON.parse(JSON.stringify(result)) as PipelineResult

        for (const pr of parsed.pluginResults) {
          const p = pr as unknown as Record<string, unknown>
          expect(typeof p['plugin']).toBe('string')
          expect(typeof p['files']).toBe('number')
          expect(typeof p['dirs']).toBe('number')
          expect(typeof p['dryRun']).toBe('boolean')
        }
      }),
      { numRuns: 200 },
    )
  })

  it('logs array elements have correct field types', () => {
    fc.assert(
      fc.property(arbPipelineResult, (result) => {
        const parsed = JSON.parse(JSON.stringify(result)) as PipelineResult

        for (const log of parsed.logs) {
          const l = log as unknown as Record<string, unknown>
          expect(typeof l['timestamp']).toBe('string')
          expect(typeof l['level']).toBe('string')
          expect(typeof l['logger']).toBe('string')
          expect('payload' in l).toBe(true)
        }
      }),
      { numRuns: 200 },
    )
  })

  it('errors array contains only strings', () => {
    fc.assert(
      fc.property(arbPipelineResult, (result) => {
        const parsed = JSON.parse(JSON.stringify(result)) as PipelineResult

        for (const err of parsed.errors) {
          expect(typeof err).toBe('string')
        }
      }),
      { numRuns: 200 },
    )
  })
})
