/**
 * CLI Argument Parser Module
 * Handles extraction and parsing of command-line arguments
 */

import type {Command} from '@/commands'
import {
  CleanCommand,
  ConfigCommand,
  ConfigShowCommand,
  DryRunCleanCommand,
  DryRunOutputCommand,
  ExecuteCommand,
  HelpCommand,
  InitCommand,
  OutdatedCommand,
  PluginsCommand,
  UnknownCommand,
  VersionCommand
} from '@/commands'

/**
 * Valid subcommands for the CLI
 */
export type Subcommand = 'help' | 'version' | 'outdated' | 'init' | 'dry-run' | 'clean' | 'config' | 'plugins'

/**
 * Valid log levels for the CLI
 */
export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error'

/**
 * Command line argument parsing result
 */
export interface ParsedCliArgs {
  readonly subcommand: Subcommand | undefined
  readonly helpFlag: boolean
  readonly versionFlag: boolean
  readonly dryRun: boolean
  readonly jsonFlag: boolean
  readonly showFlag: boolean
  readonly logLevel: LogLevel | undefined
  readonly logLevelFlags: readonly LogLevel[]
  readonly setOption: readonly [key: string, value: string][]
  readonly unknownCommand: string | undefined
  readonly positional: readonly string[]
  readonly unknown: readonly string[]
}

/**
 * Valid subcommands set for quick lookup
 */
const VALID_SUBCOMMANDS: ReadonlySet<string> = new Set(['help', 'version', 'outdated', 'init', 'dry-run', 'clean', 'config', 'plugins'])

/**
 * Log level flags mapping
 */
const LOG_LEVEL_FLAGS: ReadonlyMap<string, LogLevel> = new Map([
  ['--trace', 'trace'],
  ['--debug', 'debug'],
  ['--info', 'info'],
  ['--warn', 'warn'],
  ['--error', 'error']
])

/**
 * Log level priority map (lower number = more verbose)
 */
const LOG_LEVEL_PRIORITY: ReadonlyMap<LogLevel, number> = new Map([
  ['trace', 0],
  ['debug', 1],
  ['info', 2],
  ['warn', 3],
  ['error', 4]
])

/**
 * Extract actual user arguments from argv
 * Compatible with various execution scenarios: npx, node, tsx, direct execution, etc.
 */
export function extractUserArgs(argv: readonly string[]): string[] {
  const args = [...argv]

  const first = args[0] // Skip runtime path (node, bun, deno, etc.)
  if (first != null && isRuntimeExecutable(first)) args.shift()

  const second = args[0] // Skip script path or npx package name
  if (second != null && isScriptOrPackage(second)) args.shift()

  return args
}

/**
 * Determine if it is a runtime executable
 */
function isRuntimeExecutable(arg: string): boolean {
  const runtimes = ['node', 'nodejs', 'bun', 'deno', 'tsx', 'ts-node', 'npx', 'pnpx', 'yarn', 'pnpm']
  const normalized = arg.toLowerCase().replaceAll('\\', '/')
  return runtimes.some(rt => {
    const pattern = new RegExp(`(?:^|/)${rt}(?:\\.exe|\\.cmd|\\.ps1)?$`, 'i')
    return pattern.test(normalized) || normalized === rt
  })
}

/**
 * Determine if it is a script file or package name
 */
function isScriptOrPackage(arg: string): boolean {
  if (/\.(?:m?[jt]s|cjs)$/.test(arg)) return true // Script file
  if (/[/\\]/.test(arg) && !arg.startsWith('-')) return true // File path containing separators
  return /^(?:@[\w-]+\/)?[\w-]+$/.test(arg) && !arg.startsWith('-') // npx executed package name
}

/**
 * Resolve log level from parsed arguments.
 * When multiple log level flags are provided, returns the most verbose level.
 * Priority: trace > debug > info > warn > error
 */
export function resolveLogLevel(args: ParsedCliArgs): LogLevel | undefined {
  const {logLevelFlags} = args

  if (logLevelFlags.length === 0) return void 0

  let mostVerbose: LogLevel = logLevelFlags[0]! // Find the most verbose level (lowest priority number)
  let lowestPriority = LOG_LEVEL_PRIORITY.get(mostVerbose) ?? 4

  for (const level of logLevelFlags) {
    const priority = LOG_LEVEL_PRIORITY.get(level) ?? 4
    if (priority < lowestPriority) {
      lowestPriority = priority
      mostVerbose = level
    }
  }

  return mostVerbose
}

/**
 * Parse command line arguments into structured result
 */
