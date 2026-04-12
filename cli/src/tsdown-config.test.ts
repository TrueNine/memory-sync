import {describe, expect, it} from 'vitest'
import tsconfig from '../tsconfig.json'
import tsdownConfig from '../tsdown.config'

interface TsdownEntryConfig {
  readonly entry?: string | readonly string[]
  readonly alias?: Record<string, string>
  readonly deps?: {
    readonly alwaysBundle?: readonly string[]
    readonly neverBundle?: readonly string[]
  }
}

function includesEntry(config: TsdownEntryConfig, targetEntry: string): boolean {
  if (config.entry == null) return false
  return (Array.isArray(config.entry) ? config.entry : [config.entry]).includes(targetEntry)
}

describe('cli tsdown config', () => {
  it('keeps worker bundling anchored on the sdk package only', () => {
    const paths = tsconfig.compilerOptions.paths as Record<string, string[] | undefined>
    const workerConfig = (tsdownConfig as readonly TsdownEntryConfig[]).find(config =>
      includesEntry(config, './src/script-runtime-worker.ts'))

    expect(paths['@truenine/script-runtime']).toBeUndefined()
    expect(workerConfig?.alias).toBeUndefined()
    expect(workerConfig?.deps?.alwaysBundle).toEqual(expect.arrayContaining([
      '@truenine/memory-sync-sdk'
    ]))
    expect(workerConfig?.deps?.neverBundle).toEqual(expect.arrayContaining(['jiti']))
  })
})
