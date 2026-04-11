import type {AdaptorOptions, OutputAdaptor} from './plugin'
import {describe, expect, it} from 'vitest'
import {AdaptorKind} from './enums'
import {isOutputAdaptorEnabled} from './plugin'

function createOutputAdaptor(name: string): OutputAdaptor {
  return {
    name,
    type: AdaptorKind.Output,
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

describe('isOutputAdaptorEnabled', () => {
  it('keeps git and readme enabled by default', () => {
    expect(isOutputAdaptorEnabled(createOutputAdaptor('AgentsOutputAdaptor'))).toBe(false)
    expect(isOutputAdaptorEnabled(createOutputAdaptor('CodexCLIOutputAdaptor'))).toBe(false)
    expect(isOutputAdaptorEnabled(createOutputAdaptor('GitExcludeOutputAdaptor'))).toBe(true)
    expect(isOutputAdaptorEnabled(createOutputAdaptor('ReadmeMdConfigFileOutputAdaptor'))).toBe(true)
    expect(isOutputAdaptorEnabled(createOutputAdaptor('TraeIDEOutputAdaptor'))).toBe(false)
    expect(isOutputAdaptorEnabled(createOutputAdaptor('ClaudeCodeCLIOutputAdaptor'))).toBe(false)
  })

  it('enables a plugin when the plugins config explicitly sets it to true', () => {
    const pluginOptions: AdaptorOptions = {
      plugins: {
        trae: true
      }
    }

    expect(isOutputAdaptorEnabled(createOutputAdaptor('TraeIDEOutputAdaptor'), pluginOptions)).toBe(true)
  })

  it('lets the new git key explicitly disable git output', () => {
    const pluginOptions: AdaptorOptions = {
      plugins: {
        git: false
      }
    }

    expect(isOutputAdaptorEnabled(createOutputAdaptor('GitExcludeOutputAdaptor'), pluginOptions)).toBe(false)
  })

  it('keeps opt-in plugins disabled when explicitly set to false', () => {
    const pluginOptions: AdaptorOptions = {
      plugins: {
        codex: false
      }
    }

    expect(isOutputAdaptorEnabled(createOutputAdaptor('CodexCLIOutputAdaptor'), pluginOptions)).toBe(false)
  })
})
