import type {
  Command,
  CommandContext,
  CommandResult
} from '@/commands/Command'
import * as path from 'node:path'
import process from 'node:process'
import {
  buildUnhandledExceptionDiagnostic,
  createLogger,
  FilePathKind,
  flushOutput,
  mergeConfig,
  setGlobalLogLevel
} from '@truenine/memory-sync-sdk'
import {
  extractUserArgs,
  parseArgs,
  resolveCommand
} from '@/pipeline/CliArgumentParser'
import {PluginPipeline} from '@/PluginPipeline'
import {createDefaultPluginConfig} from './plugin.config'

const LIGHTWEIGHT_COMMAND_NAMES = new Set(['help', 'version', 'unknown'])

function createEmptyProjectsBySeries(): {
  readonly app: readonly never[]
  readonly ext: readonly never[]
  readonly arch: readonly never[]
  readonly softwares: readonly never[]
} {
  return {
    app: [],
    ext: [],
    arch: [],
    softwares: []
  } as const
}

function createUnavailableContext(kind: 'cleanup' | 'write'): never {
  throw new Error(`${kind} context is unavailable for lightweight commands`)
}

function createLightweightCommandContext(
  logLevel: ReturnType<typeof parseArgs>['logLevel']
): CommandContext {
  const cwd = process.cwd()
  const workspaceDir = cwd
  const userConfigOptions = mergeConfig({
    workspaceDir,
    ...logLevel != null ? {logLevel} : {}
  })
  return {
    logger: createLogger('PluginPipeline', logLevel),
    outputPlugins: [],
    collectedOutputContext: {
      workspace: {
        directory: {
          pathKind: FilePathKind.Absolute,
          path: workspaceDir,
          getDirectoryName: () => path.basename(workspaceDir)
        },
        projects: []
      }
    },
    userConfigOptions,
    executionPlan: {
      scope: 'workspace',
      cwd,
      workspaceDir,
      projectsBySeries: createEmptyProjectsBySeries()
    },
    createCleanContext: () => createUnavailableContext('cleanup'),
    createWriteContext: () => createUnavailableContext('write')
  }
}

function resolveLightweightCommand(
  argv: readonly string[]
): {readonly command: Command, readonly context: CommandContext} | undefined {
  const parsedArgs = parseArgs(
    extractUserArgs(argv.filter((arg): arg is string => arg != null))
  )
  const command: Command = resolveCommand(parsedArgs)
  if (!LIGHTWEIGHT_COMMAND_NAMES.has(command.name)) return void 0
  if (parsedArgs.logLevel != null) setGlobalLogLevel(parsedArgs.logLevel)
  return {
    command,
    context: createLightweightCommandContext(parsedArgs.logLevel)
  }
}

export async function runCli(
  argv: readonly string[] = process.argv
): Promise<number> {
  try {
    const lightweightCommand = resolveLightweightCommand(argv)
    if (lightweightCommand != null) {
      const result: CommandResult = await lightweightCommand.command.execute(
        lightweightCommand.context
      )
      flushOutput()
      return result.success ? 0 : 1
    }

    const pipeline = new PluginPipeline(...argv)
    const userPluginConfig = await createDefaultPluginConfig(
      argv,
      void 0,
      process.cwd()
    )
    const result = await pipeline.run(userPluginConfig)
    flushOutput()
    return result.success ? 0 : 1
  } catch (error) {
    const logger = createLogger('main', 'error')
    logger.error(buildUnhandledExceptionDiagnostic('main', error))
    flushOutput()
    return 1
  }
}
