import {describe, expect, it} from 'vitest'

describe('library entrypoint', () => {
  it('can be imported without executing the CLI runtime', async () => {
    const mod = await import('./index')

    expect(typeof mod.listPrompts).toBe('function')
    expect(typeof mod.defineConfig).toBe('function')
    expect(typeof mod.performCleanup).toBe('function')
  })
})
