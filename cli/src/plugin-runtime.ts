import type {OutputCleanContext, OutputWriteContext, RuntimeCommand} from '@truenine/memory-sync-sdk'
import type {Command, CommandContext} from '@/commands/Command'
import process from 'node:process'
import {
  buildUnhandledExceptionDiagnostic,
  createLogger,
  discoverOutputRuntimeTargets,
  drainBufferedDiagnostics,
  flushOutput,
  setGlobalLogLevel
} from '@truenine/memory-sync-sdk'
import {CleanCommand} from '@/commands/CleanCommand'
import {DryRunCleanCommand} from '@/commands/DryRunCleanCommand'
import {DryRunOutputCommand} from '@/commands/DryRunOutputCommand'
import {ExecuteCommand} from '@/commands/ExecuteCommand'
import {JsonOutputCommand, toJsonCommandResult} from '@/commands/JsonOutputCommand'
import {PluginsCommand} from '@/commands/PluginsCommand'
import {createDefaultPluginConfig} from './plugin.config'

function parseRuntimeArgs(argv: string[]): {subcommand: RuntimeCommand, json: boolean, dryRun: boolean} {
  const args = argv.slice(2)
  let subcommand: RuntimeCommand = 'execute'
  let json = false
  let dryRun = false
  for (const arg of args) {
    if (arg === '--json' || arg === '-j') json = true
    else if (arg === '--dry-run' || arg === '-n') dryRun = true
    else if (!arg.startsWith('-')) {
      subcommand = arg === 'plugins' || arg === 'clean' || arg === 'dry-run' ? arg : 'execute'
    }
  }
  return {subcommand, json, dryRun}
}

function resolveRuntimeCommand(subcommand: RuntimeCommand, dryRun: boolean): Command {
  switch (subcommand) {
    case 'execute':
      return new ExecuteCommand()
    case 'dry-run':
      return new DryRunOutputCommand()
    case 'clean':
      return dryRun ? new DryRunCleanCommand() : new CleanCommand()
    case 'plugins':
      return new PluginsCommand()
  }
}

function writeJsonFailure(error: unknown): void {
  const logger = createLogger('plugin-runtime', 'silent')
  logger.error(buildUnhandledExceptionDiagnostic('plugin-runtime', error))
  process.stdout.write(
    `${JSON.stringify(
      toJsonCommandResult(
        {
          success: false,
          filesAffected: 0,
          dirsAffected: 0,
          message: error instanceof Error ? error.message : String(error)
        },
        drainBufferedDiagnostics()
      )
    )}\n`
  )
}

function flushAndExit(code: number): never {
  flushOutput()
  process.exit(code)
}

async function main(): Promise<void> {
  const {subcommand, json, dryRun} = parseRuntimeArgs(process.argv)
  if (json) setGlobalLogLevel('silent')
  const logger = createLogger('PluginRuntime')

  logger.info('runtime bootstrap started', {subcommand, json, dryRun})

  const userPluginConfig = await createDefaultPluginConfig(process.argv, subcommand)
  let command = resolveRuntimeCommand(subcommand, dryRun)
  if (json && !new Set(['plugins']).has(command.name)) command = new JsonOutputCommand(command)

  const {context, outputPlugins, userConfigOptions} = userPluginConfig
  logger.info('runtime configuration resolved', {
    command: command.name,
    pluginCount: outputPlugins.length,
    projectCount: context.workspace.projects.length,
    workspaceDir: context.workspace.directory.path,
    ...context.aindexDir != null ? {aindexDir: context.aindexDir} : {}
  })
  const runtimeTargets = discoverOutputRuntimeTargets(logger)
  logger.info('runtime targets discovered', {
    command: command.name,
    jetbrainsCodexDirs: runtimeTargets.jetbrainsCodexDirs.length
  })
  const createCleanContext = (dry: boolean): OutputCleanContext => ({
    logger,
    collectedOutputContext: context,
    pluginOptions: userConfigOptions,
    runtimeTargets,
    dryRun: dry
  })
  const createWriteContext = (dry: boolean): OutputWriteContext => ({
    logger,
    collectedOutputContext: context,
    pluginOptions: userConfigOptions,
    runtimeTargets,
    dryRun: dry,
    registeredPluginNames: Array.from(outputPlugins, plugin => plugin.name)
  })
  const commandCtx: CommandContext = {
    logger,
    outputPlugins: [...outputPlugins],
    collectedOutputContext: context,
    userConfigOptions,
    createCleanContext,
    createWriteContext
  }
  logger.info('command dispatch started', {command: command.name})
  const result = await command.execute(commandCtx)
  logger.info('command dispatch complete', {
    command: command.name,
    success: result.success,
    filesAffected: result.filesAffected,
    dirsAffected: result.dirsAffected,
    ...result.message != null ? {message: result.message} : {}
  })
  if (!result.success) flushAndExit(1)
  flushOutput()
}

main().catch(error => {
  const {json} = parseRuntimeArgs(process.argv)
  if (json) {
    writeJsonFailure(error)
    flushAndExit(1)
  }
  const logger = createLogger('plugin-runtime', 'error')
  logger.error(buildUnhandledExceptionDiagnostic('plugin-runtime', error))
  flushAndExit(1)
})