export function parseArgs(args: readonly string[]): ParsedCliArgs {
  const result: {
    subcommand: Subcommand | undefined
    helpFlag: boolean
    versionFlag: boolean
    dryRun: boolean
    jsonFlag: boolean
    showFlag: boolean
    logLevel: LogLevel | undefined
    logLevelFlags: LogLevel[]
    setOption: [key: string, value: string][]
    unknownCommand: string | undefined
    positional: string[]
    unknown: string[]
  } = {
    subcommand: void 0,
    helpFlag: false,
    versionFlag: false,
    dryRun: false,
    jsonFlag: false,
    showFlag: false,
    logLevel: void 0,
    logLevelFlags: [],
    setOption: [],
    unknownCommand: void 0,
    positional: [],
    unknown: []
  }

  let firstPositionalProcessed = false

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg == null) continue

    if (arg === '--') { // Handle -- separator: all following args are positional
      result.positional.push(...args.slice(i + 1).filter((a): a is string => a != null))
      break
    }

    if (arg.startsWith('--')) { // Long options
      const parts = arg.split('=')
      const key = parts[0] ?? ''

      const logLevel = LOG_LEVEL_FLAGS.get(key) // Check log level flags
      if (logLevel != null) {
        result.logLevelFlags.push(logLevel)
        result.logLevel = logLevel
        continue
      }

      switch (key) {
        case '--help': result.helpFlag = true; break
        case '--version': result.versionFlag = true; break
        case '--dry-run': result.dryRun = true; break
        case '--json': result.jsonFlag = true; break
        case '--show': result.showFlag = true; break
        case '--set':
          if (parts.length > 1) { // Parse --set key=value from next arg or from = syntax
            const keyValue = parts.slice(1).join('=')
            const eqIndex = keyValue.indexOf('=')
            if (eqIndex > 0) result.setOption.push([keyValue.slice(0, eqIndex), keyValue.slice(eqIndex + 1)])
          } else {
            const nextArg = args[i + 1] // Next arg is the value
            if (nextArg != null) {
              const eqIndex = nextArg.indexOf('=')
              if (eqIndex > 0) {
                result.setOption.push([nextArg.slice(0, eqIndex), nextArg.slice(eqIndex + 1)])
                i++ // Skip next arg
              }
            }
          }
          break
        default: result.unknown.push(arg)
      }
      continue
    }

    if (arg.startsWith('-') && arg.length > 1) { // Short options
      const flags = arg.slice(1)
      for (const flag of flags) {
        switch (flag) {
          case 'h': result.helpFlag = true; break
          case 'v': result.versionFlag = true; break
          case 'n': result.dryRun = true; break
          case 'j': result.jsonFlag = true; break
          default: result.unknown.push(`-${flag}`)
        }
      }
      continue
    }

    if (!firstPositionalProcessed) { // First positional argument: check if it's a subcommand
      firstPositionalProcessed = true
      if (VALID_SUBCOMMANDS.has(arg)) result.subcommand = arg as Subcommand
      else {
        result.unknownCommand = arg // Unknown first positional is captured as unknownCommand
      }
      continue
    }

    result.positional.push(arg) // Remaining positional arguments
  }

  return result
}

/**
 * Resolve command from parsed CLI arguments
 */
export function resolveCommand(args: ParsedCliArgs): Command {
  const {helpFlag, versionFlag, subcommand, dryRun, unknownCommand, setOption, positional, showFlag} = args

  if (versionFlag) return new VersionCommand() // Version flag takes highest priority

  if (helpFlag) return new HelpCommand() // Help flag takes priority

  if (unknownCommand != null) return new UnknownCommand(unknownCommand) // Unknown command handling

  if (subcommand === 'version') return new VersionCommand() // Version subcommand

  if (subcommand === 'help') return new HelpCommand() // Help subcommand

  if (subcommand === 'outdated') return new OutdatedCommand() // Outdated subcommand

  if (subcommand === 'init') return new InitCommand() // Init subcommand

  if (subcommand === 'dry-run') return new DryRunOutputCommand() // Dry-run subcommand

  if (subcommand === 'clean') { // Clean subcommand with optional dry-run flag
    if (dryRun) return new DryRunCleanCommand()
    return new CleanCommand()
  }

  if (subcommand === 'plugins') return new PluginsCommand() // Plugins subcommand

  if (subcommand === 'config' && showFlag) return new ConfigShowCommand() // Config --show subcommand

  if (subcommand !== 'config' || setOption.length > 0) return new ExecuteCommand() // Config subcommand

  const parsedPositional: [key: string, value: string][] = []
  for (const arg of positional) {
    const eqIndex = arg.indexOf('=')
    if (eqIndex > 0) parsedPositional.push([arg.slice(0, eqIndex), arg.slice(eqIndex + 1)])
  }
  return new ConfigCommand([...setOption, ...parsedPositional])
}
