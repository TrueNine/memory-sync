import {resolve} from 'node:path'
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
  it('lets TypeScript resolve the script runtime package through workspace metadata', () => {
    const paths = tsconfig.compilerOptions.paths as Record<string, string[] | undefined>
    expect(paths['@truenine/script-runtime']).toBeUndefined()
  })

  it('bundles the worker against the built script runtime module', () => {
    const workerConfig = (tsdownConfig as readonly TsdownEntryConfig[]).find(config =>
      includesEntry(config, './src/script-runtime-worker.ts'))

    expect(workerConfig?.alias?.['@truenine/script-runtime']).toBe(
      resolve('../libraries/script-runtime/dist/index.mjs')
    )
    expect(workerConfig?.deps?.alwaysBundle).toEqual(expect.arrayContaining([
      '@truenine/memory-sync-sdk',
      '@truenine/script-runtime'
    ]))
    expect(workerConfig?.deps?.neverBundle).toEqual(expect.arrayContaining(['jiti']))
  })
})
