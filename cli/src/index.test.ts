import {describe, expect, it} from 'vitest'

describe('library entrypoint', () => {
  it('can be imported without executing the CLI runtime', async () => {
    const mod = await import('./index')

    expect(typeof mod.runCli).toBe('function')
    expect(typeof mod.createDefaultPluginConfig).toBe('function')
    expect(typeof mod.listPrompts).toBe('function')
  })
})
