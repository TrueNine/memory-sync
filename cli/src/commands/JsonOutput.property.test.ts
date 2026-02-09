/**
 * Property-based tests for CLI JSON serialization/deserialization round-trip.
 *
 * Feature: tauri-ui-module, Property 1: CLI JSON 输出序列化/反序列化 round-trip
 *
 * **Validates: Requirements 2.3, 2.4, 2.5, 7.3, 7.4**
 *
 * For any valid CommandResult / JsonCommandResult / PluginExecutionResult /
 * JsonConfigInfo / JsonPluginInfo, serializing to JSON and deserializing
 * should produce an equivalent data structure with all fields preserved.
 */
import * as fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import type {
    CommandResult,
    ConfigSource,
    JsonCommandResult,
    JsonConfigInfo,
    JsonPluginInfo,
    PluginExecutionResult
} from './Command'
import { toJsonCommandResult } from './JsonOutputCommand'

// ---------------------------------------------------------------------------
// Arbitraries — smart generators constrained to the valid input space
// ---------------------------------------------------------------------------

/** Generate a valid PluginExecutionResult */
const arbPluginExecutionResult: fc.Arbitrary<PluginExecutionResult> = fc.record({
  pluginName: fc.string({minLength: 1, maxLength: 50}),
  kind: fc.constantFrom('Input' as const, 'Output' as const),
  status: fc.constantFrom('success' as const, 'failed' as const, 'skipped' as const),
  filesWritten: fc.option(fc.nat({max: 10000}), {nil: undefined}),
  error: fc.option(fc.string({minLength: 0, maxLength: 200}), {nil: undefined}),
  duration: fc.option(fc.double({min: 0, max: 1e6, noNaN: true, noDefaultInfinity: true}), {nil: undefined})
})

/** Generate a valid JsonCommandResult */
const arbJsonCommandResult: fc.Arbitrary<JsonCommandResult> = fc.record({
  success: fc.boolean(),
  filesAffected: fc.nat({max: 100000}),
  dirsAffected: fc.nat({max: 10000}),
  message: fc.option(fc.string({minLength: 0, maxLength: 200}), {nil: undefined}),
  pluginResults: fc.option(
    fc.array(arbPluginExecutionResult, {minLength: 0, maxLength: 10}),
    {nil: undefined}
  ),
  errors: fc.option(
    fc.array(fc.string({minLength: 0, maxLength: 200}), {minLength: 0, maxLength: 10}),
    {nil: undefined}
  )
})

/** Generate a valid ConfigSource */
const arbConfigSource: fc.Arbitrary<ConfigSource> = fc.record({
  path: fc.string({minLength: 1, maxLength: 100}),
  layer: fc.constantFrom('programmatic' as const, 'cwd' as const, 'global' as const, 'default' as const),
  config: fc.record({
    workspaceDir: fc.option(fc.string({minLength: 1, maxLength: 80}), {nil: undefined}),
    shadowSourceProjectDir: fc.option(fc.string({minLength: 1, maxLength: 80}), {nil: undefined}),
    logLevel: fc.option(
      fc.constantFrom('trace' as const, 'debug' as const, 'info' as const, 'warn' as const, 'error' as const),
      {nil: undefined}
    ),
    externalProjects: fc.option(
      fc.array(fc.string({minLength: 1, maxLength: 50}), {minLength: 0, maxLength: 5}),
      {nil: undefined}
    )
  })
})

/** Generate a valid JsonConfigInfo */
const arbJsonConfigInfo: fc.Arbitrary<JsonConfigInfo> = fc.record({
  merged: fc.record({
    workspaceDir: fc.option(fc.string({minLength: 1, maxLength: 80}), {nil: undefined}),
    shadowSourceProjectDir: fc.option(fc.string({minLength: 1, maxLength: 80}), {nil: undefined}),
    shadowSkillSourceDir: fc.option(fc.string({minLength: 1, maxLength: 80}), {nil: undefined}),
    shadowFastCommandDir: fc.option(fc.string({minLength: 1, maxLength: 80}), {nil: undefined}),
    shadowSubAgentDir: fc.option(fc.string({minLength: 1, maxLength: 80}), {nil: undefined}),
    globalMemoryFile: fc.option(fc.string({minLength: 1, maxLength: 80}), {nil: undefined}),
    shadowProjectsDir: fc.option(fc.string({minLength: 1, maxLength: 80}), {nil: undefined}),
    logLevel: fc.option(
      fc.constantFrom('trace' as const, 'debug' as const, 'info' as const, 'warn' as const, 'error' as const),
      {nil: undefined}
    ),
    externalProjects: fc.option(
      fc.array(fc.string({minLength: 1, maxLength: 50}), {minLength: 0, maxLength: 5}),
      {nil: undefined}
    )
  }),
  sources: fc.array(arbConfigSource, {minLength: 0, maxLength: 5})
})

/** Generate a valid JsonPluginInfo */
const arbJsonPluginInfo: fc.Arbitrary<JsonPluginInfo> = fc.record({
  name: fc.string({minLength: 1, maxLength: 80}),
  kind: fc.constantFrom('Input' as const, 'Output' as const),
  description: fc.string({minLength: 0, maxLength: 200}),
  dependencies: fc.array(fc.string({minLength: 1, maxLength: 80}), {minLength: 0, maxLength: 10})
})

