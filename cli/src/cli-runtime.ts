import type {Command, CommandContext, CommandResult} from '@/commands/Command'
import * as path from 'node:path'
import process from 'node:process'
import {
  buildUnhandledExceptionDiagnostic,
  createLogger,
  drainBufferedDiagnostics,
  FilePathKind,
  mergeConfig,
  setGlobalLogLevel
} from '@truenine/memory-sync-sdk'
import {JsonOutputCommand, toJsonCommandResult} from '@/commands/JsonOutputCommand'
import {extractUserArgs, parseArgs, resolveCommand} from '@/pipeline/CliArgumentParser'
import {PluginPipeline} from '@/PluginPipeline'
import {createDefaultPluginConfig} from './plugin.config'

const LIGHTWEIGHT_COMMAND_NAMES = new Set(['help', 'version', 'unknown'])

export function isJsonMode(argv: readonly string[]): boolean {
  return argv.some(arg => arg === '--json' || arg === '-j' || /^-[^-]*j/u.test(arg))
}

function writeJsonFailure(error: unknown): void {
  const logger = createLogger('main', 'silent')
  logger.error(buildUnhandledExceptionDiagnostic('main', error))
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

function createUnavailableContext(kind: 'cleanup' | 'write'): never {
  throw new Error(`${kind} context is unavailable for lightweight commands`)
}

function createLightweightCommandContext(logLevel: ReturnType<typeof parseArgs>['logLevel']): CommandContext {
  const workspaceDir = process.cwd()
  const userConfigOptions = mergeConfig({workspaceDir, ...logLevel != null ? {logLevel} : {}})
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
    createCleanContext: () => createUnavailableContext('cleanup'),
    createWriteContext: () => createUnavailableContext('write')
  }
}

function resolveLightweightCommand(argv: readonly string[]): {readonly command: Command, readonly context: CommandContext} | undefined {
  const parsedArgs = parseArgs(extractUserArgs(argv.filter((arg): arg is string => arg != null)))
  let command: Command = resolveCommand(parsedArgs)
  if (!LIGHTWEIGHT_COMMAND_NAMES.has(command.name)) return void 0
  if (parsedArgs.logLevel != null) setGlobalLogLevel(parsedArgs.logLevel)
  if (!parsedArgs.jsonFlag) return {command, context: createLightweightCommandContext(parsedArgs.logLevel)}

  setGlobalLogLevel('silent')
  command = new JsonOutputCommand(command)
  return {command, context: createLightweightCommandContext(parsedArgs.logLevel)}
}

export async function runCli(argv: readonly string[] = process.argv): Promise<number> {
  try {
    const lightweightCommand = resolveLightweightCommand(argv)
    if (lightweightCommand != null) {
      const result: CommandResult = await lightweightCommand.command.execute(lightweightCommand.context)
      return result.success ? 0 : 1
    }

    const pipeline = new PluginPipeline(...argv)
    const userPluginConfig = await createDefaultPluginConfig(argv)
    const result = await pipeline.run(userPluginConfig)
    return result.success ? 0 : 1
  } catch (error) {
    if (isJsonMode(argv)) {
      writeJsonFailure(error)
      return 1
    }
    const logger = createLogger('main', 'error')
    logger.error(buildUnhandledExceptionDiagnostic('main', error))
    return 1
  }
}
