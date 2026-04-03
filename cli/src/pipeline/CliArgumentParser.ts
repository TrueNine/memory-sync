import type {Command} from '@/commands/Command'
import {FactoryPriority} from '@/commands/CommandFactory'
import {CommandRegistry} from '@/commands/CommandRegistry'
import {CleanCommandFactory} from '@/commands/factories/CleanCommandFactory'
import {DryRunCommandFactory} from '@/commands/factories/DryRunCommandFactory'
import {ExecuteCommandFactory} from '@/commands/factories/ExecuteCommandFactory'
import {HelpCommandFactory} from '@/commands/factories/HelpCommandFactory'
import {PluginsCommandFactory} from '@/commands/factories/PluginsCommandFactory'
import {UnknownCommandFactory} from '@/commands/factories/UnknownCommandFactory'
import {VersionCommandFactory} from '@/commands/factories/VersionCommandFactory'

export type Subcommand
  = | 'help'
    | 'version'
    | 'dry-run'
    | 'clean'
    | 'plugins'
export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error'

export interface ParsedCliArgs {
  readonly subcommand: Subcommand | undefined
  readonly helpFlag: boolean
  readonly versionFlag: boolean
  readonly dryRun: boolean
  readonly logLevel: LogLevel | undefined
  readonly unknownCommand: string | undefined
  readonly positional: readonly string[]
  readonly unknown: readonly string[]
}

const VALID_SUBCOMMANDS: ReadonlySet<string> = new Set([
  'help',
  'version',
  'dry-run',
  'clean',
  'plugins'
])
const LOG_LEVEL_FLAGS: ReadonlyMap<string, LogLevel> = new Map([
  ['--trace', 'trace'],
  ['--debug', 'debug'],
  ['--info', 'info'],
  ['--warn', 'warn'],
  ['--error', 'error']
])
const LOG_LEVEL_PRIORITY: ReadonlyMap<LogLevel, number> = new Map([
  ['trace', 0],
  ['debug', 1],
  ['info', 2],
  ['warn', 3],
  ['error', 4]
])

export function extractUserArgs(argv: readonly string[]): string[] {
  const args = [...argv]
  const first = args[0]
  if (first != null && isRuntimeExecutable(first)) args.shift()
  const second = args[0]
  if (second != null && isScriptOrPackage(second)) args.shift()
  return args
}

function isRuntimeExecutable(arg: string): boolean {
  const runtimes = [
    'node',
    'nodejs',
    'bun',
    'deno',
    'tsx',
    'ts-node',
    'npx',
    'pnpx',
    'yarn',
    'pnpm'
  ]
  const normalized = arg.toLowerCase().replaceAll('\\', '/')
  return runtimes.some(
    runtime =>
      new RegExp(`(?:^|/)${runtime}(?:\\.exe|\\.cmd|\\.ps1)?$`, 'i').test(
        normalized
      ) || normalized === runtime
  )
}

function isScriptOrPackage(arg: string): boolean {
  if (/\.(?:m?[jt]s|cjs)$/u.test(arg)) return true
  if (/[/\\]/u.test(arg) && !arg.startsWith('-')) return true
  return /^(?:@[\w-]+\/)?[\w-]+$/u.test(arg) && !arg.startsWith('-')
}

function pickMoreVerbose(
  current: LogLevel | undefined,
  candidate: LogLevel
): LogLevel {
  if (current == null) return candidate
  const currentPriority = LOG_LEVEL_PRIORITY.get(current) ?? 4
  const candidatePriority = LOG_LEVEL_PRIORITY.get(candidate) ?? 4
  return candidatePriority < currentPriority ? candidate : current
}

export function parseArgs(args: readonly string[]): ParsedCliArgs {
  const result: {
    subcommand: Subcommand | undefined
    helpFlag: boolean
    versionFlag: boolean
    dryRun: boolean
    logLevel: LogLevel | undefined
    unknownCommand: string | undefined
    positional: string[]
    unknown: string[]
  } = {
    subcommand: void 0,
    helpFlag: false,
    versionFlag: false,
    dryRun: false,
    logLevel: void 0,
    unknownCommand: void 0,
    positional: [],
    unknown: []
  }

  let firstPositionalProcessed = false
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg == null) continue
    if (arg === '--') {
      result.positional.push(
        ...args.slice(i + 1).filter((value): value is string => value != null)
      )
      break
    }

    if (arg.startsWith('--')) {
      const parts = arg.split('=')
      const key = parts[0] ?? ''
      const logLevel = LOG_LEVEL_FLAGS.get(key)
      if (logLevel != null) {
        result.logLevel = pickMoreVerbose(result.logLevel, logLevel)
        continue
      }

      switch (key) {
        case '--help':
          result.helpFlag = true
          break
        case '--version':
          result.versionFlag = true
          break
        case '--dry-run':
          result.dryRun = true
          break
        default:
          result.unknown.push(arg)
      }
      continue
    }

    if (arg.startsWith('-') && arg.length > 1) {
      for (const flag of arg.slice(1)) {
        switch (flag) {
          case 'h':
            result.helpFlag = true
            break
          case 'v':
            result.versionFlag = true
            break
          case 'n':
            result.dryRun = true
            break
          default:
            result.unknown.push(`-${flag}`)
        }
      }
      continue
    }

    if (!firstPositionalProcessed) {
      firstPositionalProcessed = true
      if (VALID_SUBCOMMANDS.has(arg)) result.subcommand = arg as Subcommand
      else result.unknownCommand = arg
      continue
    }

    result.positional.push(arg)
  }

  return result
}

let commandRegistry: CommandRegistry | undefined

function createDefaultCommandRegistry(): CommandRegistry {
  const registry = new CommandRegistry()
  registry.register(new VersionCommandFactory())
  registry.register(new HelpCommandFactory())
  registry.register(new UnknownCommandFactory())
  registry.registerWithPriority(
    new DryRunCommandFactory(),
    FactoryPriority.Subcommand
  )
  registry.registerWithPriority(
    new CleanCommandFactory(),
    FactoryPriority.Subcommand
  )
  registry.registerWithPriority(
    new PluginsCommandFactory(),
    FactoryPriority.Subcommand
  )
  registry.registerWithPriority(
    new ExecuteCommandFactory(),
    FactoryPriority.Subcommand
  )
  return registry
}

function getCommandRegistry(): CommandRegistry {
  commandRegistry ??= createDefaultCommandRegistry()
  return commandRegistry
}

export function resolveCommand(args: ParsedCliArgs): Command {
  return getCommandRegistry().resolve(args)
}
