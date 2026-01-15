import type {LogLevel, ParsedCliArgs} from '@/PluginPipeline'
import fc from 'fast-check'
import {describe, expect, it} from 'vitest'
import {DryRunCleanCommand, ExecuteCommand, HelpCommand} from '@/commands'
import {parseArgs, resolveCommand, resolveLogLevel} from '@/PluginPipeline'

/**
 * Feature: cli-refactor
 * Property-based tests for argument parsing
 */
describe('parseArgs property tests', () => {
  /**
   * Feature: cli-refactor, Property 2: Log Level Flag Parsing
   * For any argument array containing exactly one log level flag,
   * the parsed result SHALL have logLevel set to the corresponding level.
   * Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5
   */
  describe('property 2: Log Level Flag Parsing', () => {
    const logLevelFlags = [
      {flag: '--trace', level: 'trace'},
      {flag: '--debug', level: 'debug'},
      {flag: '--info', level: 'info'},
      {flag: '--warn', level: 'warn'},
      {flag: '--error', level: 'error'},
    ] as const

    it('should parse single log level flag correctly', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...logLevelFlags),
          fc.array(fc.string().filter(s => !s.startsWith('-') && s.length > 0), {maxLength: 5}),
          ({flag, level}, otherArgs) => {
            const filteredArgs = otherArgs.filter( // Filter out any strings that might be valid subcommands
              arg => !['help', 'init', 'dry-run', 'clean'].includes(arg),
            )
            const args = [flag, ...filteredArgs]
            const result = parseArgs(args)
            expect(result.logLevel).toBe(level)
          },
        ),
        {numRuns: 100},
      )
    })
  })

  /**
   * Feature: cli-refactor, Property 3: Log Level Default Behavior
   * For any argument array that does not contain any log level flags,
   * the parsed result SHALL have logLevel set to undefined.
   * Validates: Requirements 6.6
   */
  describe('property 3: Log Level Default Behavior', () => {
    const logLevelFlags = new Set(['--trace', '--debug', '--info', '--warn', '--error'])

    it('should have undefined logLevel when no log level flag is provided', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.string().filter(s => !logLevelFlags.has(s) && s.length > 0),
            {maxLength: 10},
          ),
          args => {
            const result = parseArgs(args)
            expect(result.logLevel).toBeUndefined()
          },
        ),
        {numRuns: 100},
      )
    })
  })

  /**
   * Feature: cli-refactor, Property 5: Unknown Subcommand Detection
   * For any first positional argument that is not a valid subcommand
   * and does not start with '-', the parsed result SHALL capture it as unknownCommand.
   * Validates: Requirements 7.1
   */
  describe('property 5: Unknown Subcommand Detection', () => {
    const validSubcommands = ['help', 'init', 'dry-run', 'clean']

    it('should capture unknown first positional as unknownCommand', () => {
      fc.assert(
        fc.property(
          fc.string({minLength: 1}).filter(s =>
            !validSubcommands.includes(s) && !s.startsWith('-') && s.trim().length > 0), // Must not be empty // Must not start with '-' // Must not be a valid subcommand
          unknownCmd => {
            const result = parseArgs([unknownCmd])
            expect(result.unknownCommand).toBe(unknownCmd)
            expect(result.subcommand).toBeUndefined()
          },
        ),
        {numRuns: 100},
      )
    })

    it('should not set unknownCommand for valid subcommands', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...validSubcommands),
          subcommand => {
            const result = parseArgs([subcommand])
            expect(result.unknownCommand).toBeUndefined()
            expect(result.subcommand).toBe(subcommand)
          },
        ),
        {numRuns: 100},
      )
    })
  })
})

/**
 * Feature: cli-refactor
 * Property-based tests for log level resolution
 */
describe('resolveLogLevel property tests', () => {
  /**
   * Feature: cli-refactor, Property 4: Log Level Priority Resolution
   * For any argument array containing multiple log level flags,
   * the resolved log level SHALL be the most verbose level among those specified.
   * Priority: trace > debug > info > warn > error
   * Validates: Requirements 6.7
   */
  describe('property 4: Log Level Priority Resolution', () => {
    const allLogLevels: LogLevel[] = ['trace', 'debug', 'info', 'warn', 'error']
    const logLevelPriority: Record<LogLevel, number> = {
      trace: 0,
      debug: 1,
      info: 2,
      warn: 3,
      error: 4,
    }

    it('should resolve to most verbose level when multiple flags provided', () => {
      fc.assert(
        fc.property(
          fc.array(fc.constantFrom(...allLogLevels), {minLength: 1, maxLength: 5}), // Generate a non-empty subset of log levels
          levels => {
            const args = levels.map(level => `--${level}`) // Build args with log level flags
            const parsed = parseArgs(args)
            const resolved = resolveLogLevel(parsed)

            const expectedLevel = levels.reduce((mostVerbose, current) => logLevelPriority[current] < logLevelPriority[mostVerbose] // Find expected most verbose level
              ? current
              : mostVerbose)

            expect(resolved).toBe(expectedLevel)
          },
        ),
        {numRuns: 100},
      )
    })

    it('should return undefined when no log level flags provided', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.string().filter(s =>
              !allLogLevels.some(level => s === `--${level}`)), // Exclude log level flags
            {maxLength: 10},
          ),
          args => {
            const parsed = parseArgs(args)
            const resolved = resolveLogLevel(parsed)
            expect(resolved).toBeUndefined()
          },
        ),
        {numRuns: 100},
      )
    })

    it('should always return trace when trace is among the flags', () => {
      fc.assert(
        fc.property(
          fc.array(fc.constantFrom('debug', 'info', 'warn', 'error') as fc.Arbitrary<LogLevel>, {maxLength: 4}), // Generate other log levels (not trace)
          otherLevels => {
            const args = ['--trace', ...otherLevels.map(level => `--${level}`)] // Always include trace
            const parsed = parseArgs(args)
            const resolved = resolveLogLevel(parsed)

            expect(resolved).toBe('trace')
          },
        ),
        {numRuns: 100},
      )
    })
  })
})

