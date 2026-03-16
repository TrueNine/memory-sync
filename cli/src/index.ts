import process from 'node:process'
import {toJsonCommandResult} from '@/commands/JsonOutputCommand'
import {buildUnhandledExceptionDiagnostic} from '@/diagnostics'
import {PluginPipeline} from '@/PluginPipeline'
import {createLogger, drainBufferedDiagnostics} from './plugins/plugin-core'

export * from './Aindex'
export * from './config'
export * from './ConfigLoader'

export {
  default
} from './plugin.config'

async function main(): Promise<void> {
  const pipeline = new PluginPipeline(...process.argv)
  const {default: userPluginConfigPromise} = await import('./plugin.config')
  const userPluginConfig = await userPluginConfigPromise
  const result = await pipeline.run(userPluginConfig)
  if (!result.success) process.exit(1)
}

function isJsonMode(argv: readonly string[]): boolean {
  return argv.some(arg => arg === '--json' || arg === '-j' || /^-[^-]*j/.test(arg))
}

function writeJsonFailure(error: unknown): void {
  const errorMessage = error instanceof Error ? error.message : String(error)
  const logger = createLogger('main', 'silent')
  logger.error(buildUnhandledExceptionDiagnostic('main', error))
  process.stdout.write(`${JSON.stringify(toJsonCommandResult({
    success: false,
    filesAffected: 0,
    dirsAffected: 0,
    message: errorMessage
  }, drainBufferedDiagnostics()))}\n`)
}

main().catch((e: unknown) => {
  if (isJsonMode(process.argv)) {
    writeJsonFailure(e)
    process.exit(1)
  }
  const logger = createLogger('main', 'error')
  logger.error(buildUnhandledExceptionDiagnostic('main', e))
  process.exit(1)
})

export {
  DEFAULT_USER_CONFIG,
  PathPlaceholders
} from './plugins/plugin-core'
