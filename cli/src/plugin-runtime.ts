import type {MemorySyncCommandResult} from '@truenine/memory-sync-sdk'

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

const INTERNAL_BRIDGE_JSON_FLAG = '--bridge-json'

interface RuntimeArgs {
  subcommand: 'install' | 'dry-run' | 'clean' | 'plugins'
  bridgeJson: boolean
  dryRun: boolean
  logLevel?: 'trace' | 'debug' | 'info' | 'warn' | 'error'
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function parseRuntimeArgs(argv: string[]): RuntimeArgs {
  const args = argv.filter(arg => arg !== INTERNAL_BRIDGE_JSON_FLAG)
  const parsed = parseArgs(extractUserArgs(args))
  let subcommand: RuntimeArgs['subcommand']
  switch (parsed.subcommand) {
    case 'clean':
      subcommand = 'clean'
      break
    case 'dry-run':
      subcommand = 'dry-run'
      break
    case 'plugins':
      subcommand = 'plugins'
      break
    default:
      subcommand = 'install'
  }
  return {
    subcommand,
    bridgeJson: argv.includes(INTERNAL_BRIDGE_JSON_FLAG),
    dryRun: parsed.dryRun,
    ...parsed.logLevel != null ? {logLevel: parsed.logLevel} : {}
  }
}

function flushAndExit(code: number): never {
  flushOutput()
  process.exit(code)
}

function writeBridgeJsonFailure(error: unknown, warnings: readonly unknown[] = []): void {
  process.stdout.write(
    `${JSON.stringify(
      {
        success: false,
        filesAffected: 0,
        dirsAffected: 0,
        message: toErrorMessage(error),
        pluginResults: [],
        warnings,
        errors: []
      }
    )}\n`
  )
}

async function main(args: RuntimeArgs): Promise<void> {
  const {subcommand, bridgeJson, dryRun, logLevel} = args
  if (bridgeJson) setGlobalLogLevel('silent')
  else if (logLevel != null) setGlobalLogLevel(logLevel)

  const binding = getMemorySyncSdkBinding()
  if (subcommand === 'plugins') {
    const plugins = await binding.listPlugins()
    process.stdout.write(`${JSON.stringify(plugins)}\n`)
    flushOutput()
    return
  }

  const options = {
    cwd: process.cwd(),
    ...logLevel != null ? {logLevel} : {}
  } as const

  let result: MemorySyncCommandResult
  switch (subcommand) {
    case 'dry-run':
      result = await binding.dryRun(options)
      break
    case 'clean':
      result = await binding.clean({...options, dryRun})
      break
    default:
      result = await binding.install(options)
  }

  if (bridgeJson) {
    process.stdout.write(`${JSON.stringify({
      success: result.success,
      filesAffected: result.filesAffected,
      dirsAffected: result.dirsAffected,
      ...result.message != null ? {message: result.message} : {},
      pluginResults: [],
      warnings: result.warnings,
      errors: result.errors
    })}\n`)
  }

  if (!result.success) flushAndExit(1)
  flushOutput()
}

const runtimeArgs = parseRuntimeArgs(process.argv)
main(runtimeArgs).catch(error => {
  if (runtimeArgs.bridgeJson) {
    writeBridgeJsonFailure(error)
    flushAndExit(1)
  }
  process.stderr.write(`[plugin-runtime] ${toErrorMessage(error)}\n`)
  flushAndExit(1)
})