/**
 * Feature: cli-refactor
 * Property-based tests for command resolution
 */
describe('resolveCommand property tests', () => {
  /**
   * Helper to create a ParsedCliArgs object with defaults
   */
  function createParsedArgs(overrides: Partial<ParsedCliArgs> = {}): ParsedCliArgs {
    return {
      subcommand: void 0,
      helpFlag: false,
      versionFlag: false,
      dryRun: false,
      logLevel: void 0,
      logLevelFlags: [],
      setOption: [],
      unknownCommand: void 0,
      positional: [],
      unknown: [],
      ...overrides,
    }
  }

  /**
   * Feature: cli-refactor, Property 1: Default Command Resolution
   * For any empty argument array (no subcommand, no flags),
   * the command resolver SHALL return ExecuteCommand.
   * Validates: Requirements 1.1
   */
  describe('property 1: Default Command Resolution', () => {
    it('should return ExecuteCommand for empty/default args', () => {
      fc.assert(
        fc.property(
          fc.array( // Generate arrays of non-flag, non-subcommand strings (positional args)
            fc.string().filter(s =>
              !s.startsWith('-') // Exclude flags and valid subcommands
              && !['help', 'init', 'dry-run', 'clean'].includes(s)
              && s.trim().length === 0),
            {maxLength: 5},
          ),
          _emptyArgs => {
            const args = createParsedArgs() // Create args with no subcommand, no helpFlag, no unknownCommand
            const command = resolveCommand(args)
            expect(command).toBeInstanceOf(ExecuteCommand)
          },
        ),
        {numRuns: 100},
      )
    })

    it('should return ExecuteCommand when only positional args are present', () => {
      fc.assert(
        fc.property(
          fc.array(fc.string({minLength: 1}), {maxLength: 5}),
          positionalArgs => {
            const args = createParsedArgs({positional: positionalArgs}) // Create args with positional but no subcommand/flags
            const command = resolveCommand(args)
            expect(command).toBeInstanceOf(ExecuteCommand)
          },
        ),
        {numRuns: 100},
      )
    })
  })

  /**
   * Feature: cli-refactor, Property 6: Help Flag Equivalence
   * For any argument array, if --help or -h flag is present,
   * the resolved command SHALL be HelpCommand regardless of other arguments.
   * Validates: Requirements 2.1, 2.2, 2.3
   */
  describe('property 6: Help Flag Equivalence', () => {
    const validSubcommands = ['help', 'init', 'dry-run', 'clean'] as const

    it('should return HelpCommand when helpFlag is true regardless of subcommand', () => {
      fc.assert(
        fc.property(
          fc.option(fc.constantFrom(...validSubcommands), {nil: void 0}),
          fc.boolean(),
          fc.option(fc.string({minLength: 1}), {nil: void 0}),
          (subcommand, dryRun, unknownCommand) => {
            const args = createParsedArgs({helpFlag: true, subcommand, dryRun, unknownCommand})
            const command = resolveCommand(args)
            expect(command).toBeInstanceOf(HelpCommand)
          },
        ),
        {numRuns: 100},
      )
    })

    it('should return HelpCommand when helpFlag is true with any log level', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('trace', 'debug', 'info', 'warn', 'error') as fc.Arbitrary<LogLevel>,
          logLevel => {
            const args = createParsedArgs({
              helpFlag: true,
              logLevel,
              logLevelFlags: [logLevel],
            })
            const command = resolveCommand(args)
            expect(command).toBeInstanceOf(HelpCommand)
          },
        ),
        {numRuns: 100},
      )
    })
  })

  /**
   * Feature: cli-refactor, Property 7: Clean Dry-Run Flag Parsing
   * For any argument array where subcommand is 'clean' and contains --dry-run or -n flag,
   * the resolved command SHALL be DryRunCleanCommand.
   * Validates: Requirements 5.2, 5.3
   */
  describe('property 7: Clean Dry-Run Flag Parsing', () => {
    it('should return DryRunCleanCommand when clean subcommand with dryRun flag', () => {
      fc.assert(
        fc.property(
          fc.option(fc.constantFrom('trace', 'debug', 'info', 'warn', 'error') as fc.Arbitrary<LogLevel>, {nil: void 0}),
          fc.array(fc.string(), {maxLength: 5}),
          (logLevel, positional) => {
            const args = createParsedArgs({
              subcommand: 'clean',
              dryRun: true,
              logLevel,
              logLevelFlags: logLevel != null ? [logLevel] : [],
              positional,
            })
            const command = resolveCommand(args)
            expect(command).toBeInstanceOf(DryRunCleanCommand)
          },
        ),
        {numRuns: 100},
      )
    })

    it('should return DryRunCleanCommand regardless of other flags when clean + dryRun', () => {
      fc.assert(
        fc.property(
          fc.array(fc.string(), {maxLength: 5}),
          unknownFlags => {
            const args = createParsedArgs({subcommand: 'clean', dryRun: true, unknown: unknownFlags})
            const command = resolveCommand(args)
            expect(command).toBeInstanceOf(DryRunCleanCommand)
          },
        ),
        {numRuns: 100},
      )
    })
  })
})
