import process from 'node:process'
import { PluginPipeline } from '@/PluginPipeline'
import userPluginConfigPromise from './plugin.config'

export * from './config'
export * from './ConfigLoader'
export * from './constants'
export * from './log'
export { default } from './plugin.config'
export * from './ShadowSourceProject'

async function main(): Promise<void> {
  const userPluginConfig = await userPluginConfigPromise
  const pipeline = new PluginPipeline(...process.argv)
  await pipeline.run(userPluginConfig)
}

main().catch((e: unknown) => {
  console.error(e)
})

export * from './types'