/** Generate a valid CommandResult (base type used by toJsonCommandResult) */
const arbCommandResult: fc.Arbitrary<CommandResult> = fc.record({
  success: fc.boolean(),
  filesAffected: fc.nat({max: 100000}),
  dirsAffected: fc.nat({max: 10000}),
  message: fc.option(fc.string({minLength: 0, maxLength: 200}), {nil: undefined})
})

// ---------------------------------------------------------------------------
// Property tests
// ---------------------------------------------------------------------------

const NUM_RUNS = 100

describe('Property 1: CLI JSON 输出序列化/反序列化 round-trip', () => {
  /**
   * **Validates: Requirements 2.3, 2.4, 2.5, 7.3, 7.4**
   *
   * For any valid JsonCommandResult, JSON.stringify then JSON.parse
   * produces a deeply equal object.
   */
  it('JsonCommandResult round-trip: JSON.stringify → JSON.parse preserves all fields', () => {
    fc.assert(
      fc.property(arbJsonCommandResult, (original) => {
        const serialized = JSON.stringify(original)
        const deserialized = JSON.parse(serialized) as JsonCommandResult
        expect(deserialized).toEqual(original)
      }),
      {numRuns: NUM_RUNS}
    )
  })

  /**
   * **Validates: Requirements 2.3, 2.4, 2.5, 7.3, 7.4**
   *
   * For any valid PluginExecutionResult, JSON.stringify then JSON.parse
   * produces a deeply equal object.
   */
  it('PluginExecutionResult round-trip: JSON.stringify → JSON.parse preserves all fields', () => {
    fc.assert(
      fc.property(arbPluginExecutionResult, (original) => {
        const serialized = JSON.stringify(original)
        const deserialized = JSON.parse(serialized) as PluginExecutionResult
        expect(deserialized).toEqual(original)
      }),
      {numRuns: NUM_RUNS}
    )
  })

  /**
   * **Validates: Requirements 2.3, 2.4, 2.5, 7.3, 7.4**
   *
   * For any valid JsonConfigInfo, JSON.stringify then JSON.parse
   * produces a deeply equal object.
   */
  it('JsonConfigInfo round-trip: JSON.stringify → JSON.parse preserves all fields', () => {
    fc.assert(
      fc.property(arbJsonConfigInfo, (original) => {
        const serialized = JSON.stringify(original)
        const deserialized = JSON.parse(serialized) as JsonConfigInfo
        expect(deserialized).toEqual(original)
      }),
      {numRuns: NUM_RUNS}
    )
  })

  /**
   * **Validates: Requirements 2.3, 2.4, 2.5, 7.3, 7.4**
   *
   * For any valid JsonPluginInfo, JSON.stringify then JSON.parse
   * produces a deeply equal object.
   */
  it('JsonPluginInfo round-trip: JSON.stringify → JSON.parse preserves all fields', () => {
    fc.assert(
      fc.property(arbJsonPluginInfo, (original) => {
        const serialized = JSON.stringify(original)
        const deserialized = JSON.parse(serialized) as JsonPluginInfo
        expect(deserialized).toEqual(original)
      }),
      {numRuns: NUM_RUNS}
    )
  })

  /**
   * **Validates: Requirements 2.3, 2.4, 2.5, 7.3, 7.4**
   *
   * For any valid CommandResult, toJsonCommandResult preserves all base
   * fields (success, filesAffected, dirsAffected, message) and initialises
   * pluginResults and errors as empty arrays.
   */
  it('toJsonCommandResult preserves all base fields from CommandResult', () => {
    fc.assert(
      fc.property(arbCommandResult, (commandResult) => {
        const jsonResult = toJsonCommandResult(commandResult)

        // Base fields must be preserved
        expect(jsonResult.success).toBe(commandResult.success)
        expect(jsonResult.filesAffected).toBe(commandResult.filesAffected)
        expect(jsonResult.dirsAffected).toBe(commandResult.dirsAffected)

        // message: preserved when present, absent when undefined
        if (commandResult.message != null) {
          expect(jsonResult.message).toBe(commandResult.message)
        } else {
          expect(jsonResult.message).toBeUndefined()
        }

        // pluginResults and errors initialised as empty arrays
        expect(jsonResult.pluginResults).toEqual([])
        expect(jsonResult.errors).toEqual([])
      }),
      {numRuns: NUM_RUNS}
    )
  })

  /**
   * **Validates: Requirements 2.3, 2.4, 2.5, 7.3, 7.4**
   *
   * The output of toJsonCommandResult itself survives a JSON round-trip,
   * ensuring the converted result is fully JSON-safe.
   */
  it('toJsonCommandResult output survives JSON round-trip', () => {
    fc.assert(
      fc.property(arbCommandResult, (commandResult) => {
        const jsonResult = toJsonCommandResult(commandResult)
        const serialized = JSON.stringify(jsonResult)
        const deserialized = JSON.parse(serialized) as JsonCommandResult
        expect(deserialized).toEqual(jsonResult)
      }),
      {numRuns: NUM_RUNS}
    )
  })
})
