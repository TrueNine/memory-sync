import process from 'node:process'
import { PluginPipeline } from '@/PluginPipeline'
import userPluginConfig from './plugin.config'

export * from './config'
export * from './constants'
export * from './log'
export * from './types'
export default userPluginConfig

async function main(): Promise<void> {
  const pipeline = new PluginPipeline(...process.argv)
  await pipeline.run(userPluginConfig)
}

main().catch((e: unknown) => {
  console.error(e)
})
