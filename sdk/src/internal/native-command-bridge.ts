import type {MemorySyncCommandOptions, MemorySyncCommandResult} from './sdk-binding'
import {writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import process from 'node:process'

import {fileURLToPath} from 'node:url'
import {createTsFallbackMemorySyncBinding} from './sdk-binding'

export type InternalBridgeCommand = 'install' | 'dry-run' | 'clean' | 'self-test'

interface BridgeSelfTestResult {
  readonly ok: true
  readonly command: 'self-test'
}

type BridgeExecutionResult = MemorySyncCommandResult | BridgeSelfTestResult
const INTERNAL_BRIDGE_RESULT_PATH_ENV = 'TNMSC_INTERNAL_COMMAND_BRIDGE_RESULT_PATH'

function isInternalBridgeCommand(value: string): value is Exclude<InternalBridgeCommand, 'self-test'> {
  return value === 'install' || value === 'dry-run' || value === 'clean'
}

export function normalizeBridgeCommandOptions(
  optionsJson?: string
): MemorySyncCommandOptions & {readonly dryRun?: boolean} {
  return optionsJson == null || optionsJson.length === 0
    ? {}
    : JSON.parse(optionsJson) as MemorySyncCommandOptions & {readonly dryRun?: boolean}
}

export async function executeInternalBridgeCommand(
  commandArg: string,
  optionsJson?: string
): Promise<BridgeExecutionResult> {
  if (commandArg === 'self-test') {
    return {
      ok: true,
      command: 'self-test'
    }
  }

  if (!isInternalBridgeCommand(commandArg)) {
    throw new Error(`Unsupported internal bridge command: ${commandArg}`)
  }

  const binding = createTsFallbackMemorySyncBinding()
  const options = normalizeBridgeCommandOptions(optionsJson)

  switch (commandArg) {
    case 'install':
      return binding.install(options)
    case 'dry-run':
      return binding.dryRun(options)
    case 'clean':
      return binding.clean(options)
  }
}

export async function runInternalBridgeCli(argv: readonly string[] = process.argv.slice(2)): Promise<void> {
  const [commandArg = 'self-test', optionsJson] = argv
  const result = await executeInternalBridgeCommand(commandArg, optionsJson)
  const serialized = JSON.stringify(result)
  const resultPath = process.env[INTERNAL_BRIDGE_RESULT_PATH_ENV]

  if (resultPath != null && resultPath.length > 0) {
    await writeFile(resultPath, serialized, 'utf8')
    return
  }

  process.stdout.write(`${serialized}\n`)
}

function isDirectExecution(): boolean {
  const entryPath = process.argv[1]
  return entryPath != null && fileURLToPath(import.meta.url) === resolve(entryPath)
}

if (isDirectExecution()) {
  void runInternalBridgeCli().catch(error => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error)
    process.stderr.write(`${message}\n`)
    process.exitCode = 1
  })
}
