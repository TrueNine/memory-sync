import {describe, expect, it} from 'vitest'
import tsdownConfig from '../tsdown.config'

interface TsdownEntryConfig {
  readonly entry?: string | readonly string[]
  readonly define?: Record<string, string>
  readonly dts?: boolean | {readonly sourcemap?: boolean}
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
  it('includes only the shell entry point', () => {
    const configs = tsdownConfig as readonly TsdownEntryConfig[]
    const firstConfig = configs[0]
    expect(configs.length).toBe(1)
    expect(firstConfig).toBeDefined()
    if (firstConfig == null) throw new Error('Expected a tsdown config')
    expect(includesEntry(firstConfig, './src/index.ts')).toBe(true)
  })

  it('injects the published cli version into the bundle', () => {
    const configs = tsdownConfig as readonly TsdownEntryConfig[]
    expect(configs[0]?.define?.['__CLI_VERSION__']).toBeDefined()
  })

  it('does not emit declaration files into dist', () => {
    const configs = tsdownConfig as readonly TsdownEntryConfig[]
    expect(configs[0]?.dts).toBe(false)
  })

  it('keeps jiti in the never-bundle list', () => {
    const configs = tsdownConfig as readonly TsdownEntryConfig[]
    expect(configs[0]?.deps?.neverBundle).toEqual(expect.arrayContaining(['jiti']))
  })
})
