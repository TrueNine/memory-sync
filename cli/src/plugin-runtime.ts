import type {
  OutputCleanContext,
  OutputWriteContext,
  RuntimeCommand
} from '@truenine/memory-sync-sdk'
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

const INTERNAL_BRIDGE_JSON_FLAG = '--bridge-json'

function parseRuntimeArgs(argv: string[]): {
  subcommand: RuntimeCommand
  bridgeJson: boolean
  dryRun: boolean
} {
  const args = argv.slice(2)
  let subcommand: RuntimeCommand = 'execute'
  let bridgeJson = false
  let dryRun = false
  for (const arg of args) {
    if (arg === INTERNAL_BRIDGE_JSON_FLAG) bridgeJson = true
    else if (arg === '--dry-run' || arg === '-n') dryRun = true
    else if (!arg.startsWith('-')) {
      subcommand
        = arg === 'plugins' || arg === 'clean' || arg === 'dry-run'
          ? arg
          : 'execute'
    }
  }
  return {subcommand, bridgeJson, dryRun}
}

function resolveRuntimeCommand(
  subcommand: RuntimeCommand,
  dryRun: boolean
): Command {
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

function flushAndExit(code: number): never {
  flushOutput()
  process.exit(code)
}

function writeBridgeJsonFailure(error: unknown): void {
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

async function main(): Promise<void> {
  const {subcommand, bridgeJson, dryRun} = parseRuntimeArgs(process.argv)
  if (bridgeJson) setGlobalLogLevel('silent')
  const logger = createLogger('PluginRuntime')

  logger.debug('Runtime bootstrap ready', {subcommand, bridgeJson, dryRun})

  const userPluginConfig = await createDefaultPluginConfig(
    process.argv,
    subcommand,
    process.cwd()
  )
  let command = resolveRuntimeCommand(subcommand, dryRun)
  if (bridgeJson && command.name !== 'plugins') {
    command = new JsonOutputCommand(command)
  }

  const {context, outputPlugins, userConfigOptions, executionPlan}
    = userPluginConfig
  logger.debug('Runtime configuration resolved', {
    command: command.name,
    plugins: outputPlugins.length,
    projects: context.workspace.projects.length,
    workspace: context.workspace.directory.path,
    ...context.aindexDir != null ? {aindexDir: context.aindexDir} : {}
  })
  const runtimeTargets = discoverOutputRuntimeTargets(logger)
  logger.debug('Runtime targets discovered', {
    command: command.name,
    jetbrainsCodexDirs: runtimeTargets.jetbrainsCodexDirs.length
  })
  const createCleanContext = (dry: boolean): OutputCleanContext => ({
    logger,
    collectedOutputContext: context,
    pluginOptions: userConfigOptions,
    runtimeTargets,
    executionPlan,
    dryRun: dry
  })
  const createWriteContext = (dry: boolean): OutputWriteContext => ({
    logger,
    collectedOutputContext: context,
    pluginOptions: userConfigOptions,
    runtimeTargets,
    executionPlan,
    dryRun: dry,
    registeredPluginNames: Array.from(outputPlugins, plugin => plugin.name)
  })
  const commandCtx: CommandContext = {
    logger,
    outputPlugins: [...outputPlugins],
    collectedOutputContext: context,
    userConfigOptions,
    executionPlan,
    createCleanContext,
    createWriteContext
  }
  logger.debug('Dispatching command', {command: command.name})
  const result = await command.execute(commandCtx)
  logger.debug('Command finished', {
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
  if (parseRuntimeArgs(process.argv).bridgeJson) {
    writeBridgeJsonFailure(error)
    flushAndExit(1)
  }
  const logger = createLogger('plugin-runtime', 'error')
  logger.error(buildUnhandledExceptionDiagnostic('plugin-runtime', error))
  flushAndExit(1)
})
