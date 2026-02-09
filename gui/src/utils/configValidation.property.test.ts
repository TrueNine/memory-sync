/**
 * Property-Based Tests for configValidation utility
 *
 * Feature: tauri-ui-module, Property 3: 无效配置产生错误
 * Validates: Requirements 3.4
 */
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import { validateConfig } from '@/utils/configValidation'

/**
 * Valid log levels recognised by the config schema.
 * Any string NOT in this set is invalid for the `logLevel` field.
 */
const VALID_LOG_LEVELS = ['trace', 'debug', 'info', 'warn', 'error'] as const

/**
 * Known config fields — used to generate objects with wrong-typed values
 * for fields the validator actually checks.
 */
const STRING_FIELDS = [
  'workspaceDir',
  'shadowSourceProjectDir',
  'shadowSkillSourceDir',
  'shadowFastCommandDir',
  'shadowSubAgentDir',
  'globalMemoryFile',
  'shadowProjectsDir',
] as const

const OBJECT_FIELDS = ['profile', 'tool', 'fastCommandSeriesOptions'] as const

// ── Arbitraries ────────────────────────────────────────────────────────

/** Arbitrary for non-object primitives (null, undefined, number, string, boolean) */
const arbNonObjectPrimitive: fc.Arbitrary<unknown> = fc.oneof(
  fc.constant(null),
  fc.constant(undefined),
  fc.integer(),
  fc.double(),
  fc.string(),
  fc.boolean(),
)

/** Arbitrary for arrays of any shape */
const arbArray: fc.Arbitrary<unknown> = fc.oneof(
  fc.constant([]),
  fc.array(fc.integer()),
  fc.array(fc.string()),
  fc.array(fc.anything()),
)

/** Non-string arbitrary values (for fields that must be strings) */
const arbNonString: fc.Arbitrary<unknown> = fc.oneof(
  fc.integer(),
  fc.double(),
  fc.boolean(),
  fc.constant(null),
  fc.array(fc.anything()),
  fc.dictionary(fc.string(), fc.anything()),
)

/** Non-object arbitrary values (for fields that must be objects) */
const arbNonObject: fc.Arbitrary<unknown> = fc.oneof(
  fc.integer(),
  fc.double(),
  fc.string(),
  fc.boolean(),
  fc.constant(null),
  fc.array(fc.anything()),
)

/**
 * Arbitrary for an invalid logLevel value — any string that is NOT
 * one of the valid log levels, or a non-string value.
 */
const arbInvalidLogLevel: fc.Arbitrary<unknown> = fc.oneof(
  fc.string().filter((s) => !(VALID_LOG_LEVELS as readonly string[]).includes(s)),
  fc.integer(),
  fc.boolean(),
  fc.constant(null),
  fc.array(fc.anything()),
)

/**
 * Arbitrary for an invalid externalProjects value — anything that is
 * not an array of strings.
 */
const arbInvalidExternalProjects: fc.Arbitrary<unknown> = fc.oneof(
  // Not an array at all
  fc.string(),
  fc.integer(),
  fc.boolean(),
  fc.constant(null),
  fc.dictionary(fc.string(), fc.anything()),
  // Array containing non-strings (at least one non-string element)
  fc.tuple(fc.array(fc.string()), arbNonString).map(([arr, nonStr]) => [...arr, nonStr]),
)

/**
 * Arbitrary for an invalid excludePatterns value — anything that is
 * not an object with string-array values.
 */
const arbInvalidExcludePatterns: fc.Arbitrary<unknown> = fc.oneof(
  // Not an object at all
  fc.string(),
  fc.integer(),
  fc.boolean(),
  fc.constant(null),
  fc.array(fc.anything()),
  // Object with at least one non-string-array value
  fc.dictionary(
    fc.string({ minLength: 1, maxLength: 10 }),
    fc.oneof(fc.integer(), fc.string(), fc.boolean(), fc.constant(null)),
    { minKeys: 1, maxKeys: 3 },
  ),
)

// ── Tests ──────────────────────────────────────────────────────────────

describe('Property 3: 无效配置产生错误', () => {
  /**
   * **Validates: Requirements 3.4**
   *
   * For any non-object input (null, undefined, primitives, arrays),
   * validateConfig should return a non-empty error list.
   */
  it('non-object inputs produce errors', () => {
    fc.assert(
      fc.property(
        fc.oneof(arbNonObjectPrimitive, arbArray),
        (input) => {
          const errors = validateConfig(input)
          expect(errors.length).toBeGreaterThan(0)
          expect(errors.some((e) => e.severity === 'error')).toBe(true)
        },
      ),
      { numRuns: 200 },
    )
  })

  /**
   * **Validates: Requirements 3.4**
   *
   * For any object with a string field set to a non-string value,
   * validateConfig should return at least one error for that field.
   */
  it('wrong-typed string fields produce errors', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...STRING_FIELDS),
        arbNonString,
        (field, badValue) => {
          const config = { [field]: badValue }
          const errors = validateConfig(config)
          const fieldErrors = errors.filter((e) => e.field === field && e.severity === 'error')
          expect(fieldErrors.length).toBeGreaterThan(0)
        },
      ),
      { numRuns: 200 },
    )
  })

  /**
   * **Validates: Requirements 3.4**
   *
   * For any invalid logLevel value, validateConfig should return
   * at least one error for the logLevel field.
   */
  it('invalid logLevel values produce errors', () => {
    fc.assert(
      fc.property(arbInvalidLogLevel, (badLogLevel) => {
        const config = { logLevel: badLogLevel }
        const errors = validateConfig(config)
        const logLevelErrors = errors.filter((e) => e.field === 'logLevel' && e.severity === 'error')
        expect(logLevelErrors.length).toBeGreaterThan(0)
      }),
      { numRuns: 200 },
    )
  })

  /**
   * **Validates: Requirements 3.4**
   *
   * For any invalid externalProjects value, validateConfig should
   * return at least one error for the externalProjects field.
   */
  it('invalid externalProjects values produce errors', () => {
    fc.assert(
      fc.property(arbInvalidExternalProjects, (badValue) => {
        const config = { externalProjects: badValue }
        const errors = validateConfig(config)
        const epErrors = errors.filter((e) => e.field === 'externalProjects' && e.severity === 'error')
        expect(epErrors.length).toBeGreaterThan(0)
      }),
      { numRuns: 200 },
    )
  })

  /**
   * **Validates: Requirements 3.4**
   *
   * For any invalid excludePatterns value, validateConfig should
   * return at least one error mentioning excludePatterns.
   */
  it('invalid excludePatterns values produce errors', () => {
    fc.assert(
      fc.property(arbInvalidExcludePatterns, (badValue) => {
        const config = { excludePatterns: badValue }
        const errors = validateConfig(config)
        const epErrors = errors.filter((e) => e.field.startsWith('excludePatterns') && e.severity === 'error')
        expect(epErrors.length).toBeGreaterThan(0)
      }),
      { numRuns: 200 },
    )
  })

  /**
   * **Validates: Requirements 3.4**
   *
   * For any object field (profile, tool, fastCommandSeriesOptions)
   * set to a non-object value, validateConfig should return at least
   * one error for that field.
   */
  it('non-object values for object fields produce errors', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...OBJECT_FIELDS),
        arbNonObject,
        (field, badValue) => {
          const config = { [field]: badValue }
          const errors = validateConfig(config)
          const fieldErrors = errors.filter((e) => e.field.startsWith(field) && e.severity === 'error')
          expect(fieldErrors.length).toBeGreaterThan(0)
        },
      ),
      { numRuns: 200 },
    )
  })
})
