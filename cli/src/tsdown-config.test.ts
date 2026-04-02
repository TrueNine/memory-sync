import {describe, expect, it} from 'vitest'
import tsconfig from '../tsconfig.json'
import tsdownConfig from '../tsdown.config'

interface TsdownEntryConfig {
  readonly entry?: string | readonly string[]
  readonly deps?: {
    readonly alwaysBundle?: readonly string[]
  }
}

function includesEntry(config: TsdownEntryConfig, targetEntry: string): boolean {
  if (config.entry == null) return false
  return (Array.isArray(config.entry) ? config.entry : [config.entry]).includes(targetEntry)
}

describe('cli tsdown config', () => {
  it('resolves the script runtime package to the built runtime module', () => {
    expect(tsconfig.compilerOptions.paths['@truenine/script-runtime']).toEqual([
      '../libraries/script-runtime/dist/index.mjs'
    ])
  })

  it('bundles script runtime dependencies into the script runtime worker artifact', () => {
    const workerConfig = (tsdownConfig as readonly TsdownEntryConfig[]).find(config =>
      includesEntry(config, './src/script-runtime-worker.ts'))

    expect(workerConfig?.deps?.alwaysBundle).toEqual(expect.arrayContaining([
      '@truenine/script-runtime',
      'jiti'
    ]))
  })
})
