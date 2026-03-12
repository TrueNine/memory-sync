import type {OutputCleanContext, OutputWriteContext} from './plugins/plugin-core'
/**
 * Plugin Runtime Entry Point
 *
 * Streamlined entry for the Rust CLI binary to spawn via Node.js.
 * Accepts a subcommand and flags, executes the plugin pipeline,
 * and outputs results to stdout.
 *
 * Usage: node plugin-runtime.mjs <subcommand> [--json] [--dry-run]
 *
 * Subcommands: execute, dry-run, clean, plugins
 */
import type {Command, CommandContext} from '@/commands/Command'
import type {PipelineConfig} from '@/config'
import * as fs from 'node:fs'
import * as path from 'node:path'
import process from 'node:process'
import glob from 'fast-glob'
import {CleanCommand} from '@/commands/CleanCommand'
import {DryRunCleanCommand} from '@/commands/DryRunCleanCommand'
import {DryRunOutputCommand} from '@/commands/DryRunOutputCommand'
import {ExecuteCommand} from '@/commands/ExecuteCommand'
import {JsonOutputCommand} from '@/commands/JsonOutputCommand'
import {PluginsCommand} from '@/commands/PluginsCommand'
import {createLogger, setGlobalLogLevel} from './plugins/plugin-core'

/**
 * Parse runtime arguments.
 * Expected: node plugin-runtime.mjs <subcommand> [--json] [--dry-run]
 */
function parseRuntimeArgs(argv: string[]): {subcommand: string, json: boolean, dryRun: boolean} {
  const args = argv.slice(2) // Skip node and script path
  let subcommand = 'execute'
  let json = false
  let dryRun = false

  for (const arg of args) {
    if (arg === '--json' || arg === '-j') json = true
    else if (arg === '--dry-run' || arg === '-n') dryRun = true
    else if (!arg.startsWith('-')) subcommand = arg
  }

  return {subcommand, json, dryRun}
}

/**
 * Resolve command from subcommand string.
 */
function resolveRuntimeCommand(subcommand: string, dryRun: boolean): Command {
  switch (subcommand) {
    case 'execute': return new ExecuteCommand()
    case 'dry-run': return new DryRunOutputCommand()
    case 'clean': return dryRun ? new DryRunCleanCommand() : new CleanCommand()
    case 'plugins': return new PluginsCommand()
    default: return new ExecuteCommand()
  }
}

async function main(): Promise<void> {
  const {subcommand, json, dryRun} = parseRuntimeArgs(process.argv)

  if (json) setGlobalLogLevel('silent')

  const {default: userPluginConfigPromise} = await import('./plugin.config')
  const userPluginConfig: PipelineConfig = await userPluginConfigPromise

  let command = resolveRuntimeCommand(subcommand, dryRun)

  if (json) {
    const selfJsonCommands = new Set(['plugins'])
    if (!selfJsonCommands.has(command.name)) command = new JsonOutputCommand(command)
  }

  const {context, outputPlugins, userConfigOptions} = userPluginConfig
  const logger = createLogger('PluginRuntime')

  const createCleanContext = (dry: boolean): OutputCleanContext => ({
    logger,
    fs,
    path,
    glob,
    collectedOutputContext: context,
    dryRun: dry
  })

  const createWriteContext = (dry: boolean): OutputWriteContext => ({
    logger,
    fs,
    path,
    glob,
    collectedOutputContext: context,
    dryRun: dry,
    registeredPluginNames: [...outputPlugins].map(p => p.name)
  })

  const commandCtx: CommandContext = {
    logger,
    outputPlugins: [...outputPlugins],
    collectedOutputContext: context,
    userConfigOptions,
    createCleanContext,
    createWriteContext
  }

  const result = await command.execute(commandCtx)
  if (!result.success) process.exit(1)
}

function writeJsonFailure(errorMessage: string): void {
  process.stdout.write(`${JSON.stringify({
    success: false,
    filesAffected: 0,
    dirsAffected: 0,
    message: errorMessage,
    pluginResults: [],
    errors: [errorMessage]
  })}\n`)
}

main().catch((e: unknown) => {
  const errorMessage = e instanceof Error ? e.message : String(e)
  const {json} = parseRuntimeArgs(process.argv)
  if (json) {
    writeJsonFailure(errorMessage)
    process.exit(1)
  }
  const logger = createLogger('plugin-runtime', 'error')
  logger.error('unhandled error', {error: errorMessage})
  process.exit(1)
})
