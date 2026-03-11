/**
 * CLI Argument Parser Module
 * Handles extraction and parsing of command-line arguments
 *
 * Refactored to use Command Factory pattern for command creation
 */

import type {Command} from '@/commands/Command'
import {FactoryPriority} from '@/commands/CommandFactory'
import {CommandRegistry} from '@/commands/CommandRegistry'
import {CleanCommandFactory} from '@/commands/factories/CleanCommandFactory'
import {ConfigCommandFactory} from '@/commands/factories/ConfigCommandFactory'
import {DryRunCommandFactory} from '@/commands/factories/DryRunCommandFactory'
import {ExecuteCommandFactory} from '@/commands/factories/ExecuteCommandFactory'
import {HelpCommandFactory} from '@/commands/factories/HelpCommandFactory'
import {InitCommandFactory} from '@/commands/factories/InitCommandFactory'
import {PluginsCommandFactory} from '@/commands/factories/PluginsCommandFactory'
import {UnknownCommandFactory} from '@/commands/factories/UnknownCommandFactory'
import {VersionCommandFactory} from '@/commands/factories/VersionCommandFactory'

/**
 * Valid subcommands for the CLI
 */
export type Subcommand = 'help' | 'version' | 'init' | 'dry-run' | 'clean' | 'config' | 'plugins'

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
  readonly setOption: readonly [key: string, value: string][]
  readonly unknownCommand: string | undefined
  readonly positional: readonly string[]
  readonly unknown: readonly string[]
}

/**
 * Valid subcommands set for quick lookup
 */
const VALID_SUBCOMMANDS: ReadonlySet<string> = new Set(['help', 'version', 'init', 'dry-run', 'clean', 'config', 'plugins'])

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

function pickMoreVerbose(current: LogLevel | undefined, candidate: LogLevel): LogLevel {
  if (current == null) return candidate
  const currentPriority = LOG_LEVEL_PRIORITY.get(current) ?? 4
  const candidatePriority = LOG_LEVEL_PRIORITY.get(candidate) ?? 4
  return candidatePriority < currentPriority ? candidate : current
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
        result.logLevel = pickMoreVerbose(result.logLevel, logLevel)
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
 * Singleton instance of the command registry
 * Lazy-loaded to ensure factories are only created when needed
 */
let commandRegistry: ReturnType<typeof createDefaultCommandRegistry> | undefined

function createDefaultCommandRegistry(): CommandRegistry {
  const registry = new CommandRegistry()

  registry.register(new VersionCommandFactory()) // High priority: flag-based commands
  registry.register(new HelpCommandFactory())
  registry.register(new UnknownCommandFactory())

  registry.registerWithPriority(new InitCommandFactory(), FactoryPriority.Subcommand)
  registry.registerWithPriority(new DryRunCommandFactory(), FactoryPriority.Subcommand)
  registry.registerWithPriority(new CleanCommandFactory(), FactoryPriority.Subcommand)
  registry.registerWithPriority(new PluginsCommandFactory(), FactoryPriority.Subcommand)
  registry.registerWithPriority(new ConfigCommandFactory(), FactoryPriority.Subcommand)

  registry.registerWithPriority(new ExecuteCommandFactory(), FactoryPriority.Subcommand) // Lowest priority: default/catch-all command

  return registry
}

/**
 * Get or create the command registry singleton
 */
function getCommandRegistry(): ReturnType<typeof createDefaultCommandRegistry> {
  commandRegistry ??= createDefaultCommandRegistry()
  return commandRegistry
}

/**
 * Resolve command from parsed CLI arguments using factory pattern
 * Delegates command creation to registered factories based on priority
 */
export function resolveCommand(args: ParsedCliArgs): Command {
  const registry = getCommandRegistry()
  return registry.resolve(args)
}
