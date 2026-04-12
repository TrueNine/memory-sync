import {afterEach, describe, expect, it, vi} from 'vitest'

const defaultNativeBinding = globalThis.__TNMSC_TEST_NATIVE_BINDING__

afterEach(() => {
  globalThis.__TNMSC_TEST_NATIVE_BINDING__ = defaultNativeBinding
  delete process.env['TNMSC_DISABLE_NATIVE_COMMAND_BINDING']
  vi.resetModules()
})

describe('library entrypoint', () => {
  it('can be imported without executing the CLI runtime', async () => {
    const mod = await import('./index')

    expect(typeof mod.getMemorySyncSdkBinding).toBe('function')
  })

  it('uses the native binding when all methods are present', async () => {
    globalThis.__TNMSC_TEST_NATIVE_BINDING__ = {
      loadConfig: vi.fn(),
      install: vi.fn(),
      dryRun: vi.fn(),
      clean: vi.fn(),
      listPlugins: vi.fn(),
      listPrompts: vi.fn(),
      getPrompt: vi.fn(),
      upsertPromptSource: vi.fn(),
      writePromptArtifacts: vi.fn()
    }

    const mod = await import('./index')
    const binding = mod.getMemorySyncSdkBinding()

    expect(Object.keys(binding).sort()).toEqual([
      'clean',
      'dryRun',
      'getPrompt',
      'install',
      'listAdaptors',
      'listPrompts',
      'loadConfig',
      'upsertPromptSource',
      'writePromptArtifacts'
    ])
  })
})
