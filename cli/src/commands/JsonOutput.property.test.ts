import type {
  CommandResult,
  ConfigSource,
  JsonCommandResult,
  JsonConfigInfo,
  JsonPluginInfo,
  PluginExecutionResult
} from './Command'
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

import {describe, expect, it} from 'vitest'
import {toJsonCommandResult} from './JsonOutputCommand' // Arbitraries — smart generators constrained to the valid input space

/** Generate a valid PluginExecutionResult */
const arbPluginExecutionResult: fc.Arbitrary<PluginExecutionResult> = fc.record({
  pluginName: fc.string({minLength: 1, maxLength: 50}),
  kind: fc.constantFrom('Input' as const, 'Output' as const),
  status: fc.constantFrom('success' as const, 'failed' as const, 'skipped' as const),
  filesWritten: fc.option(fc.nat({max: 10000}), {nil: void 0}),
  error: fc.option(fc.string({minLength: 0, maxLength: 200}), {nil: void 0}),
  duration: fc.option(fc.double({min: 0, max: 1e6, noNaN: true, noDefaultInfinity: true}), {nil: void 0})
})

/** Generate a valid JsonCommandResult */
const arbJsonCommandResult: fc.Arbitrary<JsonCommandResult> = fc.record({
  success: fc.boolean(),
  filesAffected: fc.nat({max: 100000}),
  dirsAffected: fc.nat({max: 10000}),
  message: fc.option(fc.string({minLength: 0, maxLength: 200}), {nil: void 0}),
  pluginResults: fc.option(
    fc.array(arbPluginExecutionResult, {minLength: 0, maxLength: 10}),
    {nil: void 0}
  ),
  errors: fc.option(
    fc.array(fc.string({minLength: 0, maxLength: 200}), {minLength: 0, maxLength: 10}),
    {nil: void 0}
  )
})

/** Generate a valid ConfigSource */
const arbConfigSource: fc.Arbitrary<ConfigSource> = fc.record({
  path: fc.string({minLength: 1, maxLength: 100}),
  layer: fc.constantFrom('programmatic' as const, 'cwd' as const, 'global' as const, 'default' as const),
  config: fc.record({
    workspaceDir: fc.option(fc.string({minLength: 1, maxLength: 80}), {nil: void 0}),
    logLevel: fc.option(
      fc.constantFrom('trace' as const, 'debug' as const, 'info' as const, 'warn' as const, 'error' as const),
      {nil: void 0}
    )
  })
})

/** Generate a valid JsonConfigInfo */
const arbJsonConfigInfo: fc.Arbitrary<JsonConfigInfo> = fc.record({
  merged: fc.record({
    workspaceDir: fc.option(fc.string({minLength: 1, maxLength: 80}), {nil: void 0}),
    logLevel: fc.option(
      fc.constantFrom('trace' as const, 'debug' as const, 'info' as const, 'warn' as const, 'error' as const),
      {nil: void 0}
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
  message: fc.option(fc.string({minLength: 0, maxLength: 200}), {nil: void 0})
}) // Property tests

const NUM_RUNS = 100

describe('property 1: CLI JSON 输出序列化/反序列化 round-trip', () => {
  it('jsonCommandResult round-trip: JSON.stringify → JSON.parse preserves all fields', () => {
    fc.assert(
      fc.property(arbJsonCommandResult, original => {
        const serialized = JSON.stringify(original)
        const deserialized = JSON.parse(serialized) as JsonCommandResult
        expect(deserialized).toEqual(original)
      }),
      {numRuns: NUM_RUNS}
    )
  })

  it('pluginExecutionResult round-trip: JSON.stringify → JSON.parse preserves all fields', () => {
    fc.assert(
      fc.property(arbPluginExecutionResult, original => {
        const serialized = JSON.stringify(original)
        const deserialized = JSON.parse(serialized) as PluginExecutionResult
        expect(deserialized).toEqual(original)
      }),
      {numRuns: NUM_RUNS}
    )
  })

  it('jsonConfigInfo round-trip: JSON.stringify → JSON.parse preserves all fields', () => {
    fc.assert(
      fc.property(arbJsonConfigInfo, original => {
        const serialized = JSON.stringify(original)
        const deserialized = JSON.parse(serialized) as JsonConfigInfo
        expect(deserialized).toEqual(original)
      }),
      {numRuns: NUM_RUNS}
    )
  })

  it('jsonPluginInfo round-trip: JSON.stringify → JSON.parse preserves all fields', () => {
    fc.assert(
      fc.property(arbJsonPluginInfo, original => {
        const serialized = JSON.stringify(original)
        const deserialized = JSON.parse(serialized) as JsonPluginInfo
        expect(deserialized).toEqual(original)
      }),
      {numRuns: NUM_RUNS}
    )
  })

  it('toJsonCommandResult preserves all base fields from CommandResult', () => {
    fc.assert(
      fc.property(arbCommandResult, commandResult => {
        const jsonResult = toJsonCommandResult(commandResult)

        expect(jsonResult.success).toBe(commandResult.success) // Base fields must be preserved
        expect(jsonResult.filesAffected).toBe(commandResult.filesAffected)
        expect(jsonResult.dirsAffected).toBe(commandResult.dirsAffected)

        if (commandResult.message != null) { // message: preserved when present, absent when undefined
          expect(jsonResult.message).toBe(commandResult.message)
        } else expect(jsonResult.message).toBeUndefined()

        expect(jsonResult.pluginResults).toEqual([]) // pluginResults and errors initialised as empty arrays
        expect(jsonResult.errors).toEqual([])
      }),
      {numRuns: NUM_RUNS}
    )
  })

  it('toJsonCommandResult output survives JSON round-trip', () => {
    fc.assert(
      fc.property(arbCommandResult, commandResult => {
        const jsonResult = toJsonCommandResult(commandResult)
        const serialized = JSON.stringify(jsonResult)
        const deserialized = JSON.parse(serialized) as JsonCommandResult
        expect(deserialized).toEqual(jsonResult)
      }),
      {numRuns: NUM_RUNS}
    )
  })
})
