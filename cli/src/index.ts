import process from 'node:process'
import {PluginPipeline} from '@/PluginPipeline'
import userPluginConfigPromise from './plugin.config'
import {createLogger} from './plugins/plugin-shared'

export * from './Aindex'
export * from './config'
export * from './ConfigLoader'
export * from './constants'
export {
  default
} from './plugin.config'

async function main(): Promise<void> {
  const userPluginConfig = await userPluginConfigPromise
  const pipeline = new PluginPipeline(...process.argv)
  await pipeline.run(userPluginConfig)
}

main().catch((e: unknown) => {
  const logger = createLogger('main', 'error')
  logger.error('unhandled error', {error: e instanceof Error ? e.message : String(e)})
  process.exit(1)
})
