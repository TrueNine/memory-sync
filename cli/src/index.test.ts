import {listPrompts} from '@truenine/memory-sync-sdk'

import {describe, expect, it} from 'vitest'
import * as cliShell from './index'

describe('cli shell entrypoint', () => {
  it('re-exports sdk library APIs while keeping local shell exports', async () => {
    expect(typeof cliShell.runCli).toBe('function')
    expect(typeof cliShell.createDefaultPluginConfig).toBe('function')
    expect(cliShell.listPrompts).toBe(listPrompts)
  })
})
