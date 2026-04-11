import {describe, expect, it} from 'vitest'
import * as cliShell from './index'

describe('cli shell entrypoint', () => {
  it('keeps the shell entrypoint focused on cli exports', async () => {
    expect(typeof cliShell.runCli).toBe('function')
    expect(typeof cliShell.getCliVersion).toBe('function')
  })
})
