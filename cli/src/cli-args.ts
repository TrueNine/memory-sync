export type Subcommand
  = | 'help'
    | 'version'
    | 'install'
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
  'install',
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

const RUNTIME_REGEXES: readonly RegExp[] = [
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
].map(runtime => new RegExp(`(?:^|/)${runtime}(?:\\.exe|\\.cmd|\\.ps1)?$`, 'i'))

function isRuntimeExecutable(arg: string): boolean {
  const normalized = arg.toLowerCase().replaceAll('\\', '/')
  return RUNTIME_REGEXES.some(regex => regex.test(normalized))
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
