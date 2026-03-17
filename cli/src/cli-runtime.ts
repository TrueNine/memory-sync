import process from 'node:process'
import {toJsonCommandResult} from '@/commands/JsonOutputCommand'
import {buildUnhandledExceptionDiagnostic} from '@/diagnostics'
import {PluginPipeline} from '@/PluginPipeline'
import {createDefaultPluginConfig} from './plugin.config'
import {createLogger, drainBufferedDiagnostics} from './plugins/plugin-core'

export function isJsonMode(argv: readonly string[]): boolean {
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

export async function runCli(argv: readonly string[] = process.argv): Promise<number> {
  try {
    const pipeline = new PluginPipeline(...argv)
    const userPluginConfig = await createDefaultPluginConfig(argv)
    const result = await pipeline.run(userPluginConfig)
    return result.success ? 0 : 1
  }
  catch (error) {
    if (isJsonMode(argv)) {
      writeJsonFailure(error)
      return 1
    }

    const logger = createLogger('main', 'error')
    logger.error(buildUnhandledExceptionDiagnostic('main', error))
    return 1
  }
}
