import process from 'node:process'
import {PluginPipeline} from '@/PluginPipeline'
import {createLogger} from './plugins/plugin-core'

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
  if (isJsonMode(process.argv)) {
    writeJsonFailure(errorMessage)
    process.exit(1)
  }
  const logger = createLogger('main', 'error')
  logger.error('unhandled error', {error: errorMessage})
  process.exit(1)
})

export {
  DEFAULT_USER_CONFIG,
  PathPlaceholders
} from './plugins/plugin-core'
