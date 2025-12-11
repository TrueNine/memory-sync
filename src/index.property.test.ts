/**
 * Property-based tests for CLI argument parsing
 * Tests that CLI argument parsing produces valid configuration
 *
 * @see Requirements 1.1, 2.1, 2.3
 */

import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { parseArgs } from './index'

/**
 * Generate valid CLI flag combinations
 */
const validFlagArb = fc.constantFrom(
  '--dry-run',
  '-d',
  '--clean',
  '-c',
  '--help',
  '-h',
  '--version',
  '-v',
)

/**
 * Generate invalid CLI flags (flags that start with - but are not recognized)
 */
const invalidFlagArb = fc.string({ minLength: 2, maxLength: 20 })
  .filter((s) => s.startsWith('-') && !['--dry-run', '-d', '--clean', '-c', '--help', '-h', '--version', '-v'].includes(s))
  .map((s) => s.startsWith('-') ? s : `-${s}`)

/**
 * Generate non-flag arguments (don't start with -)
 */
const nonFlagArgArb = fc.string({ minLength: 1, maxLength: 20 })
  .filter((s) => !s.startsWith('-'))

describe('CLI argument parsing properties', () => {
  describe('Property 1: CLI argument parsing produces valid configuration', () => {
    it('should produce valid CLIFlags for any valid combination of CLI arguments', () => {
      /**
       * **Feature: plugin-bootstrap-refactor, Property 1: CLI argument parsing produces valid configuration**
       * **Validates: Requirements 1.1**
       *
       * For any valid combination of CLI arguments (--dry-run, --clean, --help, --version),
       * parsing SHALL produce a PluginGlobalOptions object with corresponding boolean flags set correctly.
       */
      fc.assert(
        fc.property(
          fc.array(validFlagArb, { minLength: 0, maxLength: 4 }),
          (args) => {
            const { flags, invalidFlags } = parseArgs(args)

            // All flags should be boolean
            expect(typeof flags.dryRun).toBe('boolean')
            expect(typeof flags.clean).toBe('boolean')
            expect(typeof flags.help).toBe('boolean')
            expect(typeof flags.version).toBe('boolean')

            // No invalid flags should be detected for valid input
            expect(invalidFlags).toEqual([])

            // Verify flag values match input
            const hasDryRun = args.includes('--dry-run') || args.includes('-d')
            const hasClean = args.includes('--clean') || args.includes('-c')
            const hasHelp = args.includes('--help') || args.includes('-h')
            const hasVersion = args.includes('--version') || args.includes('-v')

            expect(flags.dryRun).toBe(hasDryRun)
            expect(flags.clean).toBe(hasClean)
            expect(flags.help).toBe(hasHelp)
            expect(flags.version).toBe(hasVersion)
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should detect invalid flags correctly', () => {
      /**
       * **Feature: plugin-bootstrap-refactor, Property 1: CLI argument parsing produces valid configuration**
       * **Validates: Requirements 1.1**
       *
       * For any invalid flag (starts with - but not recognized),
       * parsing SHALL include it in the invalidFlags array.
       */
      fc.assert(
        fc.property(
          fc.array(invalidFlagArb, { minLength: 1, maxLength: 5 }),
          (args) => {
            const { invalidFlags } = parseArgs(args)

            // All invalid flags should be detected
            expect(invalidFlags.length).toBeGreaterThan(0)

            // Each invalid flag should be in the result
            for (const arg of args) {
              expect(invalidFlags).toContain(arg)
            }
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should ignore non-flag arguments', () => {
      /**
       * **Feature: plugin-bootstrap-refactor, Property 1: CLI argument parsing produces valid configuration**
       * **Validates: Requirements 1.1**
       *
       * For any non-flag argument (doesn't start with -),
       * parsing SHALL ignore it and not include it in invalidFlags.
       */
      fc.assert(
        fc.property(
          fc.array(nonFlagArgArb, { minLength: 1, maxLength: 5 }),
          (args) => {
            const { flags, invalidFlags } = parseArgs(args)

            // No invalid flags should be detected for non-flag arguments
            expect(invalidFlags).toEqual([])

            // All flags should be false (no valid flags provided)
            expect(flags.dryRun).toBe(false)
            expect(flags.clean).toBe(false)
            expect(flags.help).toBe(false)
            expect(flags.version).toBe(false)
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should handle mixed valid and invalid flags', () => {
      /**
       * **Feature: plugin-bootstrap-refactor, Property 1: CLI argument parsing produces valid configuration**
       * **Validates: Requirements 1.1**
       *
       * For any mix of valid and invalid flags,
       * parsing SHALL correctly identify valid flags and report invalid ones.
       */
      fc.assert(
        fc.property(
          fc.array(validFlagArb, { minLength: 0, maxLength: 2 }),
          fc.array(invalidFlagArb, { minLength: 0, maxLength: 2 }),
          (validArgs, invalidArgs) => {
            const allArgs = [...validArgs, ...invalidArgs]
            const { flags, invalidFlags } = parseArgs(allArgs)

            // Valid flags should be set correctly
            const hasDryRun = validArgs.includes('--dry-run') || validArgs.includes('-d')
            const hasClean = validArgs.includes('--clean') || validArgs.includes('-c')
            const hasHelp = validArgs.includes('--help') || validArgs.includes('-h')
            const hasVersion = validArgs.includes('--version') || validArgs.includes('-v')

            expect(flags.dryRun).toBe(hasDryRun)
            expect(flags.clean).toBe(hasClean)
            expect(flags.help).toBe(hasHelp)
            expect(flags.version).toBe(hasVersion)

            // Invalid flags should be detected
            expect(invalidFlags.length).toBe(invalidArgs.length)
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should return default flags for empty input', () => {
      /**
       * **Feature: plugin-bootstrap-refactor, Property 1: CLI argument parsing produces valid configuration**
       * **Validates: Requirements 1.1**
       *
       * For empty input, parsing SHALL return all flags as false.
       */
      const { flags, invalidFlags } = parseArgs([])

      expect(flags.dryRun).toBe(false)
      expect(flags.clean).toBe(false)
      expect(flags.help).toBe(false)
      expect(flags.version).toBe(false)
      expect(invalidFlags).toEqual([])
    })

    it('should handle duplicate flags idempotently', () => {
      /**
       * **Feature: plugin-bootstrap-refactor, Property 1: CLI argument parsing produces valid configuration**
       * **Validates: Requirements 1.1**
       *
       * For duplicate flags, parsing SHALL set the flag to true (idempotent).
       */
      fc.assert(
        fc.property(
          validFlagArb,
          fc.integer({ min: 1, max: 5 }),
          (flag, count) => {
            const args = Array.from({ length: count }, () => flag)
            const { flags, invalidFlags } = parseArgs(args)

            // No invalid flags
            expect(invalidFlags).toEqual([])

            // The flag should be set to true
            if (flag === '--dry-run' || flag === '-d') {
              expect(flags.dryRun).toBe(true)
            }
            if (flag === '--clean' || flag === '-c') {
              expect(flags.clean).toBe(true)
            }
            if (flag === '--help' || flag === '-h') {
              expect(flags.help).toBe(true)
            }
            if (flag === '--version' || flag === '-v') {
              expect(flags.version).toBe(true)
            }
          },
        ),
        { numRuns: 100 },
      )
    })
  })
})
