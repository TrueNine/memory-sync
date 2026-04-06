import type {OutputPlugin, PluginOptions} from './plugin'
import {describe, expect, it} from 'vitest'
import {PluginKind} from './enums'
import {isOutputPluginEnabled} from './plugin'

function createOutputPlugin(name: string): OutputPlugin {
  return {
    name,
    type: PluginKind.Output,
    log: {
      trace: () => {},
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
      fatal: () => {}
    },
    declarativeOutput: true,
    outputCapabilities: {},
    async declareOutputFiles() {
      return []
    },
    async convertContent() {
      return ''
    }
  }
}

describe('isOutputPluginEnabled', () => {
  it('keeps git and readme enabled by default', () => {
    expect(isOutputPluginEnabled(createOutputPlugin('AgentsOutputPlugin'))).toBe(false)
    expect(isOutputPluginEnabled(createOutputPlugin('CodexCLIOutputPlugin'))).toBe(false)
    expect(isOutputPluginEnabled(createOutputPlugin('GitExcludeOutputPlugin'))).toBe(true)
    expect(isOutputPluginEnabled(createOutputPlugin('ReadmeMdConfigFileOutputPlugin'))).toBe(true)
    expect(isOutputPluginEnabled(createOutputPlugin('TraeIDEOutputPlugin'))).toBe(false)
    expect(isOutputPluginEnabled(createOutputPlugin('ClaudeCodeCLIOutputPlugin'))).toBe(false)
  })

  it('enables a plugin when the plugins config explicitly sets it to true', () => {
    const pluginOptions: PluginOptions = {
      plugins: {
        trae: true
      }
    }

    expect(isOutputPluginEnabled(createOutputPlugin('TraeIDEOutputPlugin'), pluginOptions)).toBe(true)
  })

  it('lets the new git key explicitly disable git output', () => {
    const pluginOptions: PluginOptions = {
      plugins: {
        git: false
      }
    }

    expect(isOutputPluginEnabled(createOutputPlugin('GitExcludeOutputPlugin'), pluginOptions)).toBe(false)
  })

  it('keeps opt-in plugins disabled when explicitly set to false', () => {
    const pluginOptions: PluginOptions = {
      plugins: {
        codex: false
      }
    }

    expect(isOutputPluginEnabled(createOutputPlugin('CodexCLIOutputPlugin'), pluginOptions)).toBe(false)
  })
})
