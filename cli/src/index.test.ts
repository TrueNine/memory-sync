import {
  createDefaultPluginConfig,
  listPrompts,
  runCli
} from '@truenine/memory-sync-sdk'

import {describe, expect, it} from 'vitest'
import * as cliShell from './index'

describe('cli shell entrypoint', () => {
  it('re-exports the sdk surface without executing the CLI runtime', async () => {
    expect(cliShell.runCli).toBe(runCli)
    expect(cliShell.createDefaultPluginConfig).toBe(createDefaultPluginConfig)
    expect(cliShell.listPrompts).toBe(listPrompts)
  })
})
