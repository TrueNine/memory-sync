import {describe, expect, it} from 'vitest'

describe('cli shell entrypoint', () => {
  it('loads the cli entrypoint module', async () => {
    const cliShell = await import('./index')
    expect(cliShell).toBeTypeOf('object')
  })
})
