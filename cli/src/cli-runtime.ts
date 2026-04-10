import type {MemorySyncCommandResult, MemorySyncPluginInfo} from '@truenine/memory-sync-sdk'

import process from 'node:process'
import {
  flushOutput,
  setGlobalLogLevel
} from '@truenine/logger'
import {
  getMemorySyncSdkBinding

} from '@truenine/memory-sync-sdk'
import {extractUserArgs, parseArgs} from './cli-args'

process.env['TNMSC_DISABLE_NATIVE_COMMAND_BINDING'] = '1'

const CLI_NAME = 'tnmsc'

export function getCliVersion(): string {
  return typeof __CLI_VERSION__ !== 'undefined' ? __CLI_VERSION__ : 'dev'
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function writeHelp(): void {
  process.stdout.write(
    `${`
# ${CLI_NAME} v${getCliVersion()}

Synchronize AI memory and configuration files across projects.

## Usage

- \`${CLI_NAME}\` runs the default install pipeline.
- \`${CLI_NAME} help\` shows this help message.
- \`${CLI_NAME} version\` shows the CLI version.
- \`${CLI_NAME} install\` runs the install pipeline explicitly.
- \`${CLI_NAME} dry-run\` previews what would be written.
- \`${CLI_NAME} clean\` removes generated files.
- \`${CLI_NAME} clean --dry-run\` previews what would be cleaned.
- \`${CLI_NAME} plugins\` lists the built-in output plugins.

## Log Controls

- \`--trace\` shows the most detail.
- \`--debug\` shows debug detail.
- \`--info\` shows key progress and results.
- \`--warn\` shows warnings only.
- \`--error\` shows errors only.

## Configuration

- Global user config: \`~/.aindex/.tnmsc.json\`
- Runtime core: \`@truenine/memory-sync-sdk\`
`.trim()}\n`
  )
}

function writeVersion(): void {
  process.stdout.write(`# ${CLI_NAME} v${getCliVersion()}\n`)
}

function writeUnknownCommand(command: string): void {
  process.stderr.write(`Unknown command: ${command}\nRun \`${CLI_NAME} help\` for supported commands.\n`)
}

function writePluginList(plugins: readonly MemorySyncPluginInfo[]): void {
  const lines = ['# Registered plugins', '']
  if (plugins.length === 0) {
    lines.push('- No plugins are currently registered.')
  } else {
    for (const plugin of plugins) {
      const dependencySuffix = plugin.dependencies.length > 0
        ? ` (depends on: ${plugin.dependencies.join(', ')})`
        : ''
      lines.push(`- ${plugin.name}${dependencySuffix}`)
    }
  }
  process.stdout.write(`${lines.join('\n')}\n`)
}

export async function runCli(
  argv: readonly string[] = process.argv
): Promise<number> {
  try {
    const parsedArgs = parseArgs(extractUserArgs(argv))

    if (parsedArgs.logLevel != null) setGlobalLogLevel(parsedArgs.logLevel)

    if (parsedArgs.helpFlag || parsedArgs.subcommand === 'help') {
      writeHelp()
      flushOutput()
      return 0
    }

    if (parsedArgs.versionFlag || parsedArgs.subcommand === 'version') {
      writeVersion()
      flushOutput()
      return 0
    }

    if (parsedArgs.unknownCommand != null) {
      writeUnknownCommand(parsedArgs.unknownCommand)
      flushOutput()
      return 1
    }

    const binding = getMemorySyncSdkBinding()
    const commandOptions = {
      cwd: process.cwd(),
      ...parsedArgs.logLevel != null ? {logLevel: parsedArgs.logLevel} : {}
    } as const

    let result: MemorySyncCommandResult
    switch (parsedArgs.subcommand) {
      case 'plugins': {
        const plugins = await binding.listPlugins()
        writePluginList(plugins)
        flushOutput()
        return 0
      }
      case 'dry-run':
        result = await binding.dryRun(commandOptions)
        break
      case 'clean':
        result = await binding.clean({
          ...commandOptions,
          dryRun: parsedArgs.dryRun
        })
        break
      default:
        result = await binding.install(commandOptions)
    }

    flushOutput()
    return result.success ? 0 : 1
  } catch (error) {
    process.stderr.write(`[${CLI_NAME}] ${toErrorMessage(error)}\n`)
    flushOutput()
    return 1
  }
}
