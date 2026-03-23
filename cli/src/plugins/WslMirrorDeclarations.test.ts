import {describe, expect, it} from 'vitest'
import {ClaudeCodeCLIOutputPlugin} from './ClaudeCodeCLIOutputPlugin'
import {CodexCLIOutputPlugin} from './CodexCLIOutputPlugin'

describe('wSL mirror declarations', () => {
  it('declares the expected Claude host config files', async () => {
    const plugin = new ClaudeCodeCLIOutputPlugin()
    const declarations = await plugin.declareWslMirrorFiles?.({} as never)

    expect(declarations).toEqual([
      {sourcePath: '~/.claude/settings.json'},
      {sourcePath: '~/.claude/config.json'}
    ])
  })

  it('declares the expected Codex host config files', async () => {
    const plugin = new CodexCLIOutputPlugin()
    const declarations = await plugin.declareWslMirrorFiles?.({} as never)

    expect(declarations).toEqual([
      {sourcePath: '~/.codex/config.toml'},
      {sourcePath: '~/.codex/auth.json'}
    ])
  })
})
